import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateVerifications} from '../packages/core/index.js';
import catalog from '../packages/core/catalog.js';
const root=resolve(new URL('..',import.meta.url).pathname),out=resolve(root,'dist/site');
await mkdir(out,{recursive:true});await cp(resolve(root,'website'),out,{recursive:true});
await mkdir(resolve(out,'lib/core'),{recursive:true});
for(const file of ['index.js','enums.js','catalog.js'])await cp(resolve(root,'packages/core',file),resolve(out,'lib/core',file));
await mkdir(resolve(out,'assets'),{recursive:true});
for(const provider of catalog.providers){try{await cp(resolve(root,'assets','provider_'+provider.id+'.svg'),resolve(out,'assets',provider.id+'.svg'))}catch{}}
const reports=catalog.verifications||[],errors=validateVerifications(reports,catalog);if(errors.length)throw new Error('Invalid contributor verification records');
let latest=null;try{latest=JSON.parse(await readFile(resolve(root,'docs/verification/latest.json'),'utf8'));if(latest.schemaVersion!==1||!Array.isArray(latest.checks))throw new Error('Invalid verification run')}catch(error){if(error.code!=='ENOENT')throw error}
const limitations=['No billable provider inference calls have been run by the automated verification suite.','No real contributor provider-call reports have been submitted.' ,'Chrome browser checks have been performed on macOS; Windows and Linux browser/runtime smoke checks remain pending.','Provider account access and subscription quota are not verified by catalog listing evidence.','Popularity is UNCERTAIN until objective, scoped usage evidence is submitted.'];
if(reports.length)limitations.splice(1,1);
if(!latest?.checks.some(c=>c.id==='website-browser'&&c.status==='passed'))limitations.push('The latest recorded run does not include a passing website browser smoke check.');
await writeFile(resolve(out,'verification.json'),JSON.stringify({latest,reports,limitations},null,2)+'\n');
await cp(resolve(root,'THIRD_PARTY_NOTICES.md'),resolve(out,'THIRD_PARTY_NOTICES.txt'));
await writeFile(resolve(out,'.nojekyll'),'');
console.log('Built static website: dist/site (GitHub Pages /byokit/ compatible)');
