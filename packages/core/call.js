import {ApiProtocol,FeatureName,Role} from './enums.js';
import {connectionFor} from './connection.js';
import {checkFit} from './index.js';
export class CallError extends Error {constructor(code,message,diagnostics=[]){super(message);this.name='CallError';this.code=code;this.diagnostics=diagnostics;}}
const fail=(message)=>{throw new CallError('INVALID_REQUEST',message)};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function keys(v,allowed,label){if(!obj(v))fail(`${label} must be an object.`);if(Object.keys(v).some(k=>!allowed.includes(k)))fail(`Unsupported ${label} parameter.`);}
function text(v){if(typeof v==='string')return v;if(Array.isArray(v)){return v.map(b=>{keys(b,['type','text'],'text block');if(b.type!=='text'||typeof b.text!=='string')fail('Only text content is supported.');return b.text}).join('');}fail('Expected text content.');}
function toolCall(t){keys(t,['id','type','function'],'tool call');keys(t.function,['name','arguments'],'tool function');if(typeof t.id!=='string'||!t.id||t.type!=='function'||typeof t.function.name!=='string'||!t.function.name||typeof t.function.arguments!=='string')fail('Invalid tool call.');let args;try{args=JSON.parse(t.function.arguments)}catch{fail('Tool arguments must be JSON.')}if(!obj(args))fail('Tool arguments must be an object.');return structuredClone(t);}
function normalize(input,format){
 if(!['openai','claude'].includes(format))fail('Unsupported input format.');
 const p=typeof input==='string'?{messages:[{role:Role.User,content:input}]}:input;
 keys(p,format==='claude'?['messages','system','max_tokens','temperature','top_p','top_k','stop_sequences','tools','tool_choice','stream']:['messages','max_tokens','max_completion_tokens','temperature','top_p','stop','tools','tool_choice','stream'],'request');
 if(p.stream!==undefined&&p.stream!==false)fail('Streaming is not supported.');if(!Array.isArray(p.messages)||!p.messages.length)fail('Provide at least one message.');
 if(p.max_tokens!==undefined&&p.max_completion_tokens!==undefined)fail('Specify one output limit.');
 const messages=[];
 if(format==='claude'&&p.system!==undefined)messages.push({role:'system',content:text(p.system)});
 for(const m of p.messages){
  keys(m,format==='claude'?['role','content']:['role','content','tool_calls','tool_call_id'],'message');
  if(format==='claude'){
   if(!['user','assistant'].includes(m.role))fail('Claude messages require user or assistant roles.');
   if(typeof m.content==='string'){messages.push({role:m.role,content:m.content});continue;}
   if(!Array.isArray(m.content))fail('Invalid Claude content.');
   let chunks=[],calls=[];const flush=()=>{if(chunks.length||calls.length){messages.push({role:m.role,content:chunks.join(''),...(calls.length?{tool_calls:calls}: {})});chunks=[];calls=[];}};
   for(const b of m.content){
    if(b.type==='text'){keys(b,['type','text'],'text block');chunks.push(text([b]));}
    else if(b.type==='tool_use'){keys(b,['type','id','name','input'],'tool use');if(m.role!=='assistant'||!obj(b.input))fail('Invalid tool use.');calls.push(toolCall({id:b.id,type:'function',function:{name:b.name,arguments:JSON.stringify(b.input)}}));}
    else if(b.type==='tool_result'){keys(b,['type','tool_use_id','content'],'tool result');if(m.role!=='user'||typeof b.tool_use_id!=='string')fail('Invalid tool result.');flush();messages.push({role:'tool',tool_call_id:b.tool_use_id,content:text(b.content)});}
    else fail('Unsupported Claude content block.');
   }flush();
  }else{
   if(!['system','developer','user','assistant','tool'].includes(m.role))fail('Invalid message role.');
   const content=m.content===null&&m.role==='assistant'?'':text(m.content);
   if(m.role==='tool'&&(typeof m.tool_call_id!=='string'||!m.tool_call_id))fail('Tool results need a tool_call_id.');
   if(m.tool_calls!==undefined&&(!Array.isArray(m.tool_calls)||m.role!=='assistant'))fail('Invalid tool calls.');
   messages.push({role:m.role,content,...(m.tool_call_id?{tool_call_id:m.tool_call_id}:{}),...(m.tool_calls?{tool_calls:m.tool_calls.map(toolCall)}:{})});
  }
 }
 if(p.tools!==undefined&&!Array.isArray(p.tools))fail('Tools must be an array.');
 const tools=p.tools?.map(t=>{if(format==='claude'){keys(t,['name','description','input_schema'],'tool');if(typeof t.name!=='string'||!t.name||!obj(t.input_schema))fail('Invalid tool definition.');return {type:'function',function:{name:t.name,...(t.description!==undefined?{description:t.description}:{}),parameters:t.input_schema}};}keys(t,['type','function'],'tool');keys(t.function,['name','description','parameters'],'tool definition');if(t.type!=='function'||typeof t.function.name!=='string'||!t.function.name||!obj(t.function.parameters))fail('Invalid tool definition.');return structuredClone(t);});
 let choice=p.tool_choice;
 if(format==='claude'&&choice!==undefined){keys(choice,['type','name'],'tool choice');choice=choice.type==='auto'?'auto':choice.type==='any'?'required':choice.type==='none'?'none':choice.type==='tool'&&typeof choice.name==='string'?{type:'function',function:{name:choice.name}}:fail('Unsupported tool choice.');}
 if(choice!==undefined&&!['auto','none','required'].includes(choice)){keys(choice,['type','function'],'tool choice');keys(choice.function,['name'],'tool choice');if(choice.type!=='function'||typeof choice.function.name!=='string')fail('Invalid tool choice.');}
 if(format==='claude'&&obj(p.tool_choice)&&p.tool_choice.type!=='tool'&&p.tool_choice.name!==undefined)fail('Only named tool choices accept name.');
 if(choice!==undefined&&!tools?.length)fail('Tool choice requires tools.');
 const limit=p.max_completion_tokens??p.max_tokens;if(limit!==undefined&&(!Number.isInteger(limit)||limit<=0))fail('Output limit must be a positive integer.');
 for(const k of ['temperature','top_p','top_k'])if(p[k]!==undefined&&(!Number.isFinite(p[k])||p[k]<0))fail('Invalid sampling parameter.');
 if(p.top_p!==undefined&&p.top_p>1)fail('top_p must be at most 1.');if(p.top_k!==undefined&&!Number.isInteger(p.top_k))fail('top_k must be an integer.');
 const stop=p.stop_sequences??p.stop;if(stop!==undefined&&!(typeof stop==='string'||Array.isArray(stop)&&stop.every(s=>typeof s==='string')))fail('Invalid stop sequences.');
 return {messages,tools,choice,limit,...Object.fromEntries(['temperature','top_p','top_k'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),...(stop!==undefined?{stop:typeof stop==='string'?[stop]:stop}:{})};
}
function claudeMessages(messages){const system=messages.filter(m=>['system','developer'].includes(m.role)).map(m=>m.content).join('\n'),out=[];for(const m of messages){if(['system','developer'].includes(m.role))continue;let role=m.role==='tool'?'user':m.role;const content=m.role==='tool'?[{type:'tool_result',tool_use_id:m.tool_call_id,content:m.content}]:[...(m.content?[{type:'text',text:m.content}]:[]),...(m.tool_calls||[]).map(t=>({type:'tool_use',id:t.id,name:t.function.name,input:JSON.parse(t.function.arguments)}))];if(out.at(-1)?.role===role)out.at(-1).content.push(...content);else out.push({role,content});}return {system,messages:out};}
function geminiMessages(messages){const system=messages.filter(m=>['system','developer'].includes(m.role)).map(m=>m.content).join('\n');const names=new Map(messages.flatMap(m=>(m.tool_calls||[]).map(t=>[t.id,t.function.name])));const contents=messages.filter(m=>!['system','developer'].includes(m.role)).map(m=>{if(m.role==='tool'){if(!names.has(m.tool_call_id))fail('Gemini tool result requires its preceding tool call.');let response;try{response=JSON.parse(m.content)}catch{response={result:m.content}}return {role:'user',parts:[{functionResponse:{name:names.get(m.tool_call_id),response:obj(response)?response:{result:response}}}]};}return {role:m.role==='assistant'?'model':'user',parts:[...(m.content?[{text:m.content}]:[]),...(m.tool_calls||[]).map(t=>({functionCall:{name:t.function.name,args:JSON.parse(t.function.arguments)}}))]};});return {contents,...(system?{systemInstruction:{parts:[{text:system}]}}:{})};}
// Builds only non-secret request data. Authentication is added transiently by call().
export function prepareCall(model,input,{format='openai',runtimeChecks=true,inputTokens,overheadTokens=0}={}){
 if(!obj(model)||typeof model.apiModelId!=='string'||!model.apiModelId.trim())fail('Select a configured model with an API model ID.');
 const connection=model.connection??connectionFor(model);if(!connection?.baseUrl)fail('Configure the model endpoint first.');
 let url;try{url=new URL(connection.baseUrl)}catch{fail('Invalid model endpoint.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)fail('Endpoint must be HTTP(S), without credentials, query or fragment.');
 if(!Object.values(ApiProtocol).includes(connection.protocol))fail('Unsupported API protocol.');
 if(typeof runtimeChecks!=='boolean')fail('runtimeChecks must be boolean.');
 const p=normalize(input,format),limit=p.limit??Math.min(1024,model.limits?.output||1024),protocol=connection.protocol,base=url.href.replace(/\/$/,'');
 if(p.top_k!==undefined&&![ApiProtocol.Claude,ApiProtocol.Gemini,ApiProtocol.Ollama].includes(protocol))fail('top_k is unsupported by this adapter.');
 let body,path;
 if(protocol===ApiProtocol.Claude){const m=claudeMessages(p.messages);body={model:model.apiModelId,messages:m.messages,max_tokens:limit,stream:false,...(m.system?{system:m.system}:{}),...Object.fromEntries(['temperature','top_p','top_k'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),...(p.stop?{stop_sequences:p.stop}:{}),...(p.tools?{tools:p.tools.map(t=>({name:t.function.name,input_schema:t.function.parameters,...(t.function.description?{description:t.function.description}:{})}))}:{}),...(p.choice?{tool_choice:typeof p.choice==='string'?{type:{auto:'auto',required:'any',none:'none'}[p.choice]}:{type:'tool',name:p.choice.function.name}}:{})};path='/messages';}
 else if(protocol===ApiProtocol.Gemini){body={...geminiMessages(p.messages),generationConfig:{maxOutputTokens:limit,...(p.temperature!==undefined?{temperature:p.temperature}:{}),...(p.top_p!==undefined?{topP:p.top_p}:{}),...(p.top_k!==undefined?{topK:p.top_k}:{}),...(p.stop?{stopSequences:p.stop}:{})},...(p.tools?{tools:[{functionDeclarations:p.tools.map(t=>({name:t.function.name,parameters:t.function.parameters,...(t.function.description?{description:t.function.description}:{})}))}]}:{}),...(p.choice?{toolConfig:{functionCallingConfig:{mode:typeof p.choice==='string'?{auto:'AUTO',none:'NONE',required:'ANY'}[p.choice]:'ANY',...(typeof p.choice==='object'?{allowedFunctionNames:[p.choice.function.name]}:{})}}}:{})};path='/models/'+encodeURIComponent(model.apiModelId.replace(/^models\//,''))+':generateContent';}
 else if(protocol===ApiProtocol.Ollama){const names=new Map(p.messages.flatMap(m=>(m.tool_calls||[]).map(t=>[t.id,t.function.name])));if(p.messages.some(m=>m.role==='tool'&&!names.has(m.tool_call_id)))fail('Ollama tool results require their preceding tool calls.');if(p.choice!==undefined)fail('tool_choice is unsupported by the Ollama adapter.');body={model:model.apiModelId,messages:p.messages.map(m=>({...Object.fromEntries(Object.entries(m).filter(([k])=>k!=='tool_call_id')),...(m.role==='tool'?{tool_name:names.get(m.tool_call_id)}:{}),...(m.tool_calls?{tool_calls:m.tool_calls.map(t=>({function:{name:t.function.name,arguments:JSON.parse(t.function.arguments)}}))}:{})})),stream:false,options:{num_predict:limit,...Object.fromEntries(['temperature','top_p','top_k','stop'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))},...(p.tools?{tools:p.tools}:{})};path='/api/chat';}
 else {body={model:model.apiModelId,messages:p.messages,stream:false,[model.providerId==='openai'?'max_completion_tokens':'max_tokens']:limit,...Object.fromEntries(['temperature','top_p','stop'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),...(p.tools?{tools:p.tools}:{}),...(p.choice?{tool_choice:p.choice}:{}),...(model.providerId==='openai'?{store:false}:{})};path='/chat/completions';}
 let diagnostics=[];
 if(runtimeChecks){const fit=checkFit(model,{inputTokens,outputTokens:limit,overheadTokens},{requiredFeatures:p.tools?.length?[FeatureName.FunctionCalling]:[]});diagnostics=fit.diagnostics;if(inputTokens===undefined)diagnostics.push({code:'TOKEN_COUNT_UNKNOWN',message:'Input tokens are unknown; context fit is not guaranteed.',severity:'warning',offeringId:model.id});if(fit.status==='exceeds')throw new CallError('MODEL_FIT_FAILED','Request exceeds known model limits or capabilities.',diagnostics);}
 return {url:base+path,body,protocol,diagnostics};
}
function parsed(data,protocol,model){
 if(!obj(data)||data.error||data.status==='failed')throw new CallError('INVALID_RESPONSE','Provider returned an invalid or failed response.');
 let content='',calls=[],finish='stop',usage={},id=data.id||'',returned=data.model||data.modelVersion||model.apiModelId;
 if(protocol===ApiProtocol.Claude){if(!Array.isArray(data.content))throw new CallError('INVALID_RESPONSE','Missing message content.');for(const b of data.content){if(b.type==='text')content+=b.text||'';else if(b.type==='tool_use')calls.push({id:b.id,type:'function',function:{name:b.name,arguments:JSON.stringify(b.input)}});else throw new CallError('UNSUPPORTED_RESPONSE','Unsupported provider content block.');}finish={end_turn:'stop',stop_sequence:'stop',max_tokens:'length',tool_use:'tool_calls'}[data.stop_reason]||'stop';usage={prompt_tokens:data.usage?.input_tokens,completion_tokens:data.usage?.output_tokens};}
 else if(protocol===ApiProtocol.Gemini){const c=data.candidates?.[0];if(!c?.content?.parts)throw new CallError('INVALID_RESPONSE','Missing candidate content.');for(const b of c.content.parts){if(b.thought||b.thoughtSignature)throw new CallError('UNSUPPORTED_RESPONSE','Gemini thinking signatures require a native adapter and are not supported in this version.');if(typeof b.text==='string')content+=b.text;else if(b.functionCall)calls.push({id:b.functionCall.id||`call_${globalThis.crypto.randomUUID()}`,type:'function',function:{name:b.functionCall.name,arguments:JSON.stringify(b.functionCall.args||{})}});else throw new CallError('UNSUPPORTED_RESPONSE','Unsupported Gemini content block.');}finish=c.finishReason==='MAX_TOKENS'?'length':calls.length?'tool_calls':'stop';usage={prompt_tokens:data.usageMetadata?.promptTokenCount,completion_tokens:data.usageMetadata?.candidatesTokenCount};}
 else if(protocol===ApiProtocol.Ollama){content=data.message?.content||'';calls=(data.message?.tool_calls||[]).map((t,i)=>({id:t.id||`call_${globalThis.crypto.randomUUID()}`,type:'function',function:{name:t.function.name,arguments:JSON.stringify(t.function.arguments)}}));finish=calls.length?'tool_calls':data.done_reason==='length'?'length':'stop';usage={prompt_tokens:data.prompt_eval_count,completion_tokens:data.eval_count};}
 else {const c=data.choices?.[0];if(!c?.message)throw new CallError('INVALID_RESPONSE','Missing completion message.');if(c.message.content!==null&&c.message.content!==undefined)content=text(c.message.content);calls=c.message.tool_calls||[];finish=c.finish_reason||'stop';usage={prompt_tokens:data.usage?.prompt_tokens,completion_tokens:data.usage?.completion_tokens};}
 if(typeof content!=='string'||!content.trim()&&!calls.length)throw new CallError('EMPTY_RESPONSE','Provider returned no visible text or tool calls.');
 calls=calls.map(toolCall);const cleanUsage=Object.fromEntries(Object.entries(usage).filter(([,n])=>Number.isInteger(n)&&n>=0));if(cleanUsage.prompt_tokens!==undefined&&cleanUsage.completion_tokens!==undefined)cleanUsage.total_tokens=cleanUsage.prompt_tokens+cleanUsage.completion_tokens;
 return {...(protocol===ApiProtocol.Claude?{_nativeStop:data.stop_reason,_stopSequence:data.stop_sequence??null,_nativeContent:data.content.map(b=>b.type==='text'?{type:'text',text:b.text}:{type:'tool_use',id:b.id,name:b.name,input:b.input})}:{}),id,object:'chat.completion',created:Math.floor(Date.now()/1000),model:returned,choices:[{index:0,message:{role:'assistant',content:content||null,...(calls.length?{tool_calls:calls}:{})},finish_reason:finish}],usage:cleanUsage};
}
async function execute(model,input,key,options,format){
 const {runtimeChecks=true,signal,timeoutMs=90000,onWarning,fetch:fetcher=globalThis.fetch,inputTokens,overheadTokens}=options||{};
 if(typeof key!=='string')fail('Provide the API key as a per-call string (empty for unauthenticated local servers).');
 if(!obj(model))fail('Select a configured model.');
 if(!model.local&&!key.trim())fail('Provide a provider API key.');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)fail('timeoutMs must be positive.');
 const request=prepareCall(model,input,{format,runtimeChecks,inputTokens,overheadTokens});for(const d of request.diagnostics)if(d.severity==='warning'){if(onWarning)onWarning(d);else console.warn(`[byokit] ${d.code}: ${d.message}`);}
 const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,timeoutMs);
 try{
  if(controller.signal.aborted)throw new CallError('CANCELED','Call canceled.');
  const headers={'Content-Type':'application/json'};if(request.protocol===ApiProtocol.Claude){headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';if(typeof window!=='undefined')headers['anthropic-dangerous-direct-browser-access']='true';}else if(request.protocol===ApiProtocol.Gemini)headers['x-goog-api-key']=key;else if(key)headers.Authorization='Bearer '+key;
  const response=await fetcher(request.url,{method:'POST',headers,body:JSON.stringify(request.body),signal:controller.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new CallError('PROVIDER_ERROR',`Provider rejected the call (HTTP ${response.status}).`);
  let data;try{data=await response.json()}catch{throw new CallError('INVALID_RESPONSE','Provider returned invalid JSON.');}
  if(controller.signal.aborted)throw new CallError('CANCELED','Call canceled.');
  const parsedResult=parsed(data,request.protocol,model);const result=format==='claude'?asClaude(parsedResult):Object.fromEntries(Object.entries(parsedResult).filter(([k])=>!k.startsWith('_')));const redact=v=>typeof v==='string'&&key?v.split(key).join('[redacted]'):Array.isArray(v)?v.map(redact):obj(v)?Object.fromEntries(Object.entries(v).map(([k,value])=>[k,redact(value)])):v;return redact(result);
 }catch(e){if(controller.signal.aborted)throw new CallError(signal?.aborted?'CANCELED':'TIMEOUT',signal?.aborted?'Call canceled.':'Call timed out.');if(e instanceof CallError)throw e;throw new CallError('NETWORK_ERROR','Could not reach the provider. Check network access and browser CORS permissions.');}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function call(model,input,key,options={}){return execute(model,input,key,options,'openai');}
function asClaude(r){const m=r.choices[0].message;return {id:r.id,type:'message',role:'assistant',model:r.model,content:r._nativeContent??[...(m.content?[{type:'text',text:m.content}]:[]),...(m.tool_calls||[]).map(t=>({type:'tool_use',id:t.id,name:t.function.name,input:JSON.parse(t.function.arguments)}))],stop_reason:r._nativeStop??{stop:'end_turn',length:'max_tokens',tool_calls:'tool_use',content_filter:'refusal'}[r.choices[0].finish_reason]??'end_turn',stop_sequence:r._stopSequence??null,usage:{...(r.usage.prompt_tokens!==undefined?{input_tokens:r.usage.prompt_tokens}:{}),...(r.usage.completion_tokens!==undefined?{output_tokens:r.usage.completion_tokens}:{})}};}
export function callClaude(model,input,key,options={}){return execute(model,input,key,options,'claude');}
