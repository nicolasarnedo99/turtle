import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters, encodeEventTopics, keccak256, parseAbi, parseAbiParameters,
  toHex, TransactionReceiptNotFoundError, zeroAddress, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAIN, ManualArcAdapter, SYNTH, VAULT } from '../../server/manual-arc.js';
import type { ExecutionAttempt, PreparedExecution } from '../../server/execution.js';

// Public, disposable test keys. These fixtures never use Privy or a network transport.
const account = privateKeyToAccount(toHex(1n, { size: 32 }));
const other = privateKeyToAccount(toHex(2n, { size: 32 }));
const amount = 100_000_000_000_000_000n;
const minted = 500_000_000_000_000n;
const fee = amount * 30n / 10_000n;
const gasCost = 21_000n * 2n;
const hash = keccak256('0x1234');
const blockHash = keccak256('0xabcd');
const vaultAbi = parseAbi([
  'event SynthBought(uint256 indexed pairId, address indexed buyer, string symbol, uint256 usdcIn, uint256 fee, uint256 reserveAdded, uint256 synthMinted, uint256 price, uint256 timestamp)',
  'event SynthRedeemed(uint256 indexed pairId, address indexed redeemer, string symbol, uint256 synthBurned, uint256 grossUsdc, uint256 fee, uint256 usdcOut, uint256 price, uint256 timestamp)',
]);
const transferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

function prepared(): PreparedExecution {
  return { nonce: 0, balanceNative: 10n ** 19n, maximumGasNative: 100_000n,
    transaction: { chain_id: CHAIN, type: 2, to: VAULT, value: toHex(amount), data: '0x1234',
      nonce: 0, gas_limit: 30_000, max_fee_per_gas: '0x3', max_priority_fee_per_gas: '0x1' },
    before: { minimum: minted - 1n, preparedAt: Date.now() } };
}
function unsigned() {
  return { type: 'eip1559' as const, chainId: CHAIN, to: VAULT, value: amount, data: '0x1234' as Hex,
    nonce: 0, gas: 30_000n, maxFeePerGas: 3n, maxPriorityFeePerGas: 1n };
}
function bareAdapter(): ManualArcAdapter {
  const adapter = Object.create(ManualArcAdapter.prototype) as ManualArcAdapter;
  Object.assign(adapter, { address: account.address, vaultSource: { abi: vaultAbi } });
  return adapter;
}

function receiptFixture(kind: 'buy' | 'redeem' = 'buy') {
  const buy = kind === 'buy';
  const transaction = { ...unsigned(), hash, from: account.address, input: '0x1234', value: buy ? amount : 0n };
  const vaultLog = { address: VAULT,
    topics: buy
      ? encodeEventTopics({ abi: vaultAbi, eventName: 'SynthBought', args: { pairId: 1n, buyer: account.address } })
      : encodeEventTopics({ abi: vaultAbi, eventName: 'SynthRedeemed', args: { pairId: 1n, redeemer: account.address } }),
    data: encodeAbiParameters(parseAbiParameters('string, uint256, uint256, uint256, uint256, uint256, uint256'),
      buy ? ['AAPL', amount, fee, amount - fee, minted, 200n, 1000n]
        : ['AAPL', minted, amount, fee, amount - fee, 200n, 1000n]),
  };
  const transferLog = { address: SYNTH,
    topics: encodeEventTopics({ abi: transferAbi, eventName: 'Transfer',
      args: { from: buy ? zeroAddress : account.address, to: buy ? account.address : zeroAddress } }),
    data: encodeAbiParameters(parseAbiParameters('uint256'), [minted]),
  };
  const receipt = { transactionHash: hash, blockNumber: 11n, blockHash, from: account.address, to: VAULT,
    gasUsed: 21_000n, effectiveGasPrice: 2n, status: 'success', logs: [vaultLog, transferLog] };
  const before = { blockNumber: 10n, blockHash, native: 10n ** 19n, synth: buy ? 0n : minted, nonce: 0 };
  const after = { blockNumber: 11n, blockHash,
    native: before.native + (buy ? -amount : amount - fee) - gasCost, synth: buy ? minted : 0n, nonce: 1 };
  const attempt: ExecutionAttempt = {
    intent: { id: `manual-${kind}`, kind, pairId: 1, amount: buy ? amount : minted },
    prepared: prepared(), signed: { raw: '0x1234', hash }, status: 'submitted',
    budgetDay: '2026-09-12', idempotencyKey: 'test',
  };
  attempt.prepared.transaction.value = toHex(buy ? amount : 0n);
  attempt.prepared.before.minimum = buy ? minted - 1n : amount - fee - 1n;
  const client = {
    getTransactionReceipt: vi.fn(async () => receipt), getTransaction: vi.fn(async () => transaction),
    getBlock: vi.fn(async () => ({ hash: blockHash, parentHash: blockHash, number: 11n })),
  };
  const adapter = Object.assign(bareAdapter(), { client,
    snapshot: vi.fn(async (block?: bigint) => block === 10n ? before : after),
  });
  return { adapter, attempt, client, transaction, receipt, before, after, transferLog, vaultLog };
}

afterEach(() => vi.unstubAllGlobals());

describe('manual Arc signature validation', () => {
  it('accepts only the expected wallet and immutable EIP-1559 fields', async () => {
    const raw = await account.signTransaction(unsigned());
    await expect(bareAdapter().verifySigned(prepared(), { raw, hash: keccak256(raw) })).resolves.toBeUndefined();
  });

  it('accepts a redemption value encoded as RLP zero but rejects any nonzero value', async () => {
    const redeem = prepared();
    redeem.transaction.value = '0x0';
    const zeroValue = await account.signTransaction({ ...unsigned(), value: 0n });
    await expect(bareAdapter().verifySigned(redeem, { raw: zeroValue, hash: keccak256(zeroValue) }))
      .resolves.toBeUndefined();
    const nonzeroValue = await account.signTransaction({ ...unsigned(), value: 1n });
    await expect(bareAdapter().verifySigned(redeem, { raw: nonzeroValue, hash: keccak256(nonzeroValue) }))
      .rejects.toThrow('Signed transaction validation failed');
  });

  it.each([
    { chainId: 1 }, { nonce: 1 }, { to: other.address }, { value: amount + 1n },
    { data: '0x5678' as Hex }, { gas: 30_001n }, { maxFeePerGas: 4n }, { maxPriorityFeePerGas: 2n },
    { accessList: [{ address: VAULT, storageKeys: [] }] },
  ])('rejects a signed transaction with changed fields %#', async fields => {
    const raw = await account.signTransaction({ ...unsigned(), ...fields });
    await expect(bareAdapter().verifySigned(prepared(), { raw, hash: keccak256(raw) }))
      .rejects.toThrow('Signed transaction validation failed');
  });

  it('rejects another signer, false hash, and malformed bytes without exposing bytes', async () => {
    const wrongSigner = await other.signTransaction(unsigned());
    const raw = await account.signTransaction(unsigned());
    for (const signed of [{ raw: wrongSigner, hash: keccak256(wrongSigner) }, { raw, hash }, { raw: '0x1234' as Hex, hash }]) {
      await expect(bareAdapter().verifySigned(prepared(), signed))
        .rejects.toThrow('Signed transaction validation failed; bytes retained privately, no broadcast');
    }
  });
});

describe('manual Arc receipt verification', () => {
  it.each(['buy', 'redeem'] as const)('verifies %s event, mint/burn, balances, gas, and reserve', async kind => {
    const fixture = receiptFixture(kind);
    const result = await fixture.adapter.inspect(fixture.attempt);
    expect(result.status).toBe('confirmed');
    expect(result.outputAmount).toBe(kind === 'buy' ? minted : amount - fee);
    expect(result.evidence).toMatchObject({ hash, reserveVerified: true, gasCost,
      nativeDelta: fixture.after.native - fixture.before.native,
      synthDelta: kind === 'buy' ? minted : -minted });
    expect(fixture.adapter.snapshot).toHaveBeenNthCalledWith(1, 10n);
    expect(fixture.adapter.snapshot).toHaveBeenNthCalledWith(2, 11n);
  });

  it.each(['receipt hash', 'block hash', 'sender', 'nonce', 'calldata', 'value', 'chain', 'gas'])(
    'rejects wrong transaction identity: %s', async field => {
      const fixture = receiptFixture();
      if (field === 'receipt hash') fixture.receipt.transactionHash = blockHash;
      if (field === 'block hash') fixture.receipt.blockHash = hash;
      if (field === 'sender') fixture.transaction.from = other.address;
      if (field === 'nonce') fixture.transaction.nonce++;
      if (field === 'calldata') fixture.transaction.input = '0x5678';
      if (field === 'value') fixture.transaction.value++;
      if (field === 'chain') fixture.transaction.chainId = 1;
      if (field === 'gas') fixture.transaction.gas++;
      await expect(fixture.adapter.inspect(fixture.attempt)).rejects.toThrow('Receipt transaction identity mismatch');
    });

  it.each(['buy', 'redeem'] as const)('rejects missing or wrong %s token transfer evidence', async kind => {
    const missing = receiptFixture(kind);
    missing.receipt.logs = [missing.vaultLog];
    await expect(missing.adapter.inspect(missing.attempt)).rejects.toThrow('Synthetic mint/burn evidence mismatch');
    const wrongAmount = receiptFixture(kind);
    wrongAmount.transferLog.data = encodeAbiParameters(parseAbiParameters('uint256'), [minted + 1n]);
    await expect(wrongAmount.adapter.inspect(wrongAmount.attempt)).rejects.toThrow('Synthetic mint/burn evidence mismatch');
    const wrongParty = receiptFixture(kind);
    wrongParty.transferLog.topics = encodeEventTopics({ abi: transferAbi, eventName: 'Transfer',
      args: { from: zeroAddress, to: other.address } });
    await expect(wrongParty.adapter.inspect(wrongParty.attempt)).rejects.toThrow('Synthetic mint/burn evidence mismatch');
  });

  it.each(['buy', 'redeem'] as const)('rejects %s balance deltas or output below minimum', async kind => {
    const native = receiptFixture(kind);
    native.after.native++;
    await expect(native.adapter.inspect(native.attempt)).rejects.toThrow('balance accounting mismatch');
    const synth = receiptFixture(kind);
    synth.after.synth++;
    await expect(synth.adapter.inspect(synth.attempt)).rejects.toThrow('balance accounting mismatch');
    const minimum = receiptFixture(kind);
    minimum.attempt.prepared.before.minimum = kind === 'buy' ? minted + 1n : amount;
    await expect(minimum.adapter.inspect(minimum.attempt)).rejects.toThrow('balance accounting mismatch');
  });

  it.each(['reserve', 'gas', 'before nonce', 'after nonce'])('rejects broken %s accounting', async field => {
    const fixture = receiptFixture();
    if (field === 'reserve') fixture.after.native = 10n ** 18n - 1n;
    if (field === 'gas') fixture.attempt.prepared.maximumGasNative = gasCost - 1n;
    if (field === 'before nonce') fixture.before.nonce++;
    if (field === 'after nonce') fixture.after.nonce++;
    await expect(fixture.adapter.inspect(fixture.attempt)).rejects.toThrow('Receipt nonce or gas/reserve accounting mismatch');
  });

  it('requires exactly one vault event and the expected pair identity', async () => {
    const duplicate = receiptFixture();
    duplicate.receipt.logs.push(duplicate.vaultLog);
    await expect(duplicate.adapter.inspect(duplicate.attempt)).rejects.toThrow('Expected exactly one vault execution event');
    const wrongPair = receiptFixture();
    wrongPair.vaultLog.topics = encodeEventTopics({ abi: vaultAbi, eventName: 'SynthBought', args: { pairId: 8n, buyer: account.address } });
    await expect(wrongPair.adapter.inspect(wrongPair.attempt)).rejects.toThrow('Vault event identity mismatch');
  });

  it('keeps an unfinalized receipt pending without treating balances as confirmed', async () => {
    const fixture = receiptFixture();
    fixture.client.getBlock.mockResolvedValueOnce({ hash: blockHash, parentHash: blockHash, number: 10n });
    expect(await fixture.adapter.inspect(fixture.attempt)).toEqual({ status: 'pending' });
    expect(fixture.client.getBlock).toHaveBeenCalledWith({ blockTag: 'finalized' });
    expect(fixture.client.getTransaction).not.toHaveBeenCalled();
    expect(fixture.adapter.snapshot).not.toHaveBeenCalled();
  });

  it.each(['before', 'after'] as const)('rejects a changed %s snapshot chain view', async name => {
    const fixture = receiptFixture();
    fixture[name].blockHash = hash;
    await expect(fixture.adapter.inspect(fixture.attempt)).rejects.toThrow('Receipt balance snapshots changed chain view');
  });

  it('verifies a revert only when gas is the sole balance change', async () => {
    const fixture = receiptFixture();
    fixture.receipt.status = 'reverted';
    fixture.receipt.logs = [];
    fixture.after.native = fixture.before.native - gasCost;
    fixture.after.synth = fixture.before.synth;
    expect((await fixture.adapter.inspect(fixture.attempt)).status).toBe('reverted');
    fixture.after.synth++;
    await expect(fixture.adapter.inspect(fixture.attempt)).rejects.toThrow('Reverted balance accounting mismatch');
  });

  it('distinguishes absent receipts from RPC failure without signing or broadcasting', async () => {
    const fixture = receiptFixture();
    fixture.client.getTransactionReceipt.mockRejectedValueOnce(new TransactionReceiptNotFoundError({ hash }));
    expect(await fixture.adapter.inspect(fixture.attempt)).toEqual({ status: 'pending' });
    fixture.client.getTransactionReceipt.mockRejectedValueOnce(new Error('private provider details'));
    await expect(fixture.adapter.inspect(fixture.attempt)).rejects.toThrow('Receipt RPC unavailable; outcome remains uncertain');
    expect(fixture.client.getTransaction).not.toHaveBeenCalled();
  });
});

describe('manual Arc authorization boundaries', () => {
  it('rejects an unauthorized pair or buy amount before private or chain access', async () => {
    const adapter = bareAdapter();
    const network = vi.fn(() => { throw new Error('Unexpected network call'); });
    vi.stubGlobal('fetch', network);
    await expect(adapter.prepare({ id: 'wrong-pair', kind: 'buy', pairId: 8 as 1, amount }))
      .rejects.toThrow('Outside authorized manual round trip');
    await expect(adapter.prepare({ id: 'wrong-amount', kind: 'buy', pairId: 1, amount: amount + 1n }))
      .rejects.toThrow('Outside authorized manual round trip');
    expect(network).not.toHaveBeenCalled();
  });
});
