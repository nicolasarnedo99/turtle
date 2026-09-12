import { createPublicClient, formatUnits, http, parseAbi, type Address } from 'viem';
import type { WalletSnapshot } from './app.js';

export const ARC_CHAIN_ID = 5042002;
const SYNTHS = [
  { symbol: 'AAPL', address: '0xB7d0e4FBB6C31997aeBc8070f9BF326Bb0ef859E' },
  { symbol: 'GOOGL', address: '0x22Dd732d8bf020d1Cd6D2ec3342ce43f15a982b1' },
  { symbol: 'MSFT', address: '0x4fb69F9521b84be62da5dEC21E5e93D8e3fE6204' },
  { symbol: 'TSLA', address: '0xf1f19cE22Fb971a61B12F9494D100E72F9C3956E' },
  { symbol: 'NVDA', address: '0x8f9A9ac6F16f4677beB730293C8E75694a458084' },
] as const;
const balanceAbi = parseAbi(['function balanceOf(address account) view returns (uint256)']);

export function walletReader(address: Address): () => Promise<WalletSnapshot> {
  const client = createPublicClient({ transport: http('https://rpc.testnet.arc.io', { retryCount: 0, timeout: 15_000 }) });
  let inFlight: Promise<WalletSnapshot> | undefined;
  const read = async (): Promise<WalletSnapshot> => {
    if (await client.getChainId() !== ARC_CHAIN_ID) throw new Error('Arc chain mismatch');
    const blockNumber = await client.getBlockNumber();
    const balance = await client.getBalance({ address, blockNumber });
    const holdings: WalletSnapshot['holdings'] = [];
    for (const synth of SYNTHS) {
      const units = await client.readContract({ address: synth.address, abi: balanceAbi,
        functionName: 'balanceOf', args: [address], blockNumber });
      holdings.push({ ...synth, balance: formatUnits(units, 18) });
    }
    return { address, balanceUsdc: formatUnits(balance, 18), chainId: ARC_CHAIN_ID, holdings };
  };
  return () => {
    if (!inFlight) inFlight = read().finally(() => { inFlight = undefined; });
    return inFlight;
  };
}
