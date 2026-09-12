import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPublicClient, http, encodeFunctionData, parseAbi, parseEventLogs,
  keccak256, getAddress, parseTransaction, recoverTransactionAddress, toHex,
  TransactionReceiptNotFoundError, type Address, type Hex, type Abi, type TransactionSerialized,
} from 'viem';
import type { ExecutionAdapter, ExecutionIntent, PreparedExecution, ExecutionAttempt, SignedExecution } from './execution.js';

export const CHAIN = 5042002;
export const VAULT = '0xb8dc1f767167b567227326D8849175a188A0e78C' as const;
export const ORACLE = '0x76398cfa526D4a76EaEC0c4709d6B7C966E5ABdB' as const;
export const SYNTH = '0xB7d0e4FBB6C31997aeBc8070f9BF326Bb0ef859E' as const;
const tokenAbi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'event Transfer(address indexed from, address indexed to, uint256 value)']);
const zero = '0x0000000000000000000000000000000000000000';
const json = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item);
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export class ManualArcAdapter implements ExecutionAdapter {
  readonly client = createPublicClient({ transport: http('https://rpc.testnet.arc.io', { retryCount: 0, timeout: 15_000 }) });
  readonly address: Address;
  private readonly provision: any;
  private readonly policy: any;
  private readonly vaultSource: any;
  private readonly oracleSource: any;
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly allowedUser: string;
  private broadcastDeadline = 0;

  constructor(root: string) {
    const read = (name: string) => JSON.parse(readFileSync(resolve(root, 'spikes/privy-arc', name), 'utf8'));
    this.provision = read('.private/provision.json');
    this.policy = read('policy.json');
    assert(keccak256(new TextEncoder().encode(JSON.stringify(this.policy, null, 2) + '\n')) === this.provision.policyHash, 'Pinned policy hash mismatch');
    this.vaultSource = read('vault-source.json');
    this.oracleSource = read('oracle-source.json');
    this.appId = process.env.PRIVY_APP_ID ?? '';
    this.appSecret = process.env.PRIVY_APP_SECRET ?? '';
    this.allowedUser = process.env.TURTLE_ALLOWED_PRIVY_USER_ID ?? '';
    assert(this.appId && this.appSecret && this.allowedUser, 'Missing private authentication configuration');
    assert(!this.provision.pending && this.provision.allowedUser === this.allowedUser && this.provision.wallet?.owner_id === null, 'Provisioned wallet requires reconciliation');
    this.address = getAddress(this.provision.wallet.address);
    assert(same(this.address, '0xE0025f5afd3FD375e30E8C3679924a499eE926F4'), 'Unexpected funded wallet');
  }

  private async privy(path: string, body?: unknown, key?: string): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`https://api.privy.io/v1${path}`, {
        method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json', 'privy-app-id': this.appId,
          Authorization: `Basic ${Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64')}`,
          ...(key ? { 'privy-idempotency-key': key } : {}) },
        ...(body ? { body: json(body) } : {}),
      });
    } catch { throw new Error('Privy transport outcome uncertain; reconcile before any retry'); }
    if (!response.ok) throw new Error(`Privy HTTP ${response.status}; no automatic retry`);
    try { return await response.json(); } catch { throw new Error('Privy response unreadable; reconcile before any retry'); }
  }

  async verifyPolicy(): Promise<void> {
    const user = await this.privy(`/users/${encodeURIComponent(this.allowedUser)}`);
    assert(user.id === this.allowedUser && user.is_guest !== true, 'Pinned Privy user mismatch');
    const wallet = await this.privy(`/wallets/${this.provision.wallet.id}`);
    assert(same(wallet.address, this.address) && wallet.owner_id === null && wallet.additional_signers?.length === 0 &&
      JSON.stringify(wallet.policy_ids) === JSON.stringify([this.provision.policyId]), 'Live wallet ownership or policy mismatch');
    const policy = await this.privy(`/policies/${this.provision.policyId}`);
    const normalized = { version: policy.version, name: policy.name, chain_type: policy.chain_type,
      rules: policy.rules?.map(({ id: _id, ...rule }: any) => rule) };
    assert(json(canonical(normalized)) === json(canonical(this.policy)), 'Live Privy policy differs from verified policy');
  }

  async snapshot(blockNumber?: bigint) {
    assert(await this.client.getChainId() === CHAIN, 'RPC chain mismatch');
    const block = await this.client.getBlock({ ...(blockNumber === undefined ? {} : { blockNumber }) });
    assert(block.number !== null, 'Missing block number');
    const native = await this.client.getBalance({ address: this.address, blockNumber: block.number });
    const synth = await this.client.readContract({ address: SYNTH, abi: tokenAbi, functionName: 'balanceOf', args: [this.address], blockNumber: block.number });
    const nonce = await this.client.getTransactionCount({ address: this.address, blockNumber: block.number });
    return { blockNumber: block.number, blockHash: block.hash, native, synth, nonce };
  }

  private async venue(blockNumber: bigint) {
    const read = async (address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<any> => {
      await new Promise(resolve => setTimeout(resolve, 350));
      return this.client.readContract({ address, abi, functionName, args, blockNumber });
    };
    const v = (name: string, args?: readonly unknown[]) => read(VAULT, this.vaultSource.abi, name, args);
    const o = (name: string, args?: readonly unknown[]) => read(ORACLE, this.oracleSource.abi, name, args);
    assert(!await v('paused') && !await o('paused'), 'Venue paused');
    assert(same(await v('oracle'), ORACLE) && same(await o('vault'), VAULT), 'Venue links changed');
    assert(await v('FEE_BPS') === 30n, 'Venue fee changed');
    const pair = await o('getPair', [1n]);
    assert(pair.pairId === 1n && pair.symbol === 'AAPL' && pair.category === 0 && same(pair.synth, SYNTH) && pair.active && !pair.frozen, 'Apple registry mismatch or unavailable');
    const price = await o('getPrice', [1n]);
    assert(price[0] > 0n && !price[3], 'Oracle price unavailable or stale');
    assert(await read(SYNTH, tokenAbi, 'decimals') === 18, 'Synthetic token decimals mismatch');
    for (const [address, source] of [[VAULT, this.vaultSource], [ORACLE, this.oracleSource]] as const) {
      const code = await this.client.getCode({ address, blockNumber });
      assert(code && code !== '0x' && same(code, source.deployed_bytecode), 'Verified contract bytecode mismatch');
    }
    const synthCode = await this.client.getCode({ address: SYNTH, blockNumber });
    assert(synthCode && synthCode !== '0x', 'Missing synthetic token bytecode');
    return { v, price, synthCodeHash: keccak256(synthCode) };
  }

  async preflight() {
    await this.verifyPolicy();
    const observedAt = Date.now();
    const before = await this.snapshot();
    const pendingNonce = await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
    assert(before.nonce === pendingNonce, 'Pending wallet transaction requires reconciliation');
    const venue = await this.venue(before.blockNumber);
    const quote = await venue.v('quoteBuy', [1n, 100_000_000_000_000_000n]);
    assert(quote[0] > 0n && !quote[4], 'Buy quote unavailable');
    const redeem = await venue.v('quoteRedeem', [1n, quote[0]]);
    assert(redeem[0] > 0n && !redeem[4] && redeem[5], 'Redemption liquidity unavailable');
    return { observedAt: new Date().toISOString(), chainId: CHAIN, wallet: this.address, policyVerified: true,
      ...before, pendingNonce, quote, redemptionQuote: redeem, synthCodeHash: venue.synthCodeHash };
  }

  async prepare(intent: ExecutionIntent): Promise<PreparedExecution> {
    assert(intent.pairId === 1 && (intent.kind !== 'buy' || intent.amount === 100_000_000_000_000_000n), 'Outside authorized manual round trip');
    await this.verifyPolicy();
    const observedAt = Date.now();
    const before = await this.snapshot();
    const pendingNonce = await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
    assert(pendingNonce === before.nonce && pendingNonce < 1_000_000_000, 'Nonce requires reconciliation');
    const venue = await this.venue(before.blockNumber);
    const quote = await venue.v(intent.kind === 'buy' ? 'quoteBuy' : 'quoteRedeem', [1n, intent.amount]);
    assert(quote[0] > 0n && !quote[4] && (intent.kind === 'buy' || quote[5]), 'Quote stale or reserve unavailable');
    assert(intent.kind === 'buy' || before.synth >= intent.amount, 'Insufficient synth to redeem');
    const minimum = quote[0] * 995n / 1000n;
    assert(minimum > 0n, 'Minimum output rounds to zero');
    const data = encodeFunctionData({ abi: this.vaultSource.abi, functionName: intent.kind,
      args: intent.kind === 'buy' ? [1n, minimum] : [1n, intent.amount, minimum] });
    const value = intent.kind === 'buy' ? intent.amount : 0n;
    const fees = await this.client.estimateFeesPerGas();
    const estimated = await this.client.estimateGas({ account: this.address, to: VAULT, data, value, nonce: pendingNonce,
      maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
    const gas = (estimated * 120n + 99n) / 100n;
    const maximumGasNative = gas * fees.maxFeePerGas;
    assert(maximumGasNative <= 100_000_000_000_000_000n, 'Gas exceeds 0.10 test USDC manual ceiling');
    const freshBalance = await this.client.getBalance({ address: this.address, blockTag: 'pending' });
    assert(freshBalance - value - maximumGasNative >= 10n ** 18n, 'Insufficient reserve after maximum gas');
    assert(await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' }) === pendingNonce, 'Nonce changed during preparation');
    return { nonce: pendingNonce, balanceNative: freshBalance, maximumGasNative,
      transaction: { chain_id: CHAIN, type: 2, to: VAULT, value: toHex(value), data, nonce: pendingNonce,
        gas_limit: Number(gas), max_fee_per_gas: toHex(fees.maxFeePerGas), max_priority_fee_per_gas: toHex(fees.maxPriorityFeePerGas) },
      before: { ...before, quote, minimum, kind: intent.kind, amount: intent.amount, preparedAt: observedAt } };
  }

  async sign(prepared: PreparedExecution, key: string): Promise<SignedExecution> {
    assert(Date.now() - Number(prepared.before.preparedAt) < 30_000, 'Prepared quote expired before signing');
    this.broadcastDeadline = Number(prepared.before.preparedAt) + 30_000;
    const result = await this.privy(`/wallets/${this.provision.wallet.id}/rpc`, {
      method: 'eth_signTransaction', params: { transaction: prepared.transaction },
    }, key);
    assert(/^0x[0-9a-fA-F]+$/.test(result.data?.signed_transaction ?? ''), 'Privy signed transaction missing');
    const raw = result.data.signed_transaction as Hex;
    return { raw, hash: keccak256(raw) };
  }

  async verifySigned(prepared: PreparedExecution, signed: SignedExecution): Promise<void> {
    try {
      const decoded = parseTransaction(signed.raw);
      const signer = await recoverTransactionAddress({ serializedTransaction: signed.raw as TransactionSerialized });
      const expected = prepared.transaction as any;
      assert(same(signer, this.address) && decoded.type === 'eip1559' && decoded.chainId === CHAIN &&
        decoded.nonce === expected.nonce && same(decoded.to!, VAULT) && (decoded.value ?? 0n) === BigInt(expected.value) &&
        decoded.data === expected.data && decoded.gas === BigInt(expected.gas_limit) &&
        decoded.maxFeePerGas === BigInt(expected.max_fee_per_gas) && decoded.maxPriorityFeePerGas === BigInt(expected.max_priority_fee_per_gas) &&
        (!decoded.accessList || decoded.accessList.length === 0) && keccak256(signed.raw) === signed.hash, 'Signed fields mismatch');
    } catch { throw new Error('Signed transaction validation failed; bytes retained privately, no broadcast'); }
  }

  async refreshForBroadcast(attempt: ExecutionAttempt): Promise<void> {
    await this.verifySigned(attempt.prepared, attempt.signed!);
    await this.verifyPolicy();
    const observedAt = Date.now();
    const snapshot = await this.snapshot();
    const pendingNonce = await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
    assert(snapshot.nonce === attempt.prepared.nonce && pendingNonce === snapshot.nonce, 'Saved transaction nonce requires reconciliation');
    const venue = await this.venue(snapshot.blockNumber);
    const quote = await venue.v(attempt.intent.kind === 'buy' ? 'quoteBuy' : 'quoteRedeem', [1n, attempt.intent.amount]);
    assert(!quote[4] && (attempt.intent.kind === 'buy' || quote[5]) &&
      quote[0] >= BigInt(attempt.prepared.before.minimum as bigint), 'Saved minimum output no longer executable');
    const transaction = attempt.prepared.transaction as any;
    const gas = BigInt(transaction.gas_limit);
    const maximumFee = BigInt(transaction.max_fee_per_gas);
    const maximumGasNative = gas * maximumFee;
    assert(maximumGasNative === attempt.prepared.maximumGasNative &&
      snapshot.native - BigInt(transaction.value) - maximumGasNative >= 10n ** 18n, 'Saved transaction reserve or gas mismatch');
    const estimated = await this.client.estimateGas({ account: this.address, to: VAULT, data: transaction.data,
      value: BigInt(transaction.value), nonce: transaction.nonce, maxFeePerGas: maximumFee,
      maxPriorityFeePerGas: BigInt(transaction.max_priority_fee_per_gas) });
    assert(estimated <= gas, 'Saved gas limit no longer sufficient');
    this.broadcastDeadline = observedAt + 30_000;
    assert(Date.now() < this.broadcastDeadline, 'Saved transaction revalidation expired');
  }

  async broadcast(raw: Hex): Promise<Hex> {
    assert(Date.now() < this.broadcastDeadline, 'Prepared quote expired before broadcast; reconcile saved transaction');
    const transaction = parseTransaction(raw);
    assert(await this.client.getChainId() === CHAIN, 'RPC chain changed before broadcast');
    const latestNonce = await this.client.getTransactionCount({ address: this.address, blockTag: 'latest' });
    const pendingNonce = await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
    assert(latestNonce === transaction.nonce && pendingNonce === transaction.nonce, 'Nonce changed before broadcast; reconcile saved transaction');
    const balance = await this.client.getBalance({ address: this.address, blockTag: 'pending' });
    assert(balance - (transaction.value ?? 0n) - transaction.gas! * transaction.maxFeePerGas! >= 10n ** 18n, 'Reserve changed before broadcast');
    await this.client.call({ account: this.address, to: VAULT, data: transaction.data,
      value: transaction.value, gas: transaction.gas, blockTag: 'pending' });
    assert(Date.now() < this.broadcastDeadline, 'Prepared quote expired during broadcast preflight');
    try { return await this.client.sendRawTransaction({ serializedTransaction: raw }); }
    catch { throw new Error('Broadcast outcome uncertain; reconcile saved hash without new signing'); }
  }

  async inspect(attempt: ExecutionAttempt) {
    const hash = attempt.signed!.hash;
    let receipt;
    try { receipt = await this.client.getTransactionReceipt({ hash }); }
    catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) return { status: 'pending' as const };
      throw new Error('Receipt RPC unavailable; outcome remains uncertain');
    }
    const finalized = await this.client.getBlock({ blockTag: 'finalized' });
    if (finalized.number === null || finalized.number < receipt.blockNumber) return { status: 'pending' as const };
    const transaction = await this.client.getTransaction({ hash });
    const expected = attempt.prepared!.transaction as any;
    const block = await this.client.getBlock({ blockNumber: receipt.blockNumber });
    assert(block.hash === receipt.blockHash && receipt.transactionHash === hash && transaction.hash === hash &&
      same(transaction.from, this.address) && same(transaction.to!, VAULT) && transaction.nonce === expected.nonce &&
      transaction.input === expected.data && transaction.value === BigInt(expected.value) && transaction.chainId === CHAIN &&
      transaction.gas === BigInt(expected.gas_limit) && transaction.maxFeePerGas === BigInt(expected.max_fee_per_gas) &&
      transaction.maxPriorityFeePerGas === BigInt(expected.max_priority_fee_per_gas) &&
      same(receipt.from, this.address) && same(receipt.to!, VAULT), 'Receipt transaction identity mismatch');
    const before = await this.snapshot(receipt.blockNumber - 1n);
    const after = await this.snapshot(receipt.blockNumber);
    assert(after.blockHash === receipt.blockHash && before.blockHash === block.parentHash, 'Receipt balance snapshots changed chain view');
    const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
    assert(gasCost <= attempt.prepared!.maximumGasNative && after.native >= 10n ** 18n &&
      before.nonce === expected.nonce && after.nonce === expected.nonce + 1, 'Receipt nonce or gas/reserve accounting mismatch');
    if (receipt.status === 'reverted') {
      assert(after.native - before.native === -gasCost && after.synth === before.synth, 'Reverted balance accounting mismatch');
      return { status: 'reverted' as const, evidence: { hash, blockNumber: receipt.blockNumber, before, after, gasCost } };
    }
    const logs = parseEventLogs({ abi: this.vaultSource.abi, logs: receipt.logs.filter(log => same(log.address, VAULT)),
      eventName: attempt.intent.kind === 'buy' ? 'SynthBought' : 'SynthRedeemed', strict: true });
    assert(logs.length === 1, 'Expected exactly one vault execution event');
    const event = (logs[0] as unknown as { args: Record<string, any> }).args;
    const buy = attempt.intent.kind === 'buy';
    const synthAmount = buy ? event.synthMinted : event.synthBurned;
    const transfers = parseEventLogs({ abi: tokenAbi, logs: receipt.logs.filter(log => same(log.address, SYNTH)), eventName: 'Transfer', strict: true });
    assert(transfers.length === 1 && transfers[0]!.args.value === synthAmount &&
      same(transfers[0]!.args.from, buy ? zero : this.address) && same(transfers[0]!.args.to, buy ? this.address : zero), 'Synthetic mint/burn evidence mismatch');
    assert(event.pairId === 1n && event.symbol === 'AAPL' && same(buy ? event.buyer : event.redeemer, this.address), 'Vault event identity mismatch');
    const minimum = BigInt(attempt.prepared!.before.minimum as bigint);
    if (buy) {
      assert(event.usdcIn === attempt.intent.amount && event.fee === event.usdcIn * 30n / 10_000n &&
        event.reserveAdded === event.usdcIn - event.fee && synthAmount >= minimum &&
        after.synth - before.synth === synthAmount && after.native - before.native === -BigInt(event.usdcIn) - gasCost, 'Buy balance accounting mismatch');
    } else {
      assert(synthAmount === attempt.intent.amount && event.fee === event.grossUsdc * 30n / 10_000n &&
        event.usdcOut === event.grossUsdc - event.fee && event.usdcOut >= minimum &&
        before.synth - after.synth === synthAmount && after.native - before.native === event.usdcOut - gasCost, 'Redeem balance accounting mismatch');
    }
    return { status: 'confirmed' as const, outputAmount: buy ? synthAmount as bigint : event.usdcOut as bigint,
      evidence: { hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, before, after, gasCost,
        gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice, event, nativeDelta: after.native - before.native,
        synthDelta: after.synth - before.synth, reserveVerified: true } };
  }
}
