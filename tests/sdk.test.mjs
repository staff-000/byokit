import test from 'node:test';
import assert from 'node:assert/strict';
import * as byokit from '../packages/core/catalog.js';
const [model]=byokit.getModels({providerIds:[byokit.ProviderId.DeepSeek]});
const response=()=>({ok:true,json:async()=>({model:'served',choices:[{message:{content:'OK'},finish_reason:'stop'}]})});
const input={model:model.apiModelId,messages:[{role:byokit.Role.User,content:'Hello'}]};
test('SDK method shape, factory/constructor aliases, both formats, and no request at construction',async()=>{
 let requests=0,reads=0;const options={model,apiKey:()=>{reads++;return 'dummy'},runtimeChecks:false,fetch:async()=>{requests++;return response()}};
 const clients=[byokit.openAI(options),new byokit.OpenAI(options)];const claude=[byokit.claude(options),new byokit.Anthropic(options)];assert.equal(requests,0);assert.equal(reads,0);
 for(const c of clients)assert.equal((await c.chat.completions.create(input)).choices[0].message.content,'OK');
 for(const c of claude)assert.deepEqual((await c.messages.create(input)).content,[{type:'text',text:'OK'}]);assert.equal(requests,4);assert.equal(reads,4);
});
test('each request reads the current application key; inspection and serialization contain no key',async()=>{
 let key='key-A';const sent=[];const client=byokit.openAI({model,apiKey:()=>key,runtimeChecks:false,fetch:async(_,o)=>{sent.push(o.headers.Authorization);return response()}});
 await client.chat.completions.create(input);key='key-B';await client.chat.completions.create(input);assert.deepEqual(sent,['Bearer key-A','Bearer key-B']);assert.ok(!JSON.stringify(client).includes('key-'));
 assert.throws(()=>byokit.openAI({model,apiKey:'do-not-retain-this'}),e=>e.code==='INVALID_REQUEST'&&!e.message.includes('do-not-retain-this'));
});
test('requests capture configuration before async credential reads, with defaults and overrides',async()=>{
 let release;const gate=new Promise(r=>release=r);let body;const config={model:structuredClone(model),apiKey:()=>gate,runtimeChecks:false,fetch:async(_,o)=>{body=JSON.parse(o.body);return response()}};
 const client=byokit.openAI(config);const p=structuredClone(input),job=client.chat.completions.create(p);p.messages[0].content='changed';config.model.apiModelId='changed';release('dummy');await job;
 assert.equal(body.model,model.apiModelId);assert.equal(body.messages[0].content,'Hello');
 await assert.rejects(client.chat.completions.create(input,{runtimeChecks:true,inputTokens:1e12}),e=>e.code==='MODEL_FIT_FAILED');
});
test('invalid shapes and key-read errors fail without inference or secret details',async()=>{
 let requests=0,reads=0;const c=byokit.openAI({model,apiKey:()=>{reads++;throw new Error('dummy-secret')},fetch:async()=>{requests++;return response()},runtimeChecks:false});
 await assert.rejects(c.chat.completions.create({...input,stream:true}),e=>e.code==='INVALID_REQUEST');assert.equal(reads,0);
 await assert.rejects(c.chat.completions.create(input),e=>e.code==='CREDENTIAL_ERROR'&&!e.message.includes('dummy-secret'));assert.equal(requests,0);
});
test('cancel and timeout fence asynchronous key reads; late resolution cannot issue inference',async()=>{
 let release,requests=0;const gate=new Promise(r=>release=r),c=byokit.openAI({model,apiKey:()=>gate,fetch:async()=>{requests++;return response()},runtimeChecks:false});
 const controller=new AbortController(),job=c.chat.completions.create(input,{signal:controller.signal});controller.abort();await assert.rejects(job,e=>e.code==='CANCELED');release('dummy');await new Promise(r=>setTimeout(r,5));assert.equal(requests,0);
 const timeout=byokit.openAI({model,apiKey:()=>new Promise(()=>{}),runtimeChecks:false});await assert.rejects(timeout.chat.completions.create(input,{timeoutMs:5}),e=>e.code==='TIMEOUT');
});
test('custom model ID keeps the provider endpoint and uses unknown fit metadata',async()=>{
 const requests=[],warnings=[];const c=byokit.openAI({model,apiKey:()=> 'dummy',fetch:async(url,o)=>{requests.push({url,body:JSON.parse(o.body)});return response()},onWarning:d=>warnings.push(d)});
 await c.chat.completions.create({...input,model:'custom-id',max_tokens:2000000});assert.equal(requests[0].body.model,'custom-id');assert.ok(requests[0].url.startsWith(model.connection.baseUrl));assert.ok(warnings.some(d=>d.code==='OUTPUT_LIMIT_UNKNOWN'));
});

test('unauthenticated local SDK clients can omit the key callback',async()=>{
 const [local]=byokit.getModels({providerIds:[],local:[{endpoint:'http://localhost:8080/v1',modelId:'local-model'}]});
 const c=byokit.openAI({model:local,runtimeChecks:false,fetch:async(_,options)=>{assert.equal(options.headers.Authorization,undefined);return response()}});
 assert.equal((await c.chat.completions.create({messages:[{role:byokit.Role.User,content:'Hi'}]})).choices[0].message.content,'OK');
});
