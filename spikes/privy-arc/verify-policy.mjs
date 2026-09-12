import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync,fsyncSync,renameSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createPublicClient,http,encodeFunctionData,keccak256,recoverTransactionAddress,parseTransaction} from 'viem';

// This developer spike has no broadcast operation. Signed fixtures stay private.
const base=new URL('.',import.meta.url),privateDir=new URL('.private/',base);
const json=(value)=>JSON.stringify(value,(_,item)=>typeof item==='bigint'?item.toString():item,2)+'\n';
const read=(name)=>JSON.parse(readFileSync(new URL(name,base)));
function persist(name,value){
 const target=new URL(name,privateDir),temporary=new URL(`${name}.tmp`,privateDir);
 writeFileSync(temporary,json(value),{mode:0o600});
 const file=openSync(temporary,'r');fsyncSync(file);closeSync(file);
 renameSync(temporary,target);
 const directory=openSync(privateDir,'r');fsyncSync(directory);closeSync(directory);
}
async function main(){
 if(!['provision','sign-tests'].includes(process.argv[2])) throw Error('Use provision or sign-tests; no broadcast command exists');
 loadEnvFile(fileURLToPath(new URL('../../.env',base)));
 const appId=process.env.PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET,allowedUser=process.env.TURTLE_ALLOWED_PRIVY_USER_ID;
 if(!appId||!secret) throw Error('Missing Privy credentials');
 if(!allowedUser||!/^did:privy:[a-zA-Z0-9]+$/.test(allowedUser)) throw Error('Missing or invalid pinned TURTLE_ALLOWED_PRIVY_USER_ID; refusing mutation');
 mkdirSync(privateDir,{recursive:true,mode:0o700});
 const lock=new URL('lock',privateDir);const lockFile=openSync(lock,'wx',0o600);closeSync(lockFile);
 try {
  async function request(path,method='GET',body,key){
   let response;
   try {response=await fetch(`https://api.privy.io/v1${path}`,{method,headers:{'Content-Type':'application/json','privy-app-id':appId,Authorization:`Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`,...(key?{'privy-idempotency-key':key}:{})},...(body?{body:json(body)}:{}),signal:AbortSignal.timeout(15000)});}
   catch {throw Error('Privy transport failure; any pending mutation requires reconciliation');}
   let result;try {result=await response.json();} catch {throw Error('Privy response was not JSON; reconcile pending mutation');}
   if(!response.ok){
    persist('last-api-error.json',{path,httpStatus:response.status,body:result});
    const code=typeof result.code==='string'?result.code:typeof result.error?.code==='string'?result.error.code:'unclassified';
    const error=Error(`Privy HTTP ${response.status}; code ${/^[a-z_]+$/.test(code)?code:'unclassified'}`);
    error.code=code;error.httpStatus=response.status;throw error;
   }
   return result;
  }
  const user=await request(`/users/${encodeURIComponent(allowedUser)}`);
  if(user.id!==allowedUser||user.is_guest===true) throw Error('Pinned user verification failed');
  const policy=read('policy.json'),policyHash=keccak256(new TextEncoder().encode(json(policy)));
  const statePath=new URL('provision.json',privateDir);
  const state=existsSync(statePath)?JSON.parse(readFileSync(statePath)):{allowedUser,policyHash,externalId:'turtle-arc-demo',createdAt:new Date().toISOString()};
  if(state.allowedUser!==allowedUser||state.policyHash!==policyHash) throw Error('Provisioning identity or policy changed; explicit reconciliation required');
  if(state.pending) throw Error(`Unresolved ${state.pending} request; reconcile before retry`);
  if(process.argv[2]==='provision'){
   if(!state.wallet){
    const listed=await request('/wallets');
    if(!Array.isArray(listed.data)||listed.next_cursor) throw Error('Incomplete wallet listing requires explicit reconciliation');
    if(listed.data.some(wallet=>wallet.external_id===state.externalId||wallet.owner_id==null)) throw Error('Existing Turtle or app-controlled wallet requires explicit reconciliation; refusing duplicate creation');
   }
   if(!state.policyId){
    state.pending='policy';state.policyRequestKey=randomUUID();persist('provision.json',state);
    const created=await request('/policies','POST',policy,state.policyRequestKey);
    if(typeof created.id!=='string') throw Error('Unexpected policy response; reconcile pending request');
    state.policyId=created.id;delete state.pending;persist('provision.json',state);
   }
   if(!state.wallet){
    // Login linkage lives on this server. No user owner is set on the wallet.
    const body={chain_type:'ethereum',display_name:'Turtle Arc demo',external_id:state.externalId,policy_ids:[state.policyId]};
    state.pending='wallet';state.walletRequestKey=randomUUID();persist('provision.json',state);
    const wallet=await request('/wallets','POST',body,state.walletRequestKey);
    state.wallet={id:wallet.id,address:wallet.address,owner_id:wallet.owner_id,policy_ids:wallet.policy_ids};
    persist('provision.json',state);
    if(!wallet.id||!/^0x[0-9a-fA-F]{40}$/.test(wallet.address)||wallet.owner_id!==null||JSON.stringify(wallet.policy_ids)!==JSON.stringify([state.policyId])) throw Error('Wallet ownership or policy response mismatch; reconcile pending request');
    delete state.pending;persist('provision.json',state);
   }
  }
  if(!state.wallet) throw Error('Provision wallet first');
  const wallet=await request(`/wallets/${state.wallet.id}`);
  if(wallet.address.toLowerCase()!==state.wallet.address.toLowerCase()||wallet.owner_id!==null||wallet.additional_signers?.length!==0||JSON.stringify(wallet.policy_ids)!==JSON.stringify([state.policyId])) throw Error('Persisted wallet configuration mismatch');
  const fetched=await request(`/policies/${state.policyId}`);
  const normalized={version:fetched.version,name:fetched.name,chain_type:fetched.chain_type,rules:fetched.rules?.map(({id,...rule})=>rule)};
  // Compare object values independently of provider JSON property ordering.
  const canonical=(value)=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  if(JSON.stringify(canonical(normalized))!==JSON.stringify(canonical(policy))) throw Error('Attached policy differs from prepared policy');
  if(process.argv[2]==='provision'){console.log(json({walletAddress:wallet.address,linkedToPinnedUser:true,owner:null,policyVerified:true,fundingRequired:true}));return;}
  const client=createPublicClient({transport:http('https://rpc.testnet.arc.io',{retryCount:0,timeout:15000})});
  if(await client.getChainId()!==5042002) throw Error('Wrong RPC chain');
  const abi=read('vault-source.json').abi,vault='0xb8dc1f767167b567227326D8849175a188A0e78C';
  const buy=(pairId=1n,minSynth=1n)=>encodeFunctionData({abi,functionName:'buy',args:[pairId,minSynth]});
  // Deliberately distant fixture nonce avoids sharing an execution nonce. Never broadcast.
  const transaction={chain_id:5042002,type:2,to:vault,value:'0x16345785d8a0000',data:buy(),nonce:1000000000,gas_limit:300000,max_fee_per_gas:'0x174876e800',max_priority_fee_per_gas:'0x3b9aca00'};
  const cases=[['valid_buy',transaction,true],['wrong_chain',{...transaction,chain_id:1},false],['wrong_destination',{...transaction,to:'0x0000000000000000000000000000000000000001'},false],['wrong_method',{...transaction,data:encodeFunctionData({abi,functionName:'withdrawFees',args:[1n]})},false],['wrong_pair',{...transaction,data:buy(8n)},false],['excessive_value',{...transaction,value:'0xde0b6b3a7640001'},false],['zero_minimum',{...transaction,data:buy(1n,0n)},false]];
  const results=[];
  for(const [name,fixture,allowed] of cases){
   const path=new URL(`${name}.json`,privateDir);
   if(existsSync(path)) throw Error(`Fixture ${name} already exists; inspect saved result instead of signing again`);
   const record={name,expected:allowed?'signed':'policy_violation',idempotencyKey:randomUUID(),request:{method:'eth_signTransaction',params:{transaction:fixture}},status:'pending',neverBroadcast:true};
   persist(`${name}.json`,record);
   try {
    const signed=await request(`/wallets/${wallet.id}/rpc`,'POST',record.request,record.idempotencyKey);
    if(!/^0x[0-9a-fA-F]+$/.test(signed.data?.signed_transaction||'')) throw Error('Missing signed transaction');
    record.signedTransaction=signed.data.signed_transaction;record.hash=keccak256(record.signedTransaction);record.status='signed';persist(`${name}.json`,record);
    if(!allowed) throw Error(`Forbidden fixture ${name} signed; policy gate failed`);
    let decoded,signer;
    try {
     decoded=parseTransaction(record.signedTransaction);
     signer=await recoverTransactionAddress({serializedTransaction:record.signedTransaction});
    } catch {
     throw Error('Unable to decode or recover signed fixture; inspect private state');
    }
    if(signer.toLowerCase()!==wallet.address.toLowerCase()||decoded.chainId!==fixture.chain_id||decoded.nonce!==fixture.nonce||decoded.to.toLowerCase()!==fixture.to.toLowerCase()||decoded.value!==BigInt(fixture.value)||decoded.data!==fixture.data||decoded.gas!==BigInt(fixture.gas_limit)||decoded.maxFeePerGas!==BigInt(fixture.max_fee_per_gas)||decoded.maxPriorityFeePerGas!==BigInt(fixture.max_priority_fee_per_gas)||decoded.type!=='eip1559') throw Error('Signed fixture did not match immutable request');
    results.push({name,status:'signed_and_verified'});
   } catch(error){
    if(!allowed&&error.code==='policy_violation') {record.status='policy_violation';record.httpStatus=error.httpStatus;persist(`${name}.json`,record);results.push({name,status:'policy_violation'});}
    else throw error;
   }
  }
  writeFileSync(new URL('policy-results.json',base),json({observedAt:new Date().toISOString(),results,noBroadcast:true}));
  console.log('Policy signing gate passed; no fixture broadcast.');
 }finally{unlinkSync(lock);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
