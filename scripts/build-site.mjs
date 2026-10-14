import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateVerifications} from '../packages/core/index.js';
import catalog from '../packages/core/catalog.js';
const root=resolve(new URL('..',import.meta.url).pathname),out=resolve(root,'dist/site');
await mkdir(out,{recursive:true});await cp(resolve(root,'website'),out,{recursive:true});
await writeFile(resolve(out,'inference.js'),(await readFile(resolve(root,'website/inference.js'),'utf8')).replaceAll('../packages/core/','./lib/core/'));
const serviceUrl=process.env.BYOKIT_VERIFICATION_API_URL||JSON.parse(await readFile(resolve(root,'website/verification-config.json'),'utf8')).serviceUrl;
if(serviceUrl){const url=new URL(serviceUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Verification service must use HTTPS without credentials, query, or fragment');}
await writeFile(resolve(out,'verification-config.json'),JSON.stringify({serviceUrl})+'\n');
await mkdir(resolve(out,'lib/core'),{recursive:true});
for(const file of ['index.js','enums.js','catalog.js','call.js','connection.js','sdk.js'])await cp(resolve(root,'packages/core',file),resolve(out,'lib/core',file));
await mkdir(resolve(out,'assets'),{recursive:true});
for(const provider of catalog.providers){try{await cp(resolve(root,'assets','provider_'+provider.id+'.svg'),resolve(out,'assets',provider.id+'.svg'))}catch{}}
const reports=catalog.verifications||[],errors=validateVerifications(reports,catalog);if(errors.length)throw new Error('Invalid contributor verification records');
await writeFile(resolve(out,'verification.json'),JSON.stringify({reports},null,2)+'\n');
await cp(resolve(root,'THIRD_PARTY_NOTICES.md'),resolve(out,'THIRD_PARTY_NOTICES.txt'));
await writeFile(resolve(out,'.nojekyll'),'');
console.log('Built static website: dist/site (GitHub Pages /byokit/ compatible)');
