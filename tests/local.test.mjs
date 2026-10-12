import test from 'node:test';import assert from 'node:assert/strict';import {discoverLocal} from '../packages/dom/local.js';
test('local discovery validates origin and requires an explicit remote opt-in',async()=>{
 let called=false;const fetch=async()=>{called=true;return {ok:true,json:async()=>({models:[{name:'qwen:8b',size:123,details:{quantization_level:'Q4_K_M'}}]})}};
 await assert.rejects(discoverLocal('https://example.com',{fetch}));assert.equal(called,false);
 await assert.rejects(discoverLocal('http://secret@localhost',{fetch}));
 const result=await discoverLocal('http://127.0.0.1:11434',{fetch});assert.equal(result[0].apiModelId,'qwen:8b');assert.equal(result[0].limits.context,null);assert.equal(result[0].artifact.quantization,'Q4_K_M');
});
