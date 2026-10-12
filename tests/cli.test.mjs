import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
test('CLI passes a valid budget and fails an excessive budget before requests',()=>{
 const good=spawnSync('node',['packages/cli/bin.mjs','check','examples/task.config.json','--strict'],{encoding:'utf8'});assert.equal(good.status,0,good.stdout+good.stderr);
 const dir=mkdtempSync(join(tmpdir(),'byokit-'));const file=join(dir,'config.json');writeFileSync(file,JSON.stringify({catalog:resolve('spec/fixtures/catalog.json'),tasks:[{offeringIds:['test/small'],budget:{maxInputTokens:9000,maxOutputTokens:1000}}]}));
 const bad=spawnSync('node',['packages/cli/bin.mjs','check',file],{encoding:'utf8'});assert.equal(bad.status,1);assert.match(bad.stdout,/CONTEXT_BUDGET_EXCEEDED/);
 const built=spawnSync('node',['packages/cli/bin.mjs','build','examples/byok.config.json','--out',join(dir,'catalog.json')],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);assert.ok(JSON.parse(readFileSync(join(dir,'catalog.json'))).providers.length<=8);assert.match(readFileSync(join(dir,'catalog.json.d.ts'),'utf8'),/export type OfferingId/);
});
