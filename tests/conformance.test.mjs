import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {Catalog,checkFit} from '../packages/core/index.js';
const catalog=new Catalog(JSON.parse(readFileSync(new URL('../spec/fixtures/catalog.json',import.meta.url))));
const cases=JSON.parse(readFileSync(new URL('../spec/conformance/fit.json',import.meta.url)));
test('84 budget vectors agree across native TypeScript/JS and Python implementations',()=>{
 const result=spawnSync(process.env.BYOKIT_PYTHON || (process.platform==='win32'?'python':'python3'),['packages/python/tests/conformance_runner.py'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const python=JSON.parse(result.stdout);assert.equal(python.length,cases.length);
 cases.forEach((c,i)=>assert.deepEqual(checkFit(catalog.get(c.offeringId),c.budget),python[i],c.name));
});
test('selection filtering/ranking agree across languages',()=>{
 const configurations=[{}, {preset:'china',ui:{maxProviders:1,maxModelsPerProvider:1}},{filters:{minContextTokens:9000}},{filters:{openWeights:true,commercialUse:'allowed'}},{filters:{requiredFeatures:['strictJsonSchema']},unknownPolicy:'include'},{filters:{includeDeprecated:true},prefer:{lowerCost:true}},{filters:{input:['image']}},{filters:{minTokensPerSecond:20}},{filters:{fileFormats:['pdf']},unknownPolicy:'include'}];
 const result=spawnSync(process.env.BYOKIT_PYTHON || (process.platform==='win32'?'python':'python3'),['packages/python/tests/conformance_runner.py','select'],{input:JSON.stringify(configurations),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 assert.deepEqual(configurations.map(c=>catalog.select(c)),JSON.parse(result.stdout));
});
