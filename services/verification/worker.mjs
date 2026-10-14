import {canonicalReport} from './report.mjs';
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const json64=data=>b64(enc.encode(JSON.stringify(data)));
async function hmac(secret,text){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,enc.encode(text)));}
async function validHmac(secret,text,sig){try{const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);return await crypto.subtle.verify('HMAC',key,decode(sig),enc.encode(text))}catch{return false}}
export async function signSession(data,secret){const payload=json64(data);return payload+'.'+await hmac(secret,'session:'+payload);}
export async function readSession(token,secret,now=Date.now()){
 const [payload,sig,...extra]=(token||'').split('.');if(extra.length||!payload||!sig||!await validHmac(secret,'session:'+payload,sig))throw new Error('Sign in with GitHub.');
 let data;try{data=JSON.parse(new TextDecoder().decode(decode(payload)))}catch{throw new Error('Sign in with GitHub.')}
 if(data.aud!=='byokit-verification'||typeof data.login!=='string'||!Number.isSafeInteger(data.id)||data.id<=0||!/^[a-z0-9-]{1,39}$/i.test(data.login)||!Number.isFinite(data.exp)||data.exp*1000<=now)throw new Error('GitHub session expired.');return data;
}
function der(tag,bytes){const n=bytes.length,len=n<128?[n]:n<256?[129,n]:[130,n>>8,n&255];return new Uint8Array([tag,...len,...bytes]);}
async function appJwt(env){
 const header=json64({alg:'RS256',typ:'JWT'}),now=Math.floor(Date.now()/1000),payload=json64({iat:now-60,exp:now+540,iss:env.GITHUB_APP_ID});
 let pem=env.GITHUB_APP_PRIVATE_KEY,bytes=decode(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'').replace(/\+/g,'-').replace(/\//g,'_'));
 if(pem.includes('BEGIN RSA PRIVATE KEY'))bytes=der(48,new Uint8Array([2,1,0,48,13,6,9,42,134,72,134,247,13,1,1,1,5,0,...der(4,bytes)]));
 const key=await crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 return header+'.'+payload+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(header+'.'+payload)));
}
async function github(path,token,init={},fetcher=fetch){
 const response=await fetcher('https://api.github.com'+path,{...init,headers:{'User-Agent':'byokit-verification','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...init.headers},redirect:'error'});
 if(!response.ok)throw new Error('GitHub request failed.');return response.status===204?null:response.json();
}
async function installationToken(env,fetcher){const data=await github(`/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,await appJwt(env),{method:'POST',body:JSON.stringify({repositories:['byokit'],permissions:{contents:'write'}})},fetcher);return data.token;}
async function repoData(path,token,fetcher){return github('/repos/staff-000/byokit/contents/'+path,token,{headers:{Accept:'application/vnd.github.raw+json'}},fetcher);}
function response(data,status=200,origin){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});}
function configured(env){return ['PUBLIC_SITE_URL','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','GITHUB_APP_ID','GITHUB_INSTALLATION_ID','GITHUB_APP_PRIVATE_KEY','SESSION_SECRET','PUBLICATION_SECRET'].every(k=>typeof env[k]==='string'&&env[k]);}
export default {async fetch(request,env){
 const fetcher=env.fetch||globalThis.fetch,url=new URL(request.url),site=new URL(env.PUBLIC_SITE_URL||'https://staff-000.github.io/byokit/verification.html'),origin=request.headers.get('Origin');
 if(origin&&origin!==site.origin)return response({error:'Origin is not allowed.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':site.origin,'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST','Vary':'Origin'}});
 if(!configured(env))return response({error:'GitHub verification service is not configured.'},503,origin);
 try{
  if(url.pathname==='/auth/start'){
   const nonce=crypto.randomUUID(),verifier=b64(crypto.getRandomValues(new Uint8Array(32))),expires=Math.floor(Date.now()/1000)+600;
   const cookie=json64({nonce,verifier,expires}),state=json64({nonce,expires})+'.'+await hmac(env.SESSION_SECRET,'oauth:'+cookie);
   const auth=new URL('https://github.com/login/oauth/authorize');auth.searchParams.set('client_id',env.GITHUB_CLIENT_ID);auth.searchParams.set('redirect_uri',url.origin+'/auth/callback');auth.searchParams.set('state',state);auth.searchParams.set('code_challenge',b64(await crypto.subtle.digest('SHA-256',enc.encode(verifier))));auth.searchParams.set('code_challenge_method','S256');
   return new Response(null,{status:302,headers:{Location:auth.href,'Set-Cookie':`__Host-byokit-oauth=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/auth/callback'){
   const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-byokit-oauth=([^;]+)/)?.[1],state=url.searchParams.get('state');
   if(!cookie||!state)throw new Error('Invalid sign-in state.');const data=JSON.parse(new TextDecoder().decode(decode(cookie))),[payload,sig]=state.split('.');
   if(payload!==json64({nonce:data.nonce,expires:data.expires})||data.expires*1000<=Date.now()||!await validHmac(env.SESSION_SECRET,'oauth:'+cookie,sig))throw new Error('Sign-in state expired or invalid.');
   const tokenResponse=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:url.origin+'/auth/callback',code_verifier:data.verifier}),redirect:'error'});
   if(!tokenResponse.ok)throw new Error('GitHub sign-in failed.');const tokenData=await tokenResponse.json();if(typeof tokenData.access_token!=='string')throw new Error('GitHub sign-in was canceled.');
   const user=await github('/user',tokenData.access_token,{},fetcher);if(!Number.isSafeInteger(user.id)||typeof user.login!=='string'||!/^[a-z0-9-]{1,39}$/i.test(user.login))throw new Error('Invalid GitHub identity.');
   const token=await signSession({id:user.id,login:user.login,aud:'byokit-verification',exp:Math.floor(Date.now()/1000)+3600},env.SESSION_SECRET),message=JSON.stringify({type:'byokit-github-login',token,user:{id:user.id,login:user.login}}).replace(/</g,'\\u003c');
   return new Response(`<!doctype html><meta charset="utf-8"><title>Signed in to byokit</title><p>Signed in. You can close this window.</p><script>if(window.opener){window.opener.postMessage(${message},${JSON.stringify(site.origin)});window.close();}</script>`,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Set-Cookie':'__Host-byokit-oauth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
  }
  const session=await readSession(request.headers.get('Authorization')?.replace(/^Bearer /,''),env.SESSION_SECRET);
  if(url.pathname==='/session')return response({user:{id:session.id,login:session.login},expiresAt:new Date(session.exp*1000).toISOString()},200,origin);
  if(url.pathname==='/verifications'&&request.method==='POST'){
   if(origin!==site.origin)return response({error:'Origin is required.'},403,origin);
   const raw=await request.text();if(raw.length>4096)return response({error:'Report is too large.'},400,origin);const report=JSON.parse(raw),token=await installationToken(env,fetcher),catalog=await repoData('catalog/catalog.json',token,fetcher);
   const record=canonicalReport(report,session,catalog),payload={report,user:{id:session.id,login:session.login}};
   const existing=await repoData('catalog/verifications.json',token,fetcher);
   if(existing.some(r=>r.id===record.id))return response({id:record.id,status:'published'},200,origin);
   if(existing.filter(r=>r.contributor.toLowerCase()===record.contributor.toLowerCase()&&Date.now()-Date.parse(r.checkedAt)<86400000).length>=10)return response({error:'Daily contribution limit reached.'},429,origin);
   const serialized=JSON.stringify(payload),signature=await hmac(env.PUBLICATION_SECRET,'publish:'+serialized);
   await github('/repos/staff-000/byokit/dispatches',token,{method:'POST',body:JSON.stringify({event_type:'byokit-verification',client_payload:{payload,signature}})},fetcher);
   return response({id:record.id,status:'queued'},202,origin);
  }
  if(url.pathname==='/verifications'&&request.method==='GET'){
   const id=url.searchParams.get('id');if(!id?.startsWith(`website:${session.id}:`))return response({error:'Invalid report ID.'},403,origin);
   const token=await installationToken(env,fetcher),records=await repoData('catalog/verifications.json',token,fetcher);return response({id,status:records.some(r=>r.id===id)?'published':'queued'},200,origin);
  }
  return response({error:'Unknown endpoint.'},404,origin);
 }catch{return response({error:'Sign in again, or check the verification service configuration.'},400,origin)}
}};
