import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { keccak256, type Hex } from 'viem';
import { checkBudget, madridDay, NATIVE_PER_MICRO, RESERVE_NATIVE } from './money.js';

export type ExecutionIntent = {
  id: string; kind: 'buy' | 'redeem'; pairId: 1; amount: bigint; buyAttemptId?: string;
};
export type PreparedExecution = {
  nonce: number; transaction: Record<string, unknown>; balanceNative: bigint;
  maximumGasNative: bigint; before: Record<string, unknown>;
};
export type SignedExecution = { raw: Hex; hash: Hex };
export type ExecutionStatus = 'preparing' | 'signed' | 'submitted' | 'confirmed' | 'reverted' | 'needs_retry' | 'uncertain';
export type ExecutionAttempt = {
  intent: ExecutionIntent; prepared: PreparedExecution; status: ExecutionStatus;
  budgetDay: string; idempotencyKey: string; signed?: SignedExecution;
  evidence?: Record<string, unknown>; outputAmount?: bigint; reason?: string;
};
export type Inspection = {
  status: 'pending' | 'confirmed' | 'reverted'; evidence?: Record<string, unknown>; outputAmount?: bigint;
};
export interface ExecutionAdapter {
  prepare(intent: ExecutionIntent): Promise<PreparedExecution>;
  sign(prepared: PreparedExecution, idempotencyKey: string): Promise<SignedExecution>;
  verifySigned(prepared: PreparedExecution, signed: SignedExecution): Promise<void>;
  refreshForBroadcast(attempt: ExecutionAttempt): Promise<void>;
  broadcast(raw: Hex): Promise<Hex>;
  inspect(attempt: ExecutionAttempt): Promise<Inspection>;
}

const encode = (value: unknown) => JSON.stringify(value, (_, item) =>
  typeof item === 'bigint' ? { $bigint: item.toString() } : item);
const decode = <T>(value: string): T => JSON.parse(value, (_, item) =>
  item && typeof item === 'object' && Object.keys(item).length === 1 && typeof item.$bigint === 'string'
    ? BigInt(item.$bigint) : item);
const outstanding = (attempt: ExecutionAttempt) => ['preparing', 'signed', 'submitted', 'uncertain'].includes(attempt.status);

export class ExecutionStore {
  readonly database: Database.Database;
  private readonly owner = randomUUID();
  constructor(path: string) {
    this.database = new Database(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = FULL');
    this.database.pragma('busy_timeout = 5000');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS manual_attempts (
        id TEXT PRIMARY KEY, nonce INTEGER NOT NULL UNIQUE, kind TEXT NOT NULL,
        buy_attempt_id TEXT UNIQUE, record TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS manual_execution_lock (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1), owner TEXT NOT NULL, pid INTEGER NOT NULL
      );
    `);
  }
  get(id: string): ExecutionAttempt | undefined {
    const row = this.database.prepare('SELECT record FROM manual_attempts WHERE id = ?').get(id) as { record: string } | undefined;
    return row ? decode<ExecutionAttempt>(row.record) : undefined;
  }
  list(): ExecutionAttempt[] {
    return (this.database.prepare('SELECT record FROM manual_attempts ORDER BY rowid').all() as { record: string }[])
      .map(row => decode<ExecutionAttempt>(row.record));
  }
  save(attempt: ExecutionAttempt, insert = false): void {
    if (insert) this.database.prepare('INSERT INTO manual_attempts VALUES (?, ?, ?, ?, ?)').run(
      attempt.intent.id, attempt.prepared.nonce, attempt.intent.kind, attempt.intent.buyAttemptId ?? null, encode(attempt));
    else this.database.prepare('UPDATE manual_attempts SET record = ? WHERE id = ?').run(encode(attempt), attempt.intent.id);
  }
  acquire(): void {
    this.database.transaction(() => {
      const lock = this.database.prepare('SELECT owner, pid FROM manual_execution_lock').get() as { owner: string; pid: number } | undefined;
      if (lock) {
        // A dead process can no longer sign or broadcast. PID reuse fails closed.
        try { process.kill(lock.pid, 0); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
            this.database.prepare('DELETE FROM manual_execution_lock WHERE owner = ?').run(lock.owner);
          } else throw new Error('Execution lock owner cannot be verified');
        }
        if (this.database.prepare('SELECT 1 FROM manual_execution_lock').get()) throw new Error('Another execution worker holds the wallet lock');
      }
      this.database.prepare('INSERT INTO manual_execution_lock VALUES (1, ?, ?)').run(this.owner, process.pid);
    }).immediate();
  }
  release(): void { this.database.prepare('DELETE FROM manual_execution_lock WHERE owner = ?').run(this.owner); }
  close(): void { this.database.close(); }
}

export class ManualExecution {
  constructor(private readonly store: ExecutionStore, private readonly adapter: ExecutionAdapter,
    private readonly now: () => Date = () => new Date()) {}

  async execute(intent: ExecutionIntent): Promise<ExecutionAttempt> {
    this.store.acquire();
    try {
      const existing = this.store.get(intent.id);
      if (existing) {
        if (encode(existing.intent) !== encode(intent)) throw new Error('Attempt ID already has a different intent');
        return existing;
      }
      if (!intent.id || !['buy', 'redeem'].includes(intent.kind) || intent.pairId !== 1 || intent.amount <= 0n) throw new Error('Invalid manual execution intent');
      const attempts = this.store.list();
      if (attempts.some(outstanding)) throw new Error('Unresolved transaction blocks new execution');
      if (intent.kind === 'buy') {
        if (intent.amount !== 100_000_000_000_000_000n || intent.buyAttemptId) throw new Error('Only the authorized 0.10 test USDC buy is allowed');
        if (attempts.some(item => item.intent.kind === 'buy')) throw new Error('One-shot buy authorization already used');
      } else {
        const buy = intent.buyAttemptId ? this.store.get(intent.buyAttemptId) : undefined;
        if (!buy || buy.intent.kind !== 'buy' || buy.status !== 'confirmed' || !buy.outputAmount || buy.outputAmount !== intent.amount) {
          throw new Error('Redeem must match the exact verified output of a confirmed buy');
        }
        if (attempts.some(item => item.intent.buyAttemptId === intent.buyAttemptId)) throw new Error('Redemption authorization already used');
      }
      const prepared = await this.adapter.prepare(intent);
      if (!Number.isSafeInteger(prepared.nonce) || prepared.nonce < 0 || prepared.maximumGasNative < 0n || prepared.balanceNative < 0n) {
        throw new Error('Invalid prepared transaction');
      }
      const budgetDay = madridDay(this.now());
      if (intent.kind === 'buy') {
        const spentTodayMicro = attempts.filter(item => item.intent.kind === 'buy' && item.status === 'confirmed' && item.budgetDay === budgetDay)
          .reduce((sum, item) => sum + item.intent.amount / NATIVE_PER_MICRO, 0n);
        checkBudget({ principalMicro: intent.amount / NATIVE_PER_MICRO, maximumGasNative: prepared.maximumGasNative,
          balanceNative: prepared.balanceNative, spentTodayMicro,
          reservations: attempts.filter(outstanding).map(item => ({ principalMicro: item.intent.kind === 'buy' ? item.intent.amount / NATIVE_PER_MICRO : 0n,
            maximumGasNative: item.prepared.maximumGasNative, budgetDay: item.budgetDay, uncertain: true })) });
      } else if (prepared.balanceNative - prepared.maximumGasNative < RESERVE_NATIVE) {
        throw new Error('Insufficient reserve after maximum gas');
      }
      const attempt: ExecutionAttempt = { intent, prepared, status: 'preparing', budgetDay, idempotencyKey: randomUUID() };
      this.store.save(attempt, true);
      let phase = 'Signing';
      try {
        const signed = await this.adapter.sign(prepared, attempt.idempotencyKey);
        // Persist returned bytes before checking them. A rejected signature stays private and cannot be broadcast.
        attempt.signed = { raw: signed.raw, hash: keccak256(signed.raw) };
        attempt.status = 'signed';
        this.store.save(attempt);
        phase = 'Signed transaction verification';
        if (attempt.signed.hash.toLowerCase() !== signed.hash.toLowerCase()) throw new Error('Signer hash mismatch');
        await this.adapter.verifySigned(prepared, attempt.signed);
        phase = 'Broadcast';
        const hash = await this.adapter.broadcast(attempt.signed.raw);
        if (hash.toLowerCase() !== attempt.signed.hash.toLowerCase()) throw new Error('Broadcast hash mismatch');
        attempt.status = 'submitted';
        this.store.save(attempt);
        phase = 'Receipt verification';
        return await this.inspect(attempt);
      } catch {
        attempt.status = 'uncertain';
        attempt.reason = `${phase} did not complete; explicit reconciliation required`;
        this.store.save(attempt);
        return attempt;
      }
    } finally { this.store.release(); }
  }

  async broadcastSaved(id: string): Promise<ExecutionAttempt> {
    this.store.acquire();
    try {
      const attempt = this.store.get(id);
      if (!attempt) throw new Error('Unknown execution attempt');
      if (attempt.status === 'confirmed' || attempt.status === 'reverted') return attempt;
      if (!outstanding(attempt) || !attempt.signed) throw new Error('No saved signed transaction available for explicit broadcast');
      if (this.store.list().some(item => item.intent.id !== id && outstanding(item))) {
        throw new Error('Another unresolved transaction blocks explicit broadcast');
      }
      let phase = 'Saved signature verification';
      try {
        await this.adapter.verifySigned(attempt.prepared, attempt.signed);
        phase = 'Receipt reconciliation before explicit broadcast';
        const reconciled = await this.inspect(attempt);
        if (reconciled.status === 'confirmed' || reconciled.status === 'reverted') return reconciled;
        const immutable = encode({ intent: attempt.intent, prepared: attempt.prepared, signed: attempt.signed });
        phase = 'Current chain and policy validation before explicit broadcast';
        await this.adapter.refreshForBroadcast(attempt);
        if (immutable !== encode({ intent: attempt.intent, prepared: attempt.prepared, signed: attempt.signed })) {
          throw new Error('Saved transaction changed during validation');
        }
        phase = 'Explicit saved-byte broadcast';
        const hash = await this.adapter.broadcast(attempt.signed.raw);
        if (hash.toLowerCase() !== attempt.signed.hash.toLowerCase()) throw new Error('Broadcast hash mismatch');
        attempt.status = 'submitted';
        this.store.save(attempt);
        phase = 'Receipt verification after explicit broadcast';
        return await this.inspect(attempt);
      } catch {
        // Reload the durable identity so even a faulty refresh cannot alter the reservation or signed bytes.
        const retained = this.store.get(id)!;
        retained.status = 'uncertain';
        retained.reason = `${phase} did not complete; explicit reconciliation required`;
        this.store.save(retained);
        return retained;
      }
    } finally { this.store.release(); }
  }

  async reconcile(id: string): Promise<ExecutionAttempt> {
    this.store.acquire();
    try {
      const attempt = this.store.get(id);
      if (!attempt) throw new Error('Unknown execution attempt');
      if (!outstanding(attempt)) return attempt;
      if (!attempt.signed) {
        attempt.status = 'uncertain';
        attempt.reason = 'Signature outcome unknown; provider reconciliation required before any new execution';
        this.store.save(attempt);
        return attempt;
      }
      try {
        await this.adapter.verifySigned(attempt.prepared, attempt.signed);
        return await this.inspect(attempt);
      } catch {
        attempt.status = 'uncertain';
        attempt.reason = 'Receipt or signature identity remains unresolved';
        this.store.save(attempt);
        return attempt;
      }
    } finally { this.store.release(); }
  }

  private async inspect(attempt: ExecutionAttempt): Promise<ExecutionAttempt> {
    const result = await this.adapter.inspect(attempt);
    if (result.status === 'pending') {
      attempt.status = 'uncertain';
      attempt.reason = 'No verified receipt; reservation retained and no automatic rebroadcast';
    } else {
      if (!result.evidence || (result.status === 'confirmed' && attempt.intent.kind === 'buy' && (!result.outputAmount || result.outputAmount <= 0n))) {
        throw new Error('Receipt verification omitted evidence or bought token amount');
      }
      attempt.status = result.status;
      attempt.evidence = result.evidence;
      attempt.outputAmount = result.outputAmount;
      delete attempt.reason;
    }
    this.store.save(attempt);
    return attempt;
  }
}
