import {readFileSync,writeFileSync} from 'node:fs';
const source=JSON.parse(readFileSync(new URL('vault-source.json',import.meta.url)));
const abi=source.abi.filter(entry=>entry.type==='function'&&['buy','redeem'].includes(entry.name));
const transaction=(field,operator,value)=>({field_source:'ethereum_transaction',field,operator,value});
const calldata=(field,operator,value)=>({field_source:'ethereum_calldata',field,operator,value,abi});
const common=()=>[transaction('chain_id','eq','5042002'),transaction('to','eq','0xb8dc1f767167b567227326D8849175a188A0e78C')];
const rule=(name,conditions)=>({name,method:'eth_signTransaction',action:'ALLOW',conditions});
const policy={version:'1.0',name:'Turtle Arc testnet synthetic stocks',chain_type:'ethereum',rules:['1','2','6','7','9'].flatMap(pair=>[
 rule(`Buy pair ${pair} up to one test USDC`,[
  ...common(),transaction('value','gt','0x0'),transaction('value','lte','0xde0b6b3a7640000'),
  calldata('function_name','eq','buy'),calldata('buy.pairId','eq',pair),calldata('buy.minSynth','gt','0')]),
 rule(`Redeem pair ${pair} with positive minimum`,[
  ...common(),transaction('value','eq','0x0'),calldata('function_name','eq','redeem'),
  calldata('redeem.pairId','eq',pair),calldata('redeem.synthAmount','gt','0'),calldata('redeem.minUsdc','gt','0')])
])};
if([policy,...policy.rules].some(item=>item.name.length<1||item.name.length>50)) throw Error('Policy and rule names must contain 1 to 50 characters');
writeFileSync(new URL('policy.json',import.meta.url),JSON.stringify(policy,null,2)+'\n');
console.log('Prepared policy only; no API request.');
