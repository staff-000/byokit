import {GitHubVerification,verificationAccountView} from '../website/github-verification.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import worker,{signSession,readSession} from '../services/verification/worker.mjs';
import {canonicalReport,validateSubmission} from '../services/verification/report.mjs';
import {addReport,authenticateEvent} from '../scripts/publish-verification.mjs';
const catalog=JSON.parse(readFileSync('spec/fixtures/catalog.json'));catalog.providers.push({id:'deepseek',name:'DeepSeek',auth:'required',deployment:'hosted'});catalog.offerings.push({...catalog.offerings[0],id:'deepseek/test',providerId:'deepseek',apiModelId:'test'});
const report=()=>({operationId:'71e4f6ef-c19e-4d28-bdf6-10cb85fcaa08',offeringId:'deepseek/test',modelId:'test',protocol:'chat',checkedAt:new Date().toISOString(),latencyMs:200,maxTokens:256});
const user={id:123,login:'contributor'};
test('only current, known hosted settings and authenticated identities become reports',()=>{
 const r=report();assert.equal(canonicalReport(r,user,catalog).contributor,'github:contributor');assert.equal(canonicalReport(r,user,catalog).result,'passed');
 for(const invalid of [{...r,apiKey:'dummy-secret'},{...r,prompt:'secret prompt'},{...r,modelId:'custom'},{...r,protocol:'anthropic'},{...r,checkedAt:'2000-01-01T00:00:00Z'}])assert.throws(()=>validateSubmission(invalid,catalog));
 assert.throws(()=>canonicalReport(r,{id:0,login:'fake'},catalog));assert.throws(()=>canonicalReport(r,{id:123,login:'<script>'},catalog));
});
test('dispatches are authenticated before mutation and duplicate operations do not append twice',()=>{
 const payload={report:report(),user},signature=createHmac('sha256','fixture-signing-key').update('publish:'+JSON.stringify(payload)).digest('base64url');
 const event={action:'byokit-verification',client_payload:{payload,signature}};assert.deepEqual(authenticateEvent(event,'fixture-signing-key'),payload);
 assert.throws(()=>authenticateEvent({...event,client_payload:{...event.client_payload,payload:{...payload,user:{id:123,login:'forged'}}}},'fixture-signing-key'));
 const first=addReport(catalog,[],payload);assert.equal(first.changed,true);assert.equal(first.reports.length,1);assert.equal(addReport(first.data,first.reports,payload).changed,false);assert.equal(catalog.verifications?.length??0,0);
});
test('memory-only sessions expire, reject forged identities and never contain provider credentials',async()=>{
 const session={...user,aud:'byokit-verification',exp:Math.floor(Date.now()/1000)+3600},token=await signSession(session,'fixture-session-secret');
 assert.equal((await readSession(token,'fixture-session-secret')).login,'contributor');await assert.rejects(readSession(token+'tampered','fixture-session-secret'));
 await assert.rejects(readSession(token,'fixture-session-secret',Date.now()+7200000));assert.ok(!token.includes('dummy-provider-key'));
});
const env=()=>({PUBLIC_SITE_URL:'https://staff-000.github.io/byokit/verification.html',GITHUB_CLIENT_ID:'fixture-client',GITHUB_CLIENT_SECRET:'fixture-client-secret',GITHUB_APP_ID:'1',GITHUB_INSTALLATION_ID:'1',GITHUB_APP_PRIVATE_KEY:'fixture-key',SESSION_SECRET:'fixture-session-secret',PUBLICATION_SECRET:'fixture-publication-secret'});
test('unconfigured, anonymous and foreign-origin requests cannot dispatch writes',async()=>{
 assert.equal((await worker.fetch(new Request('https://auth.example/session'),{})).status,503);
 let calls=0;const e={...env(),fetch:async()=>{calls++;throw new Error('must not be called')}};
 const anonymous=await worker.fetch(new Request('https://auth.example/verifications',{method:'POST',headers:{Origin:'https://staff-000.github.io'},body:JSON.stringify(report())}),e);assert.equal(anonymous.status,400);
 const foreign=await worker.fetch(new Request('https://auth.example/verifications',{method:'POST',headers:{Origin:'https://evil.example'},body:JSON.stringify(report())}),e);assert.equal(foreign.status,403);assert.equal(calls,0);
});
test('sign-in uses state cookie and PKCE; callback identity comes from GitHub rather than the browser',async()=>{
 const e=env();let fetches=0;e.fetch=async(url,options)=>{fetches++;if(url==='https://github.com/login/oauth/access_token'){assert.ok(JSON.parse(options.body).code_verifier);return new Response(JSON.stringify({access_token:'dummy-github-user-token'}));}assert.equal(url,'https://api.github.com/user');assert.equal(options.headers.Authorization,'Bearer dummy-github-user-token');return new Response(JSON.stringify(user));};
 const start=await worker.fetch(new Request('https://auth.example/auth/start'),e);assert.equal(start.status,302);const authorization=new URL(start.headers.get('Location'));assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');assert.ok(start.headers.get('Set-Cookie').includes('HttpOnly'));
 const cookie=start.headers.get('Set-Cookie').split(';')[0],url=new URL('https://auth.example/auth/callback');url.searchParams.set('state',authorization.searchParams.get('state'));url.searchParams.set('code','fixture-code');
 const callback=await worker.fetch(new Request(url,{headers:{Cookie:cookie}}),e),html=await callback.text();assert.equal(callback.status,200);assert.ok(html.includes('byokit-github-login'));assert.ok(!html.includes('dummy-github-user-token'));assert.ok(!html.includes('fixture-client-secret'));assert.equal(fetches,2);
 const invalid=await worker.fetch(new Request(url),e);assert.equal(invalid.status,400);assert.equal(fetches,2);
});
test('authenticated publication emits only the signed minimal report and fixed repository target',async()=>{
 const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await crypto.subtle.exportKey('pkcs8',key.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
 let dispatched;const e={...env(),GITHUB_APP_PRIVATE_KEY:pem,fetch:async(url,options)=>{
  if(url.includes('/access_tokens'))return new Response(JSON.stringify({token:'dummy-installation-token'}));
  if(url.endsWith('/catalog/catalog.json')){assert.equal(options.headers.Accept,'application/vnd.github.raw+json');return new Response(JSON.stringify(catalog));}
  if(url.endsWith('/catalog/verifications.json'))return new Response('[]');
  assert.equal(url,'https://api.github.com/repos/staff-000/byokit/dispatches');dispatched=JSON.parse(options.body);return new Response(null,{status:204});
 }};
 const session=await signSession({...user,aud:'byokit-verification',exp:Math.floor(Date.now()/1000)+3600},e.SESSION_SECRET);
 const response=await worker.fetch(new Request('https://auth.example/verifications',{method:'POST',headers:{Origin:'https://staff-000.github.io',Authorization:'Bearer '+session},body:JSON.stringify(report())}),e);
 assert.equal(response.status,202);assert.equal(dispatched.event_type,'byokit-verification');assert.equal(authenticateEvent({action:dispatched.event_type,client_payload:dispatched.client_payload},e.PUBLICATION_SECRET).user.login,'contributor');assert.ok(!JSON.stringify(dispatched).includes('dummy-installation-token'));assert.ok(!JSON.stringify(dispatched).includes('PRIVATE KEY'));
});

test('browser publication whitelists settings and never transmits provider key, prompt or generated text',async()=>{
 const original=globalThis.fetch;let sent;
 globalThis.fetch=async(url,options)=>{sent=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer fixture-session');return new Response('{"status":"queued"}');};
 try{
  const client=new GitHubVerification('https://auth.example','https://site.example');client.token='fixture-session';client.user=user;
  const r=report();await client.publish({...r,apiKey:'dummy-provider-secret',prompt:'private-prompt'}, {checkedAt:r.checkedAt,latencyMs:200,text:'private-output'},r.operationId);
  assert.deepEqual(Object.keys(sent).sort(),Object.keys(r).sort());assert.ok(!JSON.stringify(sent).includes('private-'));assert.ok(!JSON.stringify(sent).includes('dummy-provider-secret'));
 }finally{globalThis.fetch=original;}
});
test('late auth responses cannot overwrite another sign-in session',async()=>{
 const original=globalThis.fetch;let resolve;
 globalThis.fetch=()=>new Promise(r=>resolve=r);
 try{
  const client=new GitHubVerification('https://auth.example','https://site.example');client.token='old-session';client.user=user;
  const checking=client.check();client.token='new-session';client.user={id:456,login:'new-user'};resolve(new Response(JSON.stringify({user})));
  await assert.rejects(checking,/session changed/);assert.equal(client.token,'new-session');assert.equal(client.user.login,'new-user');
 }finally{globalThis.fetch=original;}
});

// The deployed service can be absent even while the visitor is signed into GitHub.
test('account UI distinguishes missing site setup from missing visitor authentication',()=>{
 const unavailable=verificationAccountView({base:'',user:null});
 assert.match(unavailable.heading,/not available/);assert.match(unavailable.description,/not configured/);
 assert.equal(unavailable.signInVisible,false);assert.equal(unavailable.signedIn,false);
 assert.deepEqual(verificationAccountView({base:'',user}),unavailable);
 const anonymous=verificationAccountView({base:'https://auth.example',user:null});
 assert.equal(anonymous.signInVisible,true);assert.equal(anonymous.signedIn,false);
 assert.match(anonymous.description,/already signed in on github.com/);
 const connected=verificationAccountView({base:'https://auth.example',user});
 assert.equal(connected.heading,'Signed in as @contributor');assert.equal(connected.signedIn,true);
 assert.equal(connected.signInVisible,false);
});
