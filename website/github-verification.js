// GitHub identity/session tokens stay in page memory. AI keys never enter this module.
export class GitHubVerification {
 constructor(base,siteOrigin=location.origin){this.base=base?.replace(/\/$/,'')||'';this.siteOrigin=siteOrigin;this.token='';this.user=null;this.popup=null;this.timer=null;this.loginHandler=null;}
 async request(path,options={}){
  if(!this.base)throw new Error('GitHub sign-in is not configured yet.');
  const r=await fetch(this.base+path,{...options,headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{}),...options.headers},credentials:'omit',redirect:'error',cache:'no-store'});
  if(!r.ok)throw new Error('GitHub sign-in or publication is unavailable. Sign in again or try later.');return r.json();
 }
 async check(signal){
  const token=this.token;
  try{const result=await this.request('/session',{signal});if(token!==this.token)throw new Error('GitHub session changed.');this.user=result.user;return this.user;}
  catch(error){if(token===this.token)this.signOut();throw error;}
 }
 signIn(onChange){
  if(!this.base)throw new Error('GitHub sign-in is not configured yet.');
  this.clearLogin();this.popup=window.open(this.base+'/auth/start','byokit-github-sign-in','popup,width=620,height=740');if(!this.popup)throw new Error('Allow the GitHub sign-in popup.');
  const popup=this.popup,origin=new URL(this.base).origin;
  this.loginHandler=async event=>{
   if(event.origin!==origin||event.source!==popup||event.data?.type!=='byokit-github-login'||typeof event.data.token!=='string')return;
   this.clearLogin();this.token=event.data.token;
   try{await this.check();onChange(this.user)}catch{this.signOut();onChange(null)}
  };
  window.addEventListener('message',this.loginHandler);this.timer=setTimeout(()=>{this.clearLogin();onChange(null)},120000);
 }
 clearLogin(){if(this.loginHandler)window.removeEventListener('message',this.loginHandler);clearTimeout(this.timer);this.loginHandler=null;this.timer=null;this.popup?.close();this.popup=null;}
 signOut(){this.clearLogin();this.token='';this.user=null;}
 async publish(settings,result,operationId){
  if(!this.user)throw new Error('Sign in with GitHub before publishing.');
  const report={operationId,offeringId:settings.offeringId,modelId:settings.modelId,protocol:settings.protocol,checkedAt:result.checkedAt,latencyMs:result.latencyMs,maxTokens:settings.maxTokens};
  return this.request('/verifications',{method:'POST',body:JSON.stringify(report)});
 }
}
