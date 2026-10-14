import {readFile,writeFile} from 'node:fs/promises';
import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {canonicalReport} from '../services/verification/report.mjs';
import {validateCatalog,validateVerifications} from '../packages/core/index.js';
export function authenticateEvent(event,secret){
 if(event.action!=='byokit-verification'||!secret)throw new Error('Invalid publication event.');
 const {payload,signature}=event.client_payload||{};
 if(!payload||Object.keys(payload).some(k=>!['report','user'].includes(k))||typeof signature!=='string')throw new Error('Invalid signed payload.');
 const expected=createHmac('sha256',secret).update('publish:'+JSON.stringify(payload)).digest(),received=Buffer.from(signature,'base64url');
 if(expected.length!==received.length||!timingSafeEqual(expected,received))throw new Error('Invalid publication signature.');return payload;
}
export function addReport(data,reports,payload,now=Date.now()){
 const record=canonicalReport(payload.report,payload.user,data,now);
 if(reports.some(r=>r.id===record.id))return {changed:false,data,reports};
 if(reports.filter(r=>r.contributor.toLowerCase()===record.contributor.toLowerCase()&&now-Date.parse(r.checkedAt)<86400000).length>=10)throw new Error('Daily publication limit reached.');
 const next=[...reports,record].sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt)||a.id.localeCompare(b.id)),catalog={...data,verifications:next};
 if(validateVerifications(next,catalog).length||validateCatalog(catalog).length)throw new Error('Invalid resulting catalog.');return {changed:true,data:catalog,reports:next};
}
const git=args=>{const r=spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw new Error('Repository operation failed.');return r.stdout.trim();};
async function run(){
 const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')),payload=authenticateEvent(event,process.env.BYOKIT_PUBLICATION_SECRET);
 for(let attempt=0;attempt<4;attempt++){
  // This script runs only in an isolated Actions checkout, never a developer worktree.
  git(['fetch','origin','main']);git(['reset','--hard','origin/main']);
  const data=JSON.parse(await readFile('catalog/catalog.json','utf8')),reports=JSON.parse(await readFile('catalog/verifications.json','utf8')),next=addReport(data,reports,payload);
  if(!next.changed){await writeFile(process.env.GITHUB_OUTPUT,`changed=false\nref=${git(['rev-parse','HEAD'])}\n`,{flag:'a'});return;}
  await writeFile('catalog/verifications.json',JSON.stringify(next.reports,null,2)+'\n');await writeFile('catalog/catalog.json',JSON.stringify(next.data,null,2)+'\n');
  await writeFile('packages/python/src/byokit/data/catalog.json',JSON.stringify(next.data)+'\n');
  await writeFile('packages/core/catalog.js','import {Catalog} from "./index.js";\nconst data='+JSON.stringify(next.data)+';\nexport default data;\nexport * from "./index.js";\nexport function getModels(input={},options){return new Catalog(data).getModels(input,options)}\n');
  const lock=JSON.parse(await readFile('catalog/catalog.lock.json','utf8'));lock.verificationsSha256=createHash('sha256').update(JSON.stringify(next.reports)).digest('hex');await writeFile('catalog/catalog.lock.json',JSON.stringify(lock,null,2)+'\n');
  git(['config','user.name','byokit verification bot']);git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
  git(['add','catalog/verifications.json','catalog/catalog.json','catalog/catalog.lock.json','packages/core/catalog.js','packages/python/src/byokit/data/catalog.json']);git(['commit','-m','Record authenticated community model verification']);
  const push=spawnSync('git',['push','origin','HEAD:main'],{encoding:'utf8'});
  if(push.status===0){await writeFile(process.env.GITHUB_OUTPUT,`changed=true\nref=${git(['rev-parse','HEAD'])}\n`,{flag:'a'});return;}
 }
 throw new Error('Publication could not push after concurrent-update retries.');
}
if(process.argv[1]?.endsWith('publish-verification.mjs'))run().catch(()=>{console.error('Verification publication failed; no credentials or report payload logged.');process.exitCode=1;});
