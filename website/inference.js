// Website-only inference adapters. Credentials never enter the catalog library.
export const ProviderApi=Object.freeze({
 openai:{name:'OpenAI',base:'https://api.openai.com/v1',protocols:['responses','chat'],docs:'https://developers.openai.com/api/reference'},
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
export function requestFor(settings,key){
 const provider=ProviderApi[settings.providerId];if(!provider)throw new Error('This provider has no website adapter.');
 if(!provider.protocols.includes(settings.protocol))throw new Error('Unsupported API for this provider.');
 if(typeof settings.modelId!=='string'||!settings.modelId.trim())throw new Error('Enter a model ID.');
 if(typeof settings.prompt!=='string'||!settings.prompt.trim()||settings.prompt.length>8000)throw new Error('Enter a prompt of up to 8,000 characters.');
 if(!Number.isInteger(settings.maxTokens)||settings.maxTokens<16||settings.maxTokens>8192)throw new Error('Use an output limit from 16 to 8,192 tokens.');
 if(typeof key!=='string'||(!key.trim()&&settings.providerId!=='local'))throw new Error('Enter this provider’s API key.');
 let base=provider.base;
 if(settings.providerId==='local'){
  let url;try{url=new URL(settings.endpoint)}catch{throw new Error('Enter the local server URL.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Use an HTTP(S) server URL without credentials, query, or fragment.');
  base=url.href.replace(/\/$/,'');if(settings.protocol==='chat'&&!base.endsWith('/v1'))base+='/v1';if(settings.protocol==='ollama')base=base.replace(/\/v1$/,'');
 }
 const headers={'Content-Type':'application/json'},model=settings.modelId.trim(),messages=[{role:'user',content:settings.prompt}];let body,url;
 if(settings.protocol==='anthropic'){headers['x-api-key']=key.trim();headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';url=base+'/messages';body={model,messages,max_tokens:settings.maxTokens,stream:false};}
 else if(settings.protocol==='gemini'){headers['x-goog-api-key']=key.trim();url=base+'/models/'+encodeURIComponent(model.replace(/^models\//,''))+':generateContent';body={contents:[{role:'user',parts:[{text:settings.prompt}]}],generationConfig:{maxOutputTokens:settings.maxTokens}};}
 else {if(key.trim())headers.Authorization='Bearer '+key.trim();if(settings.protocol==='responses'){url=base+'/responses';body={model,input:settings.prompt,max_output_tokens:settings.maxTokens,store:false};}else if(settings.protocol==='ollama'){url=base+'/api/chat';body={model,messages,stream:false,options:{num_predict:settings.maxTokens}};}else{url=base+'/chat/completions';body={model,messages,stream:false,...(settings.providerId==='openai'?{max_completion_tokens:settings.maxTokens,store:false}:{max_tokens:settings.maxTokens})};}}
 return {url,headers,body};
}
const textContent=v=>typeof v==='string'?v:Array.isArray(v)?v.filter(p=>p.type==='text'||p.type==='output_text').map(p=>p.text||'').join(''):'';
export function responseText(data,protocol){if(protocol==='responses')return data.output_text||data.output?.filter(o=>o.type==='message').map(o=>textContent(o.content)).join('')||'';if(protocol==='anthropic')return textContent(data.content);if(protocol==='gemini')return data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('')||'';if(protocol==='ollama')return data.message?.content||'';return textContent(data.choices?.[0]?.message?.content);}
function usage(data){const u=data.usage||data.usageMetadata||{};const clean={};for(const [key,value] of [['inputTokens',u.input_tokens??u.prompt_tokens??u.promptTokenCount??data.prompt_eval_count],['outputTokens',u.output_tokens??u.completion_tokens??u.candidatesTokenCount??data.eval_count]])if(Number.isInteger(value)&&value>=0)clean[key]=value;return clean;}
export async function verifyInference(settings,key,{fetch:fetcher=globalThis.fetch,signal,timeoutMs=90000}={}){
 const request=requestFor(settings,key),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);const abort=()=>controller.abort();if(signal?.aborted)controller.abort();signal?.addEventListener('abort',abort,{once:true});const started=Date.now();
 try{const response=await fetcher(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(request.body),signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok){const messages={400:'The provider rejected these model or request settings.',401:'The provider rejected this API key.',403:'Your account does not have permission for this model.',404:'The model or API endpoint is unavailable.',429:'Quota or rate limit reached. Retry after the provider reset.'};throw new Error(`HTTP ${response.status}: ${messages[response.status]||'The provider could not complete this call.'}`);}
 let data;try{data=await response.json()}catch{throw new Error('The provider returned an invalid JSON response. No success recorded.')}if(!data||typeof data!=='object')throw new Error('The provider returned an invalid response.');if(data.error||data.status==='failed')throw new Error('The provider reported a failed inference.');const text=responseText(data,settings.protocol);if(typeof text!=='string'||!text.trim())throw new Error('The call returned no visible text. Try a larger token limit or another API.');
 const safe=s=>typeof s==='string'&&key.trim()?s.split(key.trim()).join('[redacted]'):s;
 return {text:safe(text).slice(0,10000),checkedAt:new Date().toISOString(),latencyMs:Date.now()-started,returnedModel:safe(typeof data.model==='string'?data.model:typeof data.modelVersion==='string'?data.modelVersion:settings.modelId),usage:usage(data),endpoint:request.url};
 }catch(error){if(controller.signal.aborted)throw new Error(signal?.aborted?'Verification canceled. No success recorded.':'Verification timed out. No success recorded.');if(error instanceof TypeError)throw new Error('Browser could not reach the provider. Check CORS, network access, or local-server browser permissions. No success recorded.');throw error;}finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}}
export function successRecord(settings,result,secret=''){const safe=value=>typeof value==='string'&&secret.trim()?value.split(secret.trim()).join('[redacted]'):value;return {schemaVersion:1,id:crypto.randomUUID(),offeringId:safe(settings.offeringId),providerId:settings.providerId,modelId:safe(settings.modelId),returnedModel:safe(result.returnedModel),protocol:settings.protocol,endpoint:safe(result.endpoint),maxTokens:settings.maxTokens,checkedAt:result.checkedAt,latencyMs:result.latencyMs,result:'passed',checks:['textGeneration'],adapter:'byokit-website@1',usage:{...result.usage},scope:'this-browser'};}
export function safeRecords(input){if(!Array.isArray(input))return [];const keys=['schemaVersion','id','offeringId','providerId','modelId','returnedModel','protocol','endpoint','maxTokens','checkedAt','latencyMs','result','checks','adapter','usage','scope'];return input.filter(r=>r&&r.schemaVersion===1&&r.result==='passed'&&r.scope==='this-browser'&&typeof r.offeringId==='string'&&typeof r.checkedAt==='string'&&Number.isFinite(Date.parse(r.checkedAt))&&Object.keys(r).every(k=>keys.includes(k))).slice(0,200);}
