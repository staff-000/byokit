import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as byokit from '../packages/core/catalog.js';
import {filterModels} from '../website/verification-filters.js';
test('website model list is the library catalog, including metadata and contributor evidence',()=>{
 const expected=byokit.getModels(byokit.COMPLETE,{local:false,sort:byokit.ModelSort.ProviderOrder});
 const actual=filterModels().filter(m=>!m.local);
 assert.deepEqual(actual.map(m=>m.id),expected.map(m=>m.id));
 for(const model of actual){assert.deepEqual(model.verification,expected.find(m=>m.id===model.id).verification);}
});
test('documented single selection is bounded, rejects empty matches and excludes Local',()=>{
 const models=byokit.getModels({providerIds:[byokit.ProviderId.DeepSeek],limit:1,local:false});
 assert.ok(models.length<=1);assert.ok(models.every(m=>!m.local));
 assert.deepEqual(byokit.getModels({providerIds:[byokit.ProviderId.DeepSeek],limit:1,local:false,filters:{minContextTokens:Number.MAX_SAFE_INTEGER}}),[]);
});
test('website selectors use library vocabularies and tag metadata',async()=>{
 const source=await readFile(new URL('../website/verification.js',import.meta.url),'utf8');
 assert.ok(source.includes('Object.values(byokit.FeatureName)'));assert.ok(source.includes('Object.values(byokit.Modality)'));
 assert.ok(source.includes('models.flatMap'));assert.ok(source.includes('m.provider.tags'));
 const home=await readFile(new URL('../website/app.js',import.meta.url),'utf8');assert.ok(home.includes('byokit.getModels(modes[mode],config)'));
 const inference=await readFile(new URL('../website/inference.js',import.meta.url),'utf8');assert.ok(inference.includes('new OpenAI({baseURL:model.connection.baseUrl'));
});
