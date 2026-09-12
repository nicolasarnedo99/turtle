process.on('uncaughtException',error=>{ console.error(error.shortMessage||error.message); process.exitCode=1; });
import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,http,parseAbi,keccak256} from 'viem';
const vault='0xb8dc1f767167b567227326D8849175a188A0e78C',oracle='0x76398cfa526D4a76EaEC0c4709d6B7C966E5ABdB';
const source=(name)=>JSON.parse(readFileSync(new URL(`${name}-source.json`,import.meta.url)));
const client=createPublicClient({transport:http('https://rpc.testnet.arc.io',{retryCount:0,timeout:15000})});
const chain=await client.getChainId(); if(chain!==5042002) throw Error('Wrong chain');
const blockNumber=await client.getBlockNumber();
const read=async(address,abi,functionName,args=[])=>{ await new Promise(resolve=>setTimeout(resolve,350)); return client.readContract({address,abi,functionName,args,blockNumber}); };
const v=(name,args)=>read(vault,source('vault').abi,name,args),o=(name,args)=>read(oracle,source('oracle').abi,name,args);
const report={observedAt:new Date().toISOString(),chain,blockNumber,vault,oracle,vaultPaused:await v('paused'),oraclePaused:await o('paused'),linkedOracle:await v('oracle'),linkedVault:await o('vault'),feeBps:await v('FEE_BPS'),vaultBalance:await v('getVaultBalance'),pairs:[]};
const expected=[
 [1n,'AAPL','0xB7d0e4FBB6C31997aeBc8070f9BF326Bb0ef859E'],
 [2n,'GOOGL','0x22Dd732d8bf020d1Cd6D2ec3342ce43f15a982b1'],
 [6n,'MSFT','0x4fb69F9521b84be62da5dEC21E5e93D8e3fE6204'],
 [7n,'TSLA','0xf1f19cE22Fb971a61B12F9494D100E72F9C3956E'],
 [9n,'NVDA','0x8f9A9ac6F16f4677beB730293C8E75694a458084'],
];
if(report.vaultPaused||report.oraclePaused) throw Error('Contract paused');
if(report.linkedOracle.toLowerCase()!==oracle.toLowerCase()||report.linkedVault.toLowerCase()!==vault.toLowerCase()) throw Error('Contract link mismatch');
if(report.feeBps!==30n) throw Error('Fee mismatch');
for(const [pairId,symbol,synth] of expected){
 const pair=await o('getPair',[pairId]);
 if(pair.pairId!==pairId||pair.symbol!==symbol||pair.category!==0||pair.synth.toLowerCase()!==synth.toLowerCase()) throw Error(`Registry mismatch for ${symbol}`);
 if(!pair.active||pair.frozen) throw Error(`Pair unavailable: ${symbol}`);
 const quote=await v('quoteBuy',[pairId,100000000000000000n]);
 const redeemQuote=await v('quoteRedeem',[pairId,quote[0]/2n]);
 const decimals=await read(pair.synth,parseAbi(['function decimals() view returns (uint8)']),'decimals');
 const priceStatus=await o('getPrice',[pairId]);
 const code=await client.getCode({address:pair.synth,blockNumber});
 if(decimals!==18||!code||code==='0x') throw Error(`Invalid synth: ${symbol}`);
 if(priceStatus[3]||quote[4]||quote[0]<=0n||redeemQuote[4]||!redeemQuote[5]) throw Error(`Unusable quote: ${symbol}`);
 report.pairs.push({pair,priceStatus,decimals,codeHash:keccak256(code),buyPrincipal:'100000000000000000',quote,redeemHalfQuote:redeemQuote});
}
const json=JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2);
writeFileSync(new URL('arc-readonly.json',import.meta.url),json+'\n'); console.log(json);
