import {pythonModels} from './python-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {Catalog,validateCatalog,verificationSummary} from '../packages/core/index.js';
import bundled,{getModels} from '@byokit/core/catalog';
const fixture=()=>JSON.parse(readFileSync('spec/fixtures/catalog.json'));
const asOf='2026-10-12T12:00:00Z';
const report=(fields={})=>({id:'alice-small',offeringId:'test/small',contributor:'github:alice',checkedAt:'2026-10-11T12:00:00Z',result:'passed',checks:['textGeneration'],adapter:'fixture@1.0',evidence:'https://github.com/example/test/blob/commit/evidence.md',...fields});

test('simple query returns a bounded flat list with provider/model metadata and no invented reports',()=>{
 const data=structuredClone(bundled);data.verifications=[];const catalog=new Catalog(data);
 const list=catalog.getModels({providerIds:['deepseek'],limit:1});assert.equal(list.length,1);
 assert.equal(list[0].provider.id,'deepseek');assert.ok(list[0].apiModelId);assert.ok(list[0].model);
 assert.equal(list[0].verification.status,'unverified');assert.deepEqual(list[0].verification.records,[]);
 assert.deepEqual(catalog.getModels({local:false,filters:{verified:true}}),[]);assert.throws(()=>getModels({limit:0}));
});
test('bundled provider results preserve real published contributor reports',()=>{
 const asOf=new Date().toISOString();for(const model of getModels({providerIds:['deepseek'],asOf}))assert.deepEqual(model.verification,verificationSummary(bundled,model.id,{asOf}));
});
test('README example matches the bundled catalog',()=>{
 const run=spawnSync('node',['examples/query.mjs'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 assert.deepEqual(JSON.parse(run.stdout),['openai','anthropic','google','openrouter','deepseek','local']);
});
test('reports retain author and evidence, but never promote unknown capabilities',()=>{
 const data=fixture();data.verifications=[report()];const c=new Catalog(data);
 const models=c.getModels({asOf,local:false,filters:{verified:true,verifiedBy:'github:alice'}});
 assert.equal(models.length,1);assert.equal(models[0].verification.latest.contributor,'github:alice');
 assert.equal(models[0].features.strictJsonSchema.status,'unknown');
 assert.deepEqual(c.getModels({asOf,local:false,filters:{verified:true,requiredFeatures:['strictJsonSchema']}}),[]);
 assert.deepEqual(c.getModels({asOf,local:false,filters:{verifiedBy:'github:bob'}}),[]);
 models[0].verification.records[0].result='failed';assert.equal(c.data.verifications[0].result,'passed');
});
test('later failures, stale reports, feature-only reports, and future reports cannot establish a passing text call',()=>{
 const data=fixture();data.verifications=[report(),report({id:'new-failure',checkedAt:'2026-10-12T10:00:00Z',result:'failed'})];
 assert.equal(verificationSummary(data,'test/small',{asOf}).status,'failed');
 data.verifications=[report({checkedAt:'2020-01-01T00:00:00Z'})];assert.equal(verificationSummary(data,'test/small',{asOf}).status,'stale');
 data.verifications=[report({checks:['functionCalling']})];assert.equal(verificationSummary(data,'test/small',{asOf}).status,'unverified');
 data.verifications=[report({checkedAt:'2099-01-01T00:00:00Z'})];assert.equal(verificationSummary(data,'test/small',{asOf}).status,'unverified');
});
test('verification input rejects dangling targets, secret fields, duplicate IDs and missing evidence',()=>{
 for(const records of [[report({offeringId:'missing'})],[report({apiKey:'secret'})],[report(),report()],[report({evidence:''})]]){
  const data=fixture();data.verifications=records;assert.ok(validateCatalog(data).length);assert.throws(()=>new Catalog(data));
 }
});
test('JS and Python simple query and verification filters agree',()=>{
 const data=fixture();data.verifications=[report(),report({id:'bob-large',offeringId:'test/large',contributor:'github:bob',result:'failed'})];
 const queries=[{asOf},{asOf,filters:{verified:true}},{asOf,filters:{verified:false}},{asOf,filters:{verifiedBy:'github:bob'}},{asOf,limit:1}];
 const result=pythonModels({data,queries});assert.equal(result.status,0,result.stderr);
 assert.deepEqual(queries.map(q=>new Catalog(data).getModels(q)),JSON.parse(result.stdout));
});

test('explicit provider queries return all non-deprecated matches unless a limit is supplied',()=>{
 const data=fixture(),base=data.offerings[0];data.offerings=Array.from({length:125},(_,i)=>({...base,id:`test/model-${i}`,apiModelId:`model-${i}`,rank:i}));
 data.offerings.push({...base,id:'test/deprecated',status:'deprecated'});
 const c=new Catalog(data);
 assert.equal(c.getModels({providerIds:['test']}).length,125);
 assert.equal(c.getModels({providerIds:['test'],limit:5}).length,5);
 assert.equal(c.getModels().length,2);
 assert.equal(c.select()[0].offerings.length,4);
 const run=pythonModels({data,queries:[{providerIds:['test']},{providerIds:['test'],limit:5},{}]});
 assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout).map(x=>x.length),[125,5,2]);
});

test('non-China preset excludes China-based providers and preserves local choices',()=>{
 const data=JSON.parse(readFileSync('catalog/catalog.json'));
 const preset=data.presets.find(p=>p.id==='non-china');assert.ok(preset);
 for(const id of preset.providerIds){const p=data.providers.find(p=>p.id===id);assert.ok(p.deployment==='local'||p.origin!=='cn');}
 assert.ok(preset.providerIds.includes('ollama'));assert.ok(!preset.providerIds.includes('deepseek'));
 const c=new Catalog(data);assert.ok(c.getModels({preset:'non-china'}).length);
 const run=pythonModels({data,queries:[{preset:'non-china'}]});
 assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),[c.getModels({preset:'non-china'})]);
});
test('catalog namespace includes all helpers used by documented examples',async()=>{
 const byokit=await import('@byokit/core/catalog');
 assert.equal(byokit.Preset.NonChina,'non-china');assert.equal(byokit.githubContributor('example'),'github:example');assert.equal(typeof byokit.checkFit,'function');
 const ui=await import('@byokit/dom');assert.equal(ui.Preset.NonChina,'non-china');assert.equal(typeof ui.discoverLocal,'function');
});
