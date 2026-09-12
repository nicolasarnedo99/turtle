import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
loadEnvFile(fileURLToPath(new URL('../../.env',import.meta.url)));
const appId=process.env.PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET;
if(!appId||!secret) throw Error('Missing Privy credentials');
let response;
try {
 response=await fetch('https://api.privy.io/v1/wallets',{headers:{'privy-app-id':appId,Authorization:`Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`},signal:AbortSignal.timeout(15000)});
} catch { throw Error('Privy read-only preflight transport failure'); }
if(!response.ok) throw Error(`Privy read-only preflight HTTP ${response.status}`);
const body=await response.json();
if(!Array.isArray(body.data)) throw Error('Unexpected wallet list schema');
const report={observedAt:new Date().toISOString(),httpStatus:response.status,firstPageWalletCount:body.data.length,morePages:Boolean(body.next_cursor),allowedUserConfigured:Boolean(process.env.TURTLE_ALLOWED_PRIVY_USER_ID),turtleWalletCandidates:body.data.filter(wallet=>wallet.external_id==='turtle-arc-demo').length};
writeFileSync(new URL('privy-preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
