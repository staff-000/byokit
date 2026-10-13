/** Explicit local snapshot import. Does not download or change a trusted endpoint. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validateCatalog,deriveTags} from '../packages/core/index.js';
const [source,...args]=process.argv.slice(2);if(!source)throw new Error('Usage: node scripts/import-catalog.mjs snapshot.json [--out directory]');
const i=args.indexOf('--out'),out=resolve(i>=0?args[i+1]:'catalog');
const observedIndex=args.indexOf('--observed-at');
let observedAt=observedIndex>=0?args[observedIndex+1]:undefined;
if(observedAt!==undefined&&(!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(observedAt)||!Number.isFinite(Date.parse(observedAt))))throw new Error('Invalid snapshot observation timestamp');
const raw=await readFile(resolve(source)),upstream=JSON.parse(raw),overlay=JSON.parse(await readFile(new URL('../catalog/overlays.json',import.meta.url)));
if(!observedAt){try{const previous=JSON.parse(await readFile(resolve(out,'catalog.lock.json'),'utf8'));if(previous.sha256===createHash('sha256').update(raw).digest('hex'))observedAt=previous.observedAt}catch{}}
const catalog={schemaVersion:1,provenance:{source:'https://models.dev/api.json',reviewedAt:new Date().toISOString().slice(0,10)},providers:[],families:[],models:[],offerings:[],presets:[{id:'default',providerIds:['openai','anthropic','google','openrouter','deepseek']},{id:'global',providerIds:[]},{id:'china',providerIds:[]},{id:'non-china',providerIds:[]}],assets:[]};
const known=new Set(),families=new Set();
const feature=(value)=>({status:value===true?'supported':value===false?'unsupported':'unknown',source:'models.dev'});
const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
for(const [id,curation] of Object.entries(overlay.providers)){
 const p=upstream[id];if(!p)throw new Error(`Upstream provider missing: ${id}`);
 catalog.providers.push({id,name:p.name,docsUrl:p.doc,origin:curation.origin,auth:'required',deployment:'hosted',logoId:`provider:${id}`,tags:[`origin:${curation.origin}`],provenance:{source:'catalog/overlays.json',reviewedAt:catalog.provenance.reviewedAt}});
 catalog.assets.push({id:`provider:${id}`,light:`https://models.dev/logos/${id}.svg`,source:'https://github.com/anomalyco/models.dev',licenseNotice:'Models.dev MIT; brand trademarks belong to their owners.'});
 for(const preset of curation.presets)catalog.presets.find(x=>x.id===preset).providerIds.push(id);
 const entries=Object.values(p.models || {}).filter(m=>m.modalities?.output?.includes('text')).sort((a,b)=>(b.release_date||'').localeCompare(a.release_date||'')||a.id.localeCompare(b.id));
 // COMPLETE needs every text-output offering from each supported provider, including retired entries for explicit inspection.
 for(const [rank,m] of entries.entries()){
  const modelId=m.canonical_model_id || `${id}/${m.id}`,familyId=m.family || modelId;
  if(!families.has(familyId)){families.add(familyId);catalog.families.push({id:familyId,name:familyId,logoId:`provider:${id}`})}
  if(!known.has(modelId)){known.add(modelId);catalog.models.push({id:modelId,name:m.name,familyId,origin:m.canonical_model_id?undefined:curation.origin,openWeights:typeof m.open_weights==='boolean'?m.open_weights:null,commercialUse:'unknown',license:m.license || null,size:{totalParameters:null,activeParameters:null,architecture:'unknown'},tags:m.open_weights===true?['weights:open']:[],provenance:{source:'models.dev',reviewedAt:catalog.provenance.reviewedAt}})}
  const features={functionCalling:feature(m.tool_call),parallelTools:feature(),forcedToolChoice:feature(),strictToolSchema:feature(),promptCaching:feature(),jsonMode:feature(),jsonSchema:feature(m.structured_output),strictJsonSchema:feature(),systemMessages:feature(),developerMessages:feature(),thinking:feature(m.reasoning),thinkingDisable:feature(),thinkingBudget:feature(),thinkingEffort:feature()};
  if(Array.isArray(m.reasoning_options)){for(const [name,type] of [['thinkingDisable','toggle'],['thinkingBudget','budget_tokens'],['thinkingEffort','effort']]){const opt=m.reasoning_options.find(o=>o.type===type);if(opt)features[name]={...feature(true),details:opt}}}
  // A cache price does not prove user-controllable caching or TTL support.
  const tags=Object.entries(features).filter(([,f])=>f.status==='supported').map(([k])=>`cap:${k}`);
  if(typeof m.cost?.input==='number'&&typeof m.cost?.output==='number'){const cost=(1000*m.cost.input+1000*m.cost.output)/1e6;tags.push(`price:${cost===0?'zero-token-rate':cost<=.002?'budget':cost<=.02?'mid':'premium'}`)}
  if(m.limit?.context>0)tags.push(`context:${m.limit.context>=1000000?'1m+':m.limit.context>=128000?'128k+':m.limit.context>=32000?'32k+':'under-32k'}`);
  tags.push(...(m.modalities?.input || []).map(x=>`input:${x}`),...(m.modalities?.output || []).map(x=>`output:${x}`),'deployment:hosted');
  catalog.offerings.push({id:`${id}/${m.id}`,providerId:id,modelId,apiModelId:m.id,name:m.name,deployment:'hosted',hosting:{region:null,eligibility:'unknown'},speed:{timeToFirstTokenMs:null,tokensPerSecond:null,source:null},rank,...(observedAt?{lifecycleEvidence:{status:m.status==='deprecated'?'OUTDATED':'LIVE',basis:'catalog-listing',source:'https://models.dev/api.json',checkedAt:observedAt}}:{}),status:m.status||'stable',fileFormats:(m.modalities?.input || []).filter(x=>!['text','image','audio','video','embedding'].includes(x)),modalities:{input:m.modalities?.input?.filter(x=>['text','image','audio','video','embedding'].includes(x))||null,output:m.modalities?.output?.filter(x=>['text','image','audio','video','embedding'].includes(x))||null},limits:{context:number(m.limit?.context)||null,input:number(m.limit?.input)||null,output:number(m.limit?.output)||null,contextAccounting:'unknown'},features,price:{currency:'USD',input:number(m.cost?.input),output:number(m.cost?.output),cacheRead:number(m.cost?.cache_read),cacheWrite:number(m.cost?.cache_write),tiers:m.cost?.tiers||[]},tags,provenance:{source:'models.dev',reviewedAt:catalog.provenance.reviewedAt}});
 }
}
for(const id of ['ollama','local']){
 catalog.providers.push({id,name:id==='ollama'?'Ollama (local)':'Local OpenAI-compatible',auth:'optional',deployment:'local',tags:['deployment:local']});
 // No fabricated model capabilities: the UI supports installed discovery and custom IDs.
 const modelId=`${id}/custom`;catalog.models.push({id:modelId,name:'Custom local model',openWeights:null,commercialUse:'unknown',license:null,tags:[]});
 catalog.offerings.push({id:modelId,providerId:id,modelId,apiModelId:'',name:'Enter an installed model ID',deployment:'local',modalities:{input:null,output:null},limits:{context:null,input:null,output:null,contextAccounting:'unknown'},features:{},price:{currency:'USD',input:null,output:null},tags:['deployment:local']});
 for(const p of catalog.presets)if(id==='local'||p.id!=='default')p.providerIds.push(id);
}
// Explicit evidence-backed overlays; identities/endpoints/auth cannot be overridden.
for(const [collection,allowed] of [['models',['origin','openWeights','commercialUse','license','size','tags']],['offerings',['modalities','fileFormats','limits','features','price','tags','speed','hosting','rank','status','lifecycleEvidence','popularityEvidence']]]){
 for(const [id,override] of Object.entries(overlay[collection] || {})){
  const record=catalog[collection].find(x=>x.id===id);
  if(!record)throw new Error(`Overlay target missing: ${id}`);
  if(typeof override.source!=='string'||typeof override.reviewedAt!=='string'||!override.fields)throw new Error('Overlay evidence required');
  for(const [key,value] of Object.entries(override.fields)){
   if(!allowed.includes(key))throw new Error(`Unapproved overlay field: ${key}`);
   record[key]=value&&typeof value==='object'&&!Array.isArray(value)?{...(record[key]||{}),...value}:value;
  }
  record.provenance={source:override.source,reviewedAt:override.reviewedAt};
 }
}
for(const o of catalog.offerings)o.tags=deriveTags(o,catalog.models.find(m=>m.id===o.modelId));
catalog.verifications=JSON.parse(await readFile(new URL('../catalog/verifications.json',import.meta.url),'utf8'));
const errors=validateCatalog(catalog);if(errors.length)throw new Error(errors.join('; '));
await mkdir(out,{recursive:true});
const destination=resolve(out,'catalog.json');
let previous;try{previous=JSON.parse(await readFile(destination,'utf8'))}catch{}
if(previous){const old=new Map(previous.offerings.map(o=>[o.id,o])),next=new Map(catalog.offerings.map(o=>[o.id,o]));const diff={added:[...next.keys()].filter(id=>!old.has(id)),removed:[...old.keys()].filter(id=>!next.has(id)),changed:[...next].filter(([id,o])=>old.has(id)&&JSON.stringify(o.limits)+JSON.stringify(o.price)!==JSON.stringify(old.get(id).limits)+JSON.stringify(old.get(id).price)).map(([id])=>id)};await writeFile(resolve(out,'changes.json'),JSON.stringify(diff,null,2)+'\n')}
await writeFile(destination,JSON.stringify(catalog,null,2)+'\n');
await writeFile(resolve(out,'catalog.lock.json'),JSON.stringify({schemaVersion:1,source:'https://models.dev/api.json',sha256:createHash('sha256').update(raw).digest('hex'),overlaySha256:createHash('sha256').update(JSON.stringify(overlay)).digest('hex'),verificationsSha256:createHash('sha256').update(JSON.stringify(catalog.verifications)).digest('hex'),observedAt:observedAt||null,generatedAt:catalog.provenance.reviewedAt},null,2)+'\n');
console.log(`Imported ${catalog.providers.length} providers and ${catalog.offerings.length} offerings`);

if(i<0){
 const core=new URL('../packages/core/',import.meta.url),python=new URL('../packages/python/src/byokit/data/',import.meta.url);
 await mkdir(python,{recursive:true});
 await writeFile(new URL('catalog.js',core),'import {Catalog} from "./index.js";\nconst data='+JSON.stringify(catalog)+';\nexport default data;\nexport * from \"./index.js\";\nexport function getModels(input={},options){return new Catalog(data).getModels(input,options)}\n');
 await writeFile(new URL('catalog.json',python),JSON.stringify(catalog)+'\n');
}
