import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {requestExample,nativeRequestExample} from '../website/request-examples.js';
import {requestFor,ProviderApi} from '../website/inference.js';
const settings={providerId:'deepseek',modelId:'selected-model',protocol:'chat',prompt:`Reply with "OK". Don't execute $(echo nope).\nSecond line.`,maxTokens:128};
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
test('JavaScript request examples reproduce settings and use only the environment key',async()=>{
 for(const [providerId,provider] of Object.entries(ProviderApi))for(const protocol of provider.protocols){
  const captured={...settings,providerId,protocol,endpoint:'http://localhost:8080/v1'},expected=requestFor(captured,'dummy-env-key'),code=nativeRequestExample(captured,'javascript',{authenticated:true});
  assert.ok(!code.includes('EXAMPLE_API_KEY'));let called=0;
  await new AsyncFunction('fetch','process','AbortSignal','console',code)(async(url,options)=>{called++;assert.equal(url,expected.url);assert.deepEqual(options.headers,expected.headers);assert.deepEqual(JSON.parse(options.body),expected.body);assert.equal(options.redirect,'error');return {ok:true,json:async()=>({answer:'OK'})}},{env:{API_KEY:'dummy-env-key'}},AbortSignal,{log(){}});
  assert.equal(called,1);
 }
});
test('Python request examples handle quoting, JSON booleans, authentication and redirect rejection',()=>{
 const code=nativeRequestExample(settings,'python');
 const runner=`import sys,os,json
from unittest.mock import patch,MagicMock
os.environ['API_KEY']='dummy-env-key'
request_capture=[]
class Result:
 def __enter__(self): return self
 def __exit__(self,*args): pass
 def read(self): return b'{"answer":"OK"}'
def open_request(request,timeout):
 request_capture.append({'url':request.full_url,'headers':dict(request.header_items()),'body':json.loads(request.data),'timeout':timeout})
 return Result()
opener=MagicMock();opener.open=open_request
with patch('urllib.request.build_opener',return_value=opener):
 exec(json.loads(sys.stdin.read()))
print(json.dumps(request_capture))`;
 const run=spawnSync('python3',['-c',runner],{input:JSON.stringify(code),encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const records=JSON.parse(run.stdout.trim().split('\n').at(-1));assert.equal(records[0].headers.Authorization,'Bearer dummy-env-key');assert.equal(records[0].body.messages[0].content,settings.prompt);assert.equal(records[0].body.stream,false);assert.match(code,/class NoRedirect/);
});
test('cURL uses an environment placeholder and safely quotes arbitrary prompt text',()=>{
 const code=requestExample(settings,'curl');assert.ok(code.includes('$API_KEY'));assert.ok(!code.includes('EXAMPLE_API_KEY'));
 // Parse by running a mock curl function; no actual command/network request.
 const run=spawnSync('/bin/sh',['-c',`curl(){ printf '%s\n' "$@"; }
API_KEY=dummy-env-key
${code}`],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.ok(run.stdout.includes('Authorization: Bearer dummy-env-key'));const body=run.stdout.split('--data-raw\n')[1].trim();assert.equal(JSON.parse(body).messages[0].content,settings.prompt);
});
test('local requests without authentication contain no key placeholder',()=>{
 const code=requestExample({...settings,providerId:'local',endpoint:'http://localhost:8080'},'javascript');assert.ok(!code.includes('API_KEY'));assert.ok(!code.includes('Authorization'));
});

test('copyable high-level snippets use stateless calls and preserve selected settings',async()=>{
 const code=requestExample(settings,'javascript');let calls=0;
 const byokit={ProviderId:{DeepSeek:'deepseek'},Role:{User:'user'},getModels:()=>[{apiModelId:'old',connection:{baseUrl:'https://api.deepseek.com/v1'}}],call:async(model,input,key,options)=>{calls++;assert.equal(model.apiModelId,settings.modelId);assert.equal(input.messages[0].content,settings.prompt);assert.equal(input.max_completion_tokens,128);assert.equal(key,'dummy-env-key');assert.equal(options.runtimeChecks,false);return {choices:[{message:{content:'OK'}}]}}};
 await new AsyncFunction('byokit','process','console',code.replace(/^import.*;\n/,''))(byokit,{env:{API_KEY:'dummy-env-key'}},{log(){}});assert.equal(calls,1);
 const py=requestExample(settings,'python');const run=spawnSync('python3',['-c',`import sys,json,types,os
os.environ['API_KEY']='dummy-env-key'
b=types.ModuleType('byokit');b.ProviderId=types.SimpleNamespace(DEEP_SEEK='deepseek');b.Role=types.SimpleNamespace(USER='user');b.get_models=lambda q:[{'apiModelId':'old'}]
def call(m,i,k,o):
 assert m['apiModelId']=='selected-model' and k=='dummy-env-key' and o['runtime_checks'] is False
 return {'choices':[{'message':{'content':'OK'}}]}
b.call=call;sys.modules['byokit']=b
exec(json.loads(sys.stdin.read()))`],{input:JSON.stringify(py),encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(run.stdout.trim(),'OK');
});
