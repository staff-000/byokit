import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderApi,requestFor,responseText,verifyInference,successRecord,safeRecords} from '../website/inference.js';
const base={offeringId:'deepseek/test-model',providerId:'deepseek',modelId:'test-model',protocol:'chat',prompt:'Reply OK',maxTokens:256};
const key='test-secret-never-saved';
test('each provider uses its own endpoint/protocol and sends secrets only in headers',()=>{
 for(const [providerId,provider] of Object.entries(ProviderApi))for(const protocol of provider.protocols){
  const request=requestFor({...base,providerId,protocol,endpoint:'http://localhost:8080/v1'},key);
  assert.ok(!request.url.includes(key));assert.ok(!JSON.stringify(request.body).includes(key));
  if(providerId!=='local')assert.ok(request.url.startsWith(provider.base));
  assert.equal(request.body.stream??false,false);
 }
 assert.equal(requestFor({...base,providerId:'openai',protocol:'responses'},key).body.store,false);
 assert.equal(requestFor({...base,providerId:'google',protocol:'gemini'},key).headers['x-goog-api-key'],key);
 assert.throws(()=>requestFor({...base,providerId:'unknown'},key));assert.throws(()=>requestFor({...base,providerId:'deepseek',protocol:'responses'},key));
 assert.throws(()=>requestFor({...base,providerId:'local',endpoint:'http://secret@localhost:8000'},key));
 assert.throws(()=>requestFor({...base,maxTokens:999999},key));assert.throws(()=>requestFor(base,''));
});
test('supported response formats require visible generation, not just HTTP success',()=>{
 assert.equal(responseText({output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:'OK'}]}]},'responses'),'OK');
 assert.equal(responseText({content:[{type:'thinking',thinking:'secret'},{type:'text',text:'OK'}]},'anthropic'),'OK');
 assert.equal(responseText({candidates:[{content:{parts:[{thought:true,text:'internal'},{text:'OK'}]}}]},'gemini'),'OK');
 assert.equal(responseText({message:{content:'OK'}},'ollama'),'OK');
});
test('success records whitelist settings and metrics; no key, prompt, text or headers are persisted',async()=>{
 const result=await verifyInference(base,key,{fetch:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer '+key);assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');return {ok:true,json:async()=>({model:'test-model',choices:[{message:{content:'OK '+key}}],usage:{prompt_tokens:6,completion_tokens:1,apiKey:key}})}}});
 const record=successRecord({...base,apiKey:key},result,key),json=JSON.stringify(record);assert.ok(!json.includes(key));assert.ok(!json.includes('Reply OK'));assert.equal(Object.hasOwn(record,'text'),false);assert.equal(record.result,'passed');assert.equal(record.usage.inputTokens,6);
 assert.deepEqual(safeRecords([{...record,apiKey:key},record]),[record]);
});
test('authentication errors, CORS/network errors, malformed output and empty reasoning output never pass',async()=>{
 await assert.rejects(verifyInference(base,key,{fetch:async()=>({ok:false,status:401,json:async()=>({error:{message:key}})})}),e=>e.message.includes('HTTP 401')&&!e.message.includes(key));
 await assert.rejects(verifyInference(base,key,{fetch:async()=>{throw new TypeError(key)}}),e=>e.message.includes('CORS')&&!e.message.includes(key));
 await assert.rejects(verifyInference(base,key,{fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:''}}]})})}),/no visible text/);
 await assert.rejects(verifyInference(base,key,{fetch:async()=>({ok:true,json:async()=>{throw new SyntaxError(key)}})}),e=>!e.message.includes(key));
});
test('timeout and explicit cancellation propagate to provider fetch',async()=>{
 const fetch=async(url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)return reject(new Error('aborted'));signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})});
 await assert.rejects(verifyInference(base,key,{fetch,timeoutMs:10}),/timed out/);
 const controller=new AbortController(),pending=verifyInference(base,key,{fetch,signal:controller.signal});controller.abort();await assert.rejects(pending,/canceled/);
});
