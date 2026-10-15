import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {mergeManualCatalog} from '../scripts/manual-catalog.mjs';import {Catalog} from '../packages/core/index.js';
const fixture=async()=>JSON.parse(await readFile(new URL('../spec/fixtures/catalog.json',import.meta.url),'utf8'));
const evidence={source:'https://example.com/models',reviewedAt:'2026-10-14'};
const manual={schemaVersion:1,providers:[{id:'manual',name:'Manual',auth:'required',deployment:'hosted',provenance:evidence}],models:[{id:'manual/model',name:'Manual model',openWeights:null,commercialUse:'unknown',license:null,tags:[],provenance:evidence}],offerings:[{id:'manual/model',providerId:'manual',modelId:'manual/model',apiModelId:'model',name:'Manual model',deployment:'hosted',connection:{baseUrl:'https://example.com/v1',protocol:'openai-compatible'},modalities:{input:['text'],output:['text']},limits:{context:null,input:null,output:null,contextAccounting:'unknown'},features:{},price:{currency:'USD',input:null,output:null},tags:[],provenance:evidence,lifecycleEvidence:{status:'LIVE',basis:'provider',source:'https://example.com/models',checkedAt:'2026-10-14T00:00:00Z'}}]};
test('manual additions survive repeated imports, preserve native connections, and extend Global',async()=>{
 const base=await fixture();const a=mergeManualCatalog(base,manual),b=mergeManualCatalog(base,manual);assert.deepEqual(a,b);assert.equal(base.providers.some(p=>p.id==='manual'),false);
 const model=new Catalog(a).getModels({providerIds:['manual'],asOf:'2026-10-14T12:00:00Z'})[0];assert.equal(model.connection.baseUrl,'https://example.com/v1');assert.ok(a.presets.find(p=>p.id==='global').providerIds.includes('manual'));
 assert.throws(()=>mergeManualCatalog(a,manual),/Duplicate/);const bad=structuredClone(manual);bad.offerings[0].connection.apiKey='secret';assert.throws(()=>mergeManualCatalog(base,bad));delete bad.offerings[0].connection.apiKey;bad.offerings[0].providerId='missing';assert.throws(()=>mergeManualCatalog(base,bad));
});
test('nightly workflow fetches only the official source and retains generated packages',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/catalog-review.yml',import.meta.url),'utf8');assert.ok(workflow.includes("23 8 * * *"));assert.ok(workflow.includes('https://models.dev/api.json'));assert.ok(workflow.includes('packages/core/catalog.js'));assert.ok(workflow.includes('contents: read'));
});
