import {call,prepareCall,ApiProtocol} from '../packages/core/index.js';
// Verification UI: shared library adapters, browser-local records, no stored credentials.
export const ProviderApi=Object.freeze({
 openai:{name:'OpenAI',base:'https://api.openai.com/v1',protocols:['chat'],docs:'https://developers.openai.com/api/reference'},
 anthropic:{name:'Anthropic',base:'https://api.anthropic.com/v1',protocols:['anthropic'],docs:'https://platform.claude.com/docs/en/api/messages/create'},
 google:{name:'Google Gemini',base:'https://generativelanguage.googleapis.com/v1beta',protocols:['gemini'],docs:'https://ai.google.dev/api/generate-content'},
 openrouter:{name:'OpenRouter',base:'https://openrouter.ai/api/v1',protocols:['chat'],docs:'https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request'},
 deepseek:{name:'DeepSeek',base:'https://api.deepseek.com/v1',protocols:['chat'],docs:'https://api-docs.deepseek.com/api/create-chat-completion'},
 mistral:{name:'Mistral',base:'https://api.mistral.ai/v1',protocols:['chat'],docs:'https://docs.mistral.ai/api'},
 groq:{name:'Groq',base:'https://api.groq.com/openai/v1',protocols:['chat'],docs:'https://console.groq.com/docs/api-reference'},
 zhipuai:{name:'Zhipu AI',base:'https://open.bigmodel.cn/api/paas/v4',protocols:['chat'],docs:'https://docs.bigmodel.cn'},
 siliconflow:{name:'SiliconFlow',base:'https://api.siliconflow.cn/v1',protocols:['chat'],docs:'https://docs.siliconflow.cn/docs/api/chat-completions-post'},
 local:{name:'Local',protocols:['chat','ollama']},
});
export const ProtocolNames={responses:'OpenAI Responses',chat:'OpenAI-compatible Chat Completions',anthropic:'Anthropic Messages',gemini:'Gemini GenerateContent',ollama:'Ollama native Chat'};
function verificationModel(settings){
 const provider=ProviderApi[settings.providerId];if(!provider||!provider.protocols.includes(settings.protocol))throw new Error('Unsupported API for this provider.');
 let base=provider.base;
 if(settings.providerId==='local'){
  base=settings.endpoint?.replace(/\/$/,'');if(settings.protocol==='chat'&&base&&!base.endsWith('/v1'))base+='/v1';if(settings.protocol==='ollama')base=base?.replace(/\/v1$/,'');
 }
 return {id:settings.offeringId,providerId:settings.providerId,apiModelId:settings.modelId,connection:{baseUrl:base,protocol:{chat:ApiProtocol.OpenAI,anthropic:ApiProtocol.Claude,gemini:ApiProtocol.Gemini,ollama:ApiProtocol.Ollama}[settings.protocol]},...(settings.providerId==='local'?{local:{endpoint:settings.endpoint}}:{})};
}
function verificationInput(settings){
 if(typeof settings.prompt!=='string'||!settings.prompt.trim()||settings.prompt.length>8000)throw new Error('Enter a prompt of up to 8,000 characters.');
 if(!Number.isInteger(settings.maxTokens)||settings.maxTokens<16||settings.maxTokens>8192)throw new Error('Use an output limit from 16 to 8,192 tokens.');
 return {messages:[{role:'user',content:settings.prompt}],max_completion_tokens:settings.maxTokens};
}
export function requestFor(settings,key){
 if(typeof key!=='string'||!key&&settings.providerId!=='local')throw new Error('Enter a provider API key.');
 const request=prepareCall(verificationModel(settings),verificationInput(settings),{runtimeChecks:false});
 const headers={'Content-Type':'application/json'};
 if(request.protocol===ApiProtocol.Claude){headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';}
 else if(request.protocol===ApiProtocol.Gemini)headers['x-goog-api-key']=key;
 else if(key)headers.Authorization='Bearer '+key;
 return {url:request.url,body:request.body,headers};
}
export async function verifyInference(settings,key,options={}){
 const model=verificationModel(settings),input=verificationInput(settings);
 const started=Date.now(),result=await call(model,input,key,{...options,runtimeChecks:false});
 const text=result.choices[0].message.content;if(!text?.trim())throw new Error('Call returned no visible text. No success recorded.');
 return {text:text.slice(0,10000),checkedAt:new Date().toISOString(),latencyMs:Date.now()-started,returnedModel:result.model,usage:{...(result.usage.prompt_tokens!==undefined?{inputTokens:result.usage.prompt_tokens}:{}),...(result.usage.completion_tokens!==undefined?{outputTokens:result.usage.completion_tokens}:{})},endpoint:prepareCall(model,input,{runtimeChecks:false}).url};
}
export function successRecord(settings,result,secret=''){const safe=value=>typeof value==='string'&&secret.trim()?value.split(secret.trim()).join('[redacted]'):value;return {schemaVersion:1,id:crypto.randomUUID(),offeringId:safe(settings.offeringId),providerId:settings.providerId,modelId:safe(settings.modelId),returnedModel:safe(result.returnedModel),protocol:settings.protocol,endpoint:safe(result.endpoint),maxTokens:settings.maxTokens,checkedAt:result.checkedAt,latencyMs:result.latencyMs,result:'passed',checks:['textGeneration'],adapter:'byokit-website@1',usage:{...result.usage},scope:'this-browser'};}
export function safeRecords(input){if(!Array.isArray(input))return [];const keys=['schemaVersion','id','offeringId','providerId','modelId','returnedModel','protocol','endpoint','maxTokens','checkedAt','latencyMs','result','checks','adapter','usage','scope'];return input.filter(r=>r&&r.schemaVersion===1&&r.result==='passed'&&r.scope==='this-browser'&&typeof r.offeringId==='string'&&typeof r.checkedAt==='string'&&Number.isFinite(Date.parse(r.checkedAt))&&Object.keys(r).every(k=>keys.includes(k))).slice(0,200);}
