import {call,callClaude,prepareCall,CallError} from './call.js';
const invalid=message=>{throw new CallError('INVALID_REQUEST',message)};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const optionKeys=['runtimeChecks','timeoutMs','signal','inputTokens','overheadTokens','onWarning','fetch'];
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
/** OpenAI-style SDK surface; inference still uses the selected provider’s adapter. */
export function openAI(config){return createClient(config,'openai');}
export function claude(config){return createClient(config,'claude');}
export class OpenAI {constructor(config){this.chat=openAI(config).chat;Object.freeze(this);}}
export class Anthropic {constructor(config){this.messages=claude(config).messages;Object.freeze(this);}}
