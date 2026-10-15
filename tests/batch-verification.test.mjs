import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBatch,runBatch} from '../website/batch-verification.js';
import {filterModels} from '../website/verification-filters.js';
const jobs=(n=2)=>Array.from({length:n},(_,i)=>({offeringId:'deepseek/test-'+i,providerId:'deepseek',modelId:'test-'+i,protocol:'chat',prompt:'private prompt',maxTokens:256}));
test('batch admission rejects mixed providers, duplicate models, missing credentials, and oversized batches',()=>{
 assert.throws(()=>validateBatch(jobs(),' '));assert.throws(()=>validateBatch(jobs(),''));assert.throws(()=>validateBatch(jobs(11),'fixture-key'));assert.throws(()=>validateBatch([jobs()[0],jobs()[0]],'fixture-key'));
 assert.throws(()=>validateBatch([jobs()[0],{...jobs()[1],providerId:'openai'}],'fixture-key'));assert.throws(()=>validateBatch([{...jobs()[0],providerId:'local'}],'fixture-key'));
});
test('batch runs sequentially, once per model, using only the captured provider key',async()=>{
 let calls=0,active=0,max=0;const entries=await runBatch(jobs(),'fixture-key',{verify:async(job,key)=>{assert.equal(key,'fixture-key');calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;return {text:'OK',model:job.modelId}}});
 assert.equal(calls,2);assert.equal(max,1);assert.deepEqual(entries.map(e=>e.status),['passed','passed']);assert.ok(!JSON.stringify(entries).includes('fixture-key'));
});
test('authentication and quota failures stop the queue and redact credential-bearing errors',async()=>{
 for(const status of [401,402,403,429]){let calls=0;const entries=await runBatch(jobs(),'fixture-key',{verify:async()=>{calls++;throw Object.assign(new Error(`HTTP ${status} fixture-key`),{code:'PROVIDER_ERROR'})}});assert.equal(calls,1);assert.deepEqual(entries.map(e=>e.status),['failed','skipped']);assert.ok(!JSON.stringify(entries).includes('fixture-key'));}
});
test('canceling prevents queued requests and fences a late result',async()=>{
 const controller=new AbortController();let calls=0;const entries=await runBatch(jobs(),'fixture-key',{signal:controller.signal,verify:async()=>{calls++;controller.abort();return {text:'late'}}});assert.equal(calls,1);assert.deepEqual(entries.map(e=>e.status),['canceled','skipped']);
});
test('verification selectors preserve LIVE defaults and explicitly include outdated offerings',()=>{
 const live=filterModels({provider:'openai'}),all=filterModels({provider:'openai',includeOutdated:true});assert.ok(live.length);assert.ok(all.length>live.length);assert.ok(live.every(m=>m.lifecycle.status==='LIVE'));assert.ok(all.some(m=>m.lifecycle.status==='OUTDATED'));
 const china=filterModels({region:'china'});assert.ok(china.every(m=>m.local||m.tags.includes('origin:cn')||m.provider.tags.includes('origin:cn')));
 const tools=filterModels({feature:'functionCalling',context:'128000',price:'5',weights:'open',modality:'image'});assert.ok(tools.every(m=>m.local||m.features.functionCalling.status==='supported'&&m.limits.context>=128000&&m.price.input<=5&&m.model.openWeights===true&&m.modalities.input.includes('image')));
});

test('China exclusions use library tags, not a separate audience',()=>{const models=filterModels({excludeTag:'origin:cn'});assert.ok(models.length);assert.ok(models.every(m=>m.local||![...m.tags,...m.model.tags,...m.provider.tags].includes('origin:cn')))});
