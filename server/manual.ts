import { existsSync, readFileSync, mkdirSync, openSync, closeSync, unlinkSync, writeFileSync, renameSync, fsyncSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ExecutionStore, ManualExecution, type ExecutionAttempt } from './execution.js';
import { ManualArcAdapter } from './manual-arc.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const buyId = 'authorized-2026-09-12-apple-buy-0.10-v1';
const redeemId = 'authorized-2026-09-12-apple-redeem-v1';
const json = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
function persist(name: string, value: unknown) {
  const path = resolve(root, 'data', name), temporary = `${path}.tmp`;
  writeFileSync(temporary, json(value), { mode: 0o600 });
  const file = openSync(temporary, 'r'); fsyncSync(file); closeSync(file);
  renameSync(temporary, path);
  const directory = openSync(resolve(root, 'data'), 'r'); fsyncSync(directory); closeSync(directory);
}
function publicAttempt(attempt: ExecutionAttempt) {
  return { id: attempt.intent.id, kind: attempt.intent.kind, amount: attempt.intent.amount,
    status: attempt.status, hash: attempt.signed?.hash, nonce: attempt.prepared.nonce,
    maximumGasNative: attempt.prepared.maximumGasNative, outputAmount: attempt.outputAmount,
    reason: attempt.reason, evidence: attempt.evidence };
}
async function main() {
  process.umask(0o077);
  const command = process.argv[2];
  if (!['preflight', 'prepare', 'buy', 'redeem', 'reconcile', 'broadcast-saved', 'status'].includes(command ?? '')) throw new Error('Use preflight, prepare, buy, redeem, reconcile, broadcast-saved, or status');
  loadEnvFile(resolve(root, '.env'));
  mkdirSync(resolve(root, 'data'), { recursive: true, mode: 0o700 });
  // Share the provisioning spike lock as well as the engine's durable wallet lock.
  const lock = resolve(root, 'spikes/privy-arc/.private/lock');
  let locked = false;
  let store: ExecutionStore | undefined;
  try {
    const handle = openSync(lock, 'wx', 0o600); locked = true;
    try { writeFileSync(handle, json({ pid: process.pid, command, startedAt: new Date().toISOString() })); fsyncSync(handle); }
    finally { closeSync(handle); }
    const adapter = new ManualArcAdapter(root);
    if (command === 'preflight') {
      const result = await adapter.preflight(); persist('manual-preflight.json', result); console.log(json(result)); return;
    }
    if (command === 'prepare') {
      const result = await adapter.prepare({ id: buyId, kind: 'buy', pairId: 1, amount: 100_000_000_000_000_000n });
      persist('manual-preparation.json', result); console.log(json(result)); return;
    }
    store = new ExecutionStore(resolve(root, 'data/execution.sqlite'));
    const engine = new ManualExecution(store, adapter);
    if (command === 'status') { console.log(json(store.list().map(publicAttempt))); return; }
    if (command === 'reconcile') {
      const id = process.argv[3];
      if (id !== buyId && id !== redeemId) throw new Error('Reconcile requires the saved authorized attempt ID');
      const result = await engine.reconcile(id);
      persist('manual-roundtrip.json', store.list().map(publicAttempt)); console.log(json(publicAttempt(result)));
      if (result.status !== 'confirmed') process.exitCode = 2;
      return;
    }
    const verificationPath = resolve(root, 'data/browser-verification.json');
    if (!existsSync(verificationPath)) throw new Error('Real authenticated browser verification is still missing');
    const verification = JSON.parse(readFileSync(verificationPath, 'utf8'));
    if (verification.pinnedUserMatched !== true || verification.apiAccessVerified !== true || verification.responseStatus !== 200 ||
      verification.method !== 'GET' || verification.path !== '/api/status' ||
      !Number.isFinite(Date.parse(verification.observedAt)) || Date.parse(verification.observedAt) > Date.now() + 5_000 ||
      Date.now() - Date.parse(verification.observedAt) > 3_600_000 ||
      verification.walletAddress?.toLowerCase() !== adapter.address.toLowerCase() || verification.chainId !== 5042002) {
      throw new Error('Authenticated verification evidence does not match this wallet');
    }
    if (command === 'broadcast-saved') {
      const id = process.argv[3];
      if (id !== buyId && id !== redeemId) throw new Error('Saved broadcast requires an existing authorized attempt ID');
      const result = await engine.broadcastSaved(id);
      persist('manual-roundtrip.json', store.list().map(publicAttempt)); console.log(json(publicAttempt(result)));
      if (result.status !== 'confirmed') process.exitCode = 2;
      return;
    }
    const buy = store.get(buyId);
    if (command === 'redeem' && (buy?.status !== 'confirmed' || !buy.outputAmount)) throw new Error('Verified buy output required before redemption');
    const result = await engine.execute(command === 'buy'
      ? { id: buyId, kind: 'buy', pairId: 1, amount: 100_000_000_000_000_000n }
      : { id: redeemId, kind: 'redeem', pairId: 1, amount: buy!.outputAmount!, buyAttemptId: buyId });
    persist('manual-roundtrip.json', store.list().map(publicAttempt)); console.log(json(publicAttempt(result)));
    if (result.status !== 'confirmed') process.exitCode = 2;
  } finally {
    store?.close();
    if (locked) unlinkSync(lock);
  }
}
main().catch(error => {
  console.error(error?.constructor === Error ? error.message : 'Manual command failed; inspect state before retrying');
  process.exitCode = 1;
});
