import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keccak256 } from 'viem';
import { ExecutionStore, ManualExecution, type ExecutionAdapter, type ExecutionIntent, type ExecutionAttempt } from '../../server/execution.js';

const BUY: ExecutionIntent = { id: 'manual-buy-v1', kind: 'buy', pairId: 1, amount: 100_000_000_000_000_000n };
const RAW = '0x1234';
const HASH = keccak256(RAW);
const stores: ExecutionStore[] = [];
const paths: string[] = [];
function store(path = ':memory:') { const value = new ExecutionStore(path); stores.push(value); return value; }
function adapter(): ExecutionAdapter {
  return {
    prepare: vi.fn(async () => ({ nonce: 0, transaction: { value: BUY.amount }, balanceNative: 10n ** 19n,
      maximumGasNative: 10n ** 15n, before: { blockNumber: 10n, synthBalance: 0n } })),
    sign: vi.fn(async () => ({ raw: RAW as `0x${string}`, hash: HASH })), verifySigned: vi.fn(async () => {}),
    refreshForBroadcast: vi.fn(async () => {}),
    broadcast: vi.fn(async () => HASH),
    inspect: vi.fn(async () => ({ status: 'confirmed' as const, evidence: { hash: HASH, nonce: 0 }, outputAmount: 123n })),
  };
}
afterEach(() => {
  for (const value of stores.splice(0)) if (value.database.open) value.close();
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('manual transaction execution', () => {
  it('persists reservation before sign, signed identity before broadcast, and verified buy output', async () => {
    const database = store(); const chain = adapter();
    chain.sign = vi.fn(async (_, key) => {
      const attempt = database.get(BUY.id)!;
      expect(attempt.status).toBe('preparing');
      expect(attempt.idempotencyKey).toBe(key);
      expect(attempt.intent.amount).toBe(BUY.amount);
      expect(attempt.prepared.nonce).toBe(0);
      return { raw: RAW as `0x${string}`, hash: HASH };
    });
    chain.broadcast = vi.fn(async raw => {
      const attempt = database.get(BUY.id)!;
      expect(attempt.status).toBe('signed');
      expect(attempt.signed).toEqual({ raw, hash: HASH });
      return HASH;
    });
    const engine = new ManualExecution(database, chain, () => new Date('2026-09-12T22:01:00Z'));
    const result = await engine.execute(BUY);
    expect(result.status).toBe('confirmed');
    expect(result.budgetDay).toBe('2026-09-13');
    expect(result.outputAmount).toBe(123n);
    expect(await engine.execute(BUY)).toEqual(result);
    expect(chain.sign).toHaveBeenCalledTimes(1);
    expect(chain.broadcast).toHaveBeenCalledTimes(1);
    await expect(engine.execute({ ...BUY, id: 'duplicate' })).rejects.toThrow('One-shot');
    await expect(engine.execute({ ...BUY, amount: BUY.amount + 1n })).rejects.toThrow('different intent');
  });

  it('redeems only the exact verified resulting tokens and preserves reserve for gas', async () => {
    const database = store(); const chain = adapter(); const engine = new ManualExecution(database, chain);
    await engine.execute(BUY);
    const redeem: ExecutionIntent = { id: 'manual-redeem-v1', kind: 'redeem', pairId: 1, amount: 123n, buyAttemptId: BUY.id };
    await expect(engine.execute({ ...redeem, amount: 122n })).rejects.toThrow('exact verified output');
    chain.prepare = vi.fn(async () => ({ nonce: 1, transaction: {}, before: {}, balanceNative: 10n ** 18n, maximumGasNative: 1n }));
    await expect(engine.execute(redeem)).rejects.toThrow('Insufficient reserve');
    expect(chain.sign).toHaveBeenCalledTimes(1);
    chain.prepare = vi.fn(async () => ({ nonce: 1, transaction: {}, before: {}, balanceNative: 10n ** 19n, maximumGasNative: 1n }));
    expect((await engine.execute(redeem)).status).toBe('confirmed');
    await expect(engine.execute({ ...redeem, id: 'duplicate-redeem' })).rejects.toThrow('already used');
    expect(chain.sign).toHaveBeenCalledTimes(2);
  });

  it('rejects insufficient reserve and values outside explicit authorization before signing', async () => {
    const database = store(); const chain = adapter(); const engine = new ManualExecution(database, chain);
    await expect(engine.execute({ ...BUY, amount: 1n })).rejects.toThrow('Only the authorized');
    chain.prepare = vi.fn(async () => ({ nonce: 0, transaction: {}, before: {}, balanceNative: BUY.amount + 10n ** 18n, maximumGasNative: 1n }));
    await expect(engine.execute(BUY)).rejects.toThrow('Insufficient reserve');
    expect(chain.sign).not.toHaveBeenCalled();
    expect(database.list()).toHaveLength(0);
  });

  it('retains uncertain signing reservation and never retries automatically', async () => {
    const database = store(); const chain = adapter(); const engine = new ManualExecution(database, chain);
    chain.sign = vi.fn(async () => { throw new Error('transport timeout'); });
    expect((await engine.execute(BUY)).status).toBe('uncertain');
    expect(database.get(BUY.id)?.signed).toBeUndefined();
    expect((await engine.reconcile(BUY.id)).status).toBe('uncertain');
    await engine.execute(BUY);
    await expect(engine.execute({ ...BUY, id: 'new-attempt' })).rejects.toThrow('Unresolved transaction');
    expect(chain.sign).toHaveBeenCalledTimes(1);
    expect(chain.broadcast).not.toHaveBeenCalled();
  });

  it('persists invalid signed identity but never broadcasts it', async () => {
    const database = store(); const chain = adapter(); const engine = new ManualExecution(database, chain);
    chain.verifySigned = vi.fn(async () => { throw new Error('wrong nonce or signer'); });
    const result = await engine.execute(BUY);
    expect(result.status).toBe('uncertain');
    expect(database.get(BUY.id)?.signed?.raw).toBe(RAW);
    expect(chain.broadcast).not.toHaveBeenCalled();
    expect((await engine.reconcile(BUY.id)).status).toBe('uncertain');
    expect(chain.inspect).not.toHaveBeenCalled();
  });

  it('recovers broadcast timeout by read-only receipt reconciliation after reopening SQLite', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'turtle-execution-')); paths.push(directory);
    const path = join(directory, 'execution.sqlite');
    const database = store(path); const chain = adapter();
    chain.broadcast = vi.fn(async () => { throw new Error('RPC timeout after acceptance'); });
    expect((await new ManualExecution(database, chain).execute(BUY)).status).toBe('uncertain');
    database.close();
    const resumed = store(path); const nextChain = adapter(); const engine = new ManualExecution(resumed, nextChain);
    expect(resumed.get(BUY.id)?.prepared.before.blockNumber).toBe(10n);
    expect((await engine.reconcile(BUY.id)).status).toBe('confirmed');
    expect(nextChain.sign).not.toHaveBeenCalled();
    expect(nextChain.broadcast).not.toHaveBeenCalled();
    expect(chain.broadcast).toHaveBeenCalledTimes(1);
  });

  it('keeps signed transactions unbroadcast after restart and blocks next-day exposure', async () => {
    const database = store(); const chain = adapter();
    const attempt: ExecutionAttempt = { intent: BUY, prepared: await chain.prepare(BUY), signed: { raw: RAW as `0x${string}`, hash: HASH },
      status: 'signed', budgetDay: '2026-09-11', idempotencyKey: 'saved' };
    database.save(attempt, true);
    chain.inspect = vi.fn(async () => ({ status: 'pending' as const }));
    const engine = new ManualExecution(database, chain, () => new Date('2026-09-13T12:00:00Z'));
    expect((await engine.reconcile(BUY.id)).status).toBe('uncertain');
    await expect(engine.execute({ ...BUY, id: 'next-day' })).rejects.toThrow('Unresolved transaction');
    expect(chain.sign).not.toHaveBeenCalled(); expect(chain.broadcast).not.toHaveBeenCalled();
  });

  it('serializes preparation across separate SQLite connections so no duplicate nonce is requested', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'turtle-execution-')); paths.push(directory);
    const path = join(directory, 'execution.sqlite');
    const first = store(path); const second = store(path); const chain = adapter();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const prepared = await chain.prepare(BUY);
    chain.prepare = vi.fn(async () => { await gate; return prepared; });
    const firstResult = new ManualExecution(first, chain).execute(BUY);
    await expect(new ManualExecution(second, adapter()).execute(BUY)).rejects.toThrow('Another execution worker');
    release();
    expect((await firstResult).status).toBe('confirmed');
    expect(chain.prepare).toHaveBeenCalledTimes(1);
    expect(chain.broadcast).toHaveBeenCalledTimes(1);
  });

  it('records verified revert and forbids redeeming unminted tokens', async () => {
    const database = store(); const chain = adapter();
    chain.inspect = vi.fn(async () => ({ status: 'reverted' as const, evidence: { hash: HASH, gasUsed: 123n } }));
    const engine = new ManualExecution(database, chain);
    expect((await engine.execute(BUY)).status).toBe('reverted');
    await expect(engine.execute({ id: 'redeem', kind: 'redeem', pairId: 1, amount: 123n, buyAttemptId: BUY.id })).rejects.toThrow('confirmed buy');
    expect(chain.sign).toHaveBeenCalledTimes(1);
  });

  it('does not claim success when receipt verification fails or omits expected token output', async () => {
    const database = store(); const chain = adapter();
    chain.inspect = vi.fn(async () => ({ status: 'confirmed' as const, evidence: { hash: HASH } }));
    const engine = new ManualExecution(database, chain);
    expect((await engine.execute(BUY)).status).toBe('uncertain');
    chain.inspect = vi.fn(async () => { throw new Error('receipt nonce or event identity mismatch'); });
    expect((await engine.reconcile(BUY.id)).status).toBe('uncertain');
    expect(chain.broadcast).toHaveBeenCalledTimes(1);
  });
  it('explicitly broadcasts only saved bytes after inspection and fresh validation without signing', async () => {
    const database = store(); const chain = adapter();
    const prepared = await chain.prepare(BUY);
    vi.mocked(chain.prepare).mockClear();
    database.save({ intent: BUY, prepared, signed: { raw: RAW, hash: HASH }, status: 'uncertain',
      budgetDay: '2026-09-12', idempotencyKey: 'existing-key' }, true);
    const order: string[] = [];
    let reads = 0;
    chain.inspect = vi.fn(async () => {
      order.push('inspect');
      return reads++ === 0 ? { status: 'pending' as const } :
        { status: 'confirmed' as const, evidence: { hash: HASH }, outputAmount: 123n };
    });
    chain.refreshForBroadcast = vi.fn(async attempt => {
      order.push('refresh');
      expect(attempt.prepared).toEqual(prepared);
    });
    chain.broadcast = vi.fn(async raw => { order.push('broadcast'); expect(raw).toBe(RAW); return HASH; });
    const engine = new ManualExecution(database, chain);
    expect((await engine.broadcastSaved(BUY.id)).status).toBe('confirmed');
    expect(order).toEqual(['inspect', 'refresh', 'broadcast', 'inspect']);
    expect(database.get(BUY.id)?.idempotencyKey).toBe('existing-key');
    expect(chain.sign).not.toHaveBeenCalled(); expect(chain.prepare).not.toHaveBeenCalled();
    await engine.broadcastSaved(BUY.id);
    expect(chain.broadcast).toHaveBeenCalledTimes(1);
  });

  it('does not broadcast a saved transaction when current chain or policy validation fails', async () => {
    const database = store(); const chain = adapter();
    database.save({ intent: BUY, prepared: await chain.prepare(BUY), signed: { raw: RAW, hash: HASH },
      status: 'signed', budgetDay: '2026-09-12', idempotencyKey: 'existing' }, true);
    chain.inspect = vi.fn(async () => ({ status: 'pending' as const }));
    chain.refreshForBroadcast = vi.fn(async () => { throw new Error('Nonce consumed or policy changed'); });
    const result = await new ManualExecution(database, chain).broadcastSaved(BUY.id);
    expect(result.status).toBe('uncertain'); expect(result.signed).toEqual({ raw: RAW, hash: HASH });
    expect(chain.broadcast).not.toHaveBeenCalled(); expect(chain.sign).not.toHaveBeenCalled();
  });

  it.each(['confirmed', 'reverted'] as const)('reconciles known %s receipt without another broadcast', async status => {
    const database = store(); const chain = adapter();
    database.save({ intent: BUY, prepared: await chain.prepare(BUY), signed: { raw: RAW, hash: HASH },
      status: 'uncertain', budgetDay: '2026-09-12', idempotencyKey: 'existing' }, true);
    chain.inspect = vi.fn(async () => ({ status, evidence: { hash: HASH }, outputAmount: 123n }));
    expect((await new ManualExecution(database, chain).broadcastSaved(BUY.id)).status).toBe(status);
    expect(chain.refreshForBroadcast).not.toHaveBeenCalled();
    expect(chain.broadcast).not.toHaveBeenCalled(); expect(chain.sign).not.toHaveBeenCalled();
  });

  it('rejects missing signatures and conflicting outstanding attempts before broadcasting', async () => {
    const database = store(); const chain = adapter(); const prepared = await chain.prepare(BUY);
    const saved: ExecutionAttempt = { intent: BUY, prepared, status: 'uncertain', budgetDay: '2026-09-12', idempotencyKey: 'existing' };
    database.save(saved, true);
    const engine = new ManualExecution(database, chain);
    await expect(engine.broadcastSaved(BUY.id)).rejects.toThrow('No saved signed');
    saved.signed = { raw: RAW, hash: HASH }; database.save(saved);
    database.save({ ...saved, intent: { ...BUY, id: 'other' }, prepared: { ...prepared, nonce: 1 } }, true);
    await expect(engine.broadcastSaved(BUY.id)).rejects.toThrow('Another unresolved');
    expect(chain.broadcast).not.toHaveBeenCalled(); expect(chain.sign).not.toHaveBeenCalled();
  });

  it('rejects refresh mutation and retains the original durable transaction', async () => {
    const database = store(); const chain = adapter(); const prepared = await chain.prepare(BUY);
    database.save({ intent: BUY, prepared, signed: { raw: RAW, hash: HASH },
      status: 'uncertain', budgetDay: '2026-09-12', idempotencyKey: 'existing' }, true);
    chain.inspect = vi.fn(async () => ({ status: 'pending' as const }));
    chain.refreshForBroadcast = vi.fn(async attempt => { attempt.prepared.nonce = 999; });
    const result = await new ManualExecution(database, chain).broadcastSaved(BUY.id);
    expect(result.status).toBe('uncertain'); expect(result.prepared.nonce).toBe(0);
    expect(database.get(BUY.id)?.prepared.nonce).toBe(0);
    expect(chain.broadcast).not.toHaveBeenCalled();
  });

});
