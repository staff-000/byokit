import {call,callClaude,prepareCall,CallError,validateHeaders} from './call.js';
import {ApiProtocol} from './enums.js';
const invalid=message=>{throw new CallError('INVALID_REQUEST',message)};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const optionKeys=['runtimeChecks','timeoutMs','signal','inputTokens','overheadTokens','onWarning','fetch','headers'];
function options(value={}){
 if(!object(value)||Object.keys(value).some(k=>!optionKeys.includes(k)))invalid('Unsupported client request option.');
 return {...value};
}
function selectModel(bound,requested){
 if(requested===undefined||requested===bound.apiModelId)return structuredClone(bound);
 if(typeof requested!=='string'||!requested.trim())invalid('model must be an API model ID.');
 // A custom ID has unknown limits; never borrow another model’s fit metadata.
 return {...structuredClone(bound),id:`${bound.providerId}/${requested}`,apiModelId:requested,limits:{context:null,input:null,output:null,contextAccounting:'unknown'},features:{},status:undefined};
}
async function credential(source,signal,timeoutMs){
 if(signal?.aborted)throw new CallError('CANCELED','Call canceled.');
 let timer,abort;
 try{
  const key=await Promise.race([
   Promise.resolve().then(source).catch(()=>{throw new CallError('CREDENTIAL_ERROR','Could not obtain the API key.');}),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(new CallError('TIMEOUT','Call timed out.')),timeoutMs);abort=()=>reject(new CallError('CANCELED','Call canceled.'));signal?.addEventListener('abort',abort,{once:true});}),
  ]);
  if(typeof key!=='string')invalid('The API key callback must return a string.');
  return key;
 }finally{clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);}
}
function createClient(config,format){
 if(!object(config)||Object.keys(config).some(k=>!['model','apiKey',...optionKeys].includes(k)))invalid('Provide model, apiKey callback and supported client options.');
 if(!object(config.model))invalid('Select a model from getModels().');
 // The client captures only non-secret configuration and the application’s key accessor.
 const bound=structuredClone(config.model),source=config.apiKey??(bound.local?()=> '':undefined);
 if(typeof source!=='function')invalid('apiKey must be a callback; clients do not retain key strings.');
 const defaults=options(Object.fromEntries(Object.entries(config).filter(([k])=>optionKeys.includes(k))));
 const create=async(params,requestOptions={})=>{
  if(!object(params))invalid('Provide a structured completion request.');
  const {model:requested,...input}=structuredClone(params),model=selectModel(bound,requested),opts={...defaults,...options(requestOptions)};
  const timeoutMs=opts.timeoutMs??90000;if(!Number.isFinite(timeoutMs)||timeoutMs<=0)invalid('timeoutMs must be positive.');
  // Validate before obtaining credentials. The underlying adapter emits fit warnings once.
  prepareCall(model,input,{format,runtimeChecks:opts.runtimeChecks??true,inputTokens:opts.inputTokens,overheadTokens:opts.overheadTokens});
  const started=Date.now(),key=await credential(source,opts.signal,timeoutMs),remaining=timeoutMs-(Date.now()-started);
  if(remaining<=0)throw new CallError('TIMEOUT','Call timed out.');
  return (format==='claude'?callClaude:call)(model,input,key,{...opts,timeoutMs:remaining});
 };
 return format==='claude'?Object.freeze({messages:Object.freeze({create})}):Object.freeze({chat:Object.freeze({completions:Object.freeze({create})})});
}
/** @deprecated Use new OpenAI({baseURL, apiKey}). */
export function openAI(config){return createClient(config,'openai');}
/** @deprecated Use new Anthropic({baseURL, apiKey}). */
export function claude(config){return createClient(config,'claude');}
/** OpenAI-style reusable client, bound to one endpoint and account. */
export class OpenAI {constructor(config){this.chat=object(config)&&config.model?openAI(config).chat:standardClient(config,'openai').chat;Object.freeze(this);}}
/** Claude-style reusable client, bound to one endpoint and account. */
export class Anthropic {constructor(config){this.messages=object(config)&&config.model?claude(config).messages:standardClient(config,'claude').messages;Object.freeze(this);}}

function endpoint(value,protocol){
 let url;try{url=new URL(value)}catch{invalid('baseURL must be an HTTP(S) endpoint.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)invalid('baseURL must be HTTP(S), without credentials, query or fragment.');
 let base=url.href.replace(/\/$/,'');
 // Anthropic SDK base URLs conventionally omit the /v1 API prefix.
 if(protocol===ApiProtocol.Claude&&!base.endsWith('/v1'))base+='/v1';
 return base;
}
function standardClient(config,format){
 if(!object(config)||Object.keys(config).some(k=>!['apiKey','baseURL','defaultHeaders','models','protocol',...optionKeys].includes(k)))invalid('Unsupported client configuration.');
 if(typeof config.apiKey!=='string')invalid('Provide apiKey as a constructor string (empty for an unauthenticated endpoint).');
 const protocol=config.protocol??(format==='claude'?ApiProtocol.Claude:ApiProtocol.OpenAI);
 if(!Object.values(ApiProtocol).includes(protocol))invalid('Unsupported API protocol.');
 const baseURL=endpoint(config.baseURL??(format==='claude'?'https://api.anthropic.com':'https://api.openai.com/v1'),protocol);
 const defaults=options(Object.fromEntries(Object.entries(config).filter(([k])=>optionKeys.includes(k))));
 const defaultHeaders=validateHeaders(config.defaultHeaders??{});
 if(defaults.runtimeChecks!==undefined&&typeof defaults.runtimeChecks!=='boolean')invalid('runtimeChecks must be boolean.');
 if(defaults.timeoutMs!==undefined&&(!Number.isFinite(defaults.timeoutMs)||defaults.timeoutMs<=0))invalid('timeoutMs must be positive.');
 if(config.models!==undefined&&!Array.isArray(config.models))invalid('models must be a list of catalog offerings.');
 const known=new Map();
 for(const m of config.models??[]){
  if(!object(m)||typeof m.apiModelId!=='string'||!m.connection||endpoint(m.connection.baseUrl,m.connection.protocol)!==baseURL||m.connection.protocol!==protocol||known.has(m.apiModelId))invalid('Model metadata must uniquely match the client endpoint and protocol.');
  known.set(m.apiModelId,structuredClone(m));
 }
 // Capture the account key in closure memory only. No persistent storage or
 // enumerable key/config field exists, and request destinations cannot override it.
 const key=config.apiKey;
 const create=async(params,requestOptions={})=>{
  if(!object(params)||typeof params.model!=='string'||!params.model.trim())invalid('Provide model as an API model ID string.');
  let input;try{input=structuredClone(params)}catch{invalid('Request must contain cloneable data.');}
  const id=input.model;delete input.model;
  const opts={...defaults,...options(requestOptions)};
  opts.headers={...defaultHeaders,...validateHeaders(opts.headers??{})};
  const selected=known.has(id)?structuredClone(known.get(id)):{id,providerId:baseURL==='https://api.openai.com/v1'?'openai':'custom',apiModelId:id,connection:{baseUrl:baseURL,protocol},limits:{context:null,input:null,output:null,contextAccounting:'unknown'},features:{}};
  selected.connection={baseUrl:baseURL,protocol};
  // Empty keys are an explicit opt-in for unauthenticated endpoints.
  if(!key)selected.local={endpoint:baseURL};
  return (format==='claude'?callClaude:call)(selected,input,key,opts);
 };
 return format==='claude'?{messages:Object.freeze({create})}:{chat:Object.freeze({completions:Object.freeze({create})})};
}

// The branded client retains only non-secret defaults. Every request owns its
// exact offering and transient key; no model/key registry or key accessor exists.
function clientDefaults(config={}){
 if(!object(config)||Object.keys(config).some(k=>!['runtimeChecks','timeoutMs'].includes(k)))invalid('Provide only runtimeChecks and timeoutMs client defaults.');
 if(config.runtimeChecks!==undefined&&typeof config.runtimeChecks!=='boolean')invalid('runtimeChecks must be boolean.');
 if(config.timeoutMs!==undefined&&(!Number.isFinite(config.timeoutMs)||config.timeoutMs<=0))invalid('timeoutMs must be positive.');
 return {...config};
}
function createRequest(defaults,format){
 return async(params,requestOptions={})=>{
  if(!object(params)||!object(params.model))invalid('Provide a model object and structured request.');
  if(!object(requestOptions)||Object.keys(requestOptions).some(k=>!['apiKey',...optionKeys].includes(k)))invalid('Unsupported client request option.');
  let captured;try{captured=structuredClone(params)}catch{invalid('Request and model must contain cloneable data.');}
  const {model,...input}=captured,{apiKey='',...execution}=requestOptions;
  const opts={...defaults,...execution};
  if(opts.runtimeChecks!==undefined&&typeof opts.runtimeChecks!=='boolean')invalid('runtimeChecks must be boolean.');
  // call()/callClaude() validate and build the wire request before yielding.
  return (format==='claude'?callClaude:call)(model,input,apiKey,opts);
 };
}
/** @deprecated Use OpenAI or Anthropic with constructor credentials. */
export class Byokit {
 constructor(config={}){
  const defaults=clientDefaults(config);
  this.chat=Object.freeze({completions:Object.freeze({create:createRequest(defaults,'openai')})});
  this.messages=Object.freeze({create:createRequest(defaults,'claude')});
  Object.freeze(this);
 }
}
