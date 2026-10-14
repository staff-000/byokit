import {createReport,issueUrl,PublicationTracker} from './verification-report.js';
import catalog,* as byokit from './lib/core/catalog.js';
import {requestExample} from './request-examples.js';
import {ProviderApi,ProtocolNames,verifyInference,successRecord,safeRecords,requestFor} from './inference.js';
const $=s=>document.querySelector(s),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
let activeReport=null,publishedReports=[];
function publicationStatus(message){$('#publication-status').textContent=message;}
const tracker=new PublicationTracker(reports=>{
 const errors=byokit.validateVerifications(reports,catalog);if(errors.length)throw new Error('Invalid published verification records.');
 publishedReports=reports;renderModels();
});
function trackPublication(){if(!activeReport)return;tracker.start(activeReport.operationId,(state,record)=>{
 if(state==='published'){publicationStatus(`Published: community verified by ${record.contributor.replace('github:','@')} on ${new Date(record.checkedAt).toLocaleDateString()}.`);$('#check-publication').hidden=true;}
 else publicationStatus(state==='unavailable'?'Publication feed is unavailable. Check again later.':state==='pending'?'Publication is not confirmed yet. Submit the issue on GitHub, or check its workflow and try Check publication.':'Submit the issue on GitHub. Waiting for it to appear on the website…');
},activeReport.offeringId);}
$('#share-verification').addEventListener('click',()=>{publicationStatus('The GitHub form is open. Submit new issue there to share your report.');$('#check-publication').hidden=false;trackPublication()});
$('#check-publication').addEventListener('click',trackPublication);
const storageKey='byokit.inference-verifications.v1';let records=[],storageAvailable=true;try{records=safeRecords(JSON.parse(localStorage.getItem(storageKey)||'[]'))}catch{storageAvailable=false}
const models=byokit.getModels(byokit.COMPLETE);let selected=models[0],shown=40,revision=0,controller=null,busy=false,requestLanguage='javascript';
function settings(){const local=!!selected.local;return {offeringId:selected.id,providerId:selected.providerId,modelId:local?$('#local-model').value.trim():selected.apiModelId,endpoint:local?$('#endpoint').value.trim():undefined,protocol:$('#protocol').value,prompt:$('#prompt').value,maxTokens:Number($('#max-tokens').value)}}
function status(text,kind){$('#call-status').textContent=text;$('#call-status').dataset.state=kind||''}
function invalidate(){revision++;controller?.abort();busy=false;$('#verify').disabled=false;tracker.stop();activeReport=null;$('#share-verification').hidden=true;$('#check-publication').hidden=true;publicationStatus('');$('#cancel').hidden=true;$('#response-text').hidden=true;status('Settings changed. Verify this configuration to check it.');}
function renderRequest(){try{$('#request-code').textContent=requestExample(settings(),requestLanguage,{authenticated:selected.providerId!=='local'||!!$('#api-key').value.trim()})}catch{$('#request-code').textContent='Complete valid model settings to see the request.'}}
function destination(){renderRequest();try{$('#destination').textContent=requestFor({...settings(),prompt:'check'},'display-only').url}catch{$('#destination').textContent=selected.local?'Enter your server URL and model ID.':ProviderApi[selected.providerId]?.base||'Unsupported provider'}}
function select(model){const changedProvider=selected?.providerId!==model.providerId;invalidate();selected=model;if(changedProvider)$('#api-key').value='';$('#selected-name').textContent=model.name;$('#selected-id').textContent=model.id;const api=ProviderApi[model.providerId];$('#protocol').replaceChildren(...(api?.protocols||[]).map(p=>{const option=el('option',ProtocolNames[p]);option.value=p;return option}));$('#local-fields').hidden=!model.local;$('#key-optional').textContent=model.local?'(optional)':'';$('#provider-docs').hidden=!api?.docs;if(api?.docs)$('#provider-docs').href=api.docs;destination();status('Ready to verify. No call has been made.');}
function renderModels(){
 const search=$('#model-search').value.trim().toLowerCase(),provider=$('#provider-filter').value,only=$('#verified-only').checked;
 const filtered=models.filter(m=>(!provider||m.providerId===provider)&&(!search||[m.name,m.apiModelId,m.provider.name,...m.tags,...m.model.tags].join(' ').toLowerCase().includes(search))&&(!only||records.some(r=>r.offeringId===m.id)));
 $('#model-count').textContent=`${filtered.length} entries`;
 const rows=filtered.slice(0,shown).map(m=>{
  const tr=el('tr'),name=el('td');name.append(el('span',m.provider.name,'provider-name'),el('div',m.name,'model-name'),el('code',m.apiModelId||'Configure your local server','model-id'));
  const metadata=el('td');metadata.append(el('span',m.limits.context?`${m.limits.context.toLocaleString()} context tokens`:'Context unknown','provider-name'));
  const tags=el('div',undefined,'model-tags');for(const tag of [...new Set([...m.tags,...m.model.tags])])tags.append(el('span',tag,'tag'));metadata.append(tags);
  const action=el('td'),last=records.find(r=>r.offeringId===m.id),summary=byokit.verificationSummary({verifications:publishedReports},m.id);
  if(last)action.append(el('span','Verified here','badge passed'),el('span',new Date(last.checkedAt).toLocaleDateString(),'evidence-note'));
  if(summary.latest){const report=summary.latest,label=summary.status==='stale'?'Historical verification':summary.status==='passed'?'Community verified':'Community call failed',link=el('a',`${label} by ${report.contributor.replace('github:','@')} · ${new Date(report.checkedAt).toLocaleDateString()}`,'evidence-note');link.href=report.evidence;link.target='_blank';link.rel='noopener noreferrer';action.append(link)}
  else if(!last)action.append(el('span','No community verification yet','evidence-note'));
  const button=el('button','Verify','small-button');button.type='button';button.addEventListener('click',()=>{select(m);$('#call-panel').scrollIntoView({behavior:'smooth',block:'start'});$('#api-key').focus({preventScroll:true})});action.append(button);tr.append(name,metadata,action);return tr;
 });
 $('#models').replaceChildren(...rows);if(!rows.length){const tr=el('tr'),td=el('td','No matching models. Change your search or filter.','empty');td.colSpan=3;tr.append(td);$('#models').append(tr)}
 $('#paging-note').textContent=`Showing ${Math.min(shown,filtered.length)} of ${filtered.length} entries.`;$('#show-more').hidden=shown>=filtered.length;
}
function renderRecords(){const list=$('#records');list.replaceChildren();if(!records.length)list.append(el('div','No successful inference calls recorded in this browser yet.','report'));for(const r of records.slice(0,30)){const card=el('article',undefined,'report');card.append(el('strong',r.offeringId),el('span','Passed','badge passed'),el('p',`${r.checkedAt} · ${ProtocolNames[r.protocol]||r.protocol} · ${r.latencyMs} ms`),el('code',`${r.modelId} · max output ${r.maxTokens}`));if(r.returnedModel!==r.modelId)card.append(el('p',`Provider returned model: ${r.returnedModel}`));list.append(card)}$('#export-records').disabled=!records.length;$('#clear-records').disabled=!records.length;$('#storage-note').textContent=storageAvailable?'Records stay in this browser until you clear or export them.':'Browser storage is unavailable. Records stay in memory for this visit; export them before leaving.';}
$('#verify-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const captured=settings(),key=$('#api-key').value,id=++revision;busy=true;controller=new AbortController();$('#verify').disabled=true;$('#cancel').hidden=false;$('#response-text').hidden=true;
 tracker.stop();activeReport=null;$('#share-verification').hidden=true;$('#check-publication').hidden=true;publicationStatus('');
 try{
  requestFor(captured,key);
  status('Calling the selected provider…','checking');const result=await verifyInference(captured,key,{signal:controller.signal});if(id!==revision)return;
  const record=successRecord(captured,result,key);records=[record,...records].slice(0,200);try{localStorage.setItem(storageKey,JSON.stringify(records))}catch{storageAvailable=false}
  $('#response-text').textContent=result.text;$('#response-text').hidden=false;status(`Call succeeded in ${result.latencyMs} ms. Recorded ${storageAvailable?'in this browser':'in memory for this visit'}.`,'success');renderRecords();renderModels();
  if(captured.providerId!=='local'){
   try{activeReport=createReport(captured,result,record.id,key);$('#share-verification').href=issueUrl(activeReport);$('#share-verification').hidden=false;publicationStatus('Share this success through GitHub to add a public community verification.');}
   catch{publicationStatus('The call succeeded, but its report cannot be shared. Your private data was not submitted.');}
  }else publicationStatus('Local-server checks stay in this browser and are not published.');
 }catch(e){if(id===revision){status(e.code==='NETWORK_ERROR'?'The provider could not be reached. Browser/network restrictions may prevent this call. Copy the SDK example to try it locally.':e.message,'error')}}
 finally{if(id===revision){busy=false;$('#verify').disabled=false;$('#cancel').hidden=true}}
});
for(const button of document.querySelectorAll('[data-request-language]'))button.addEventListener('click',()=>{requestLanguage=button.dataset.requestLanguage;for(const b of document.querySelectorAll('[data-request-language]')){b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button))}renderRequest()});
$('#copy-request').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#request-code').textContent);$('#copy-request').textContent='Copied';setTimeout(()=>$('#copy-request').textContent='Copy',1800)}catch{const range=document.createRange();range.selectNodeContents($('#request-code'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('#copy-request').textContent='Select to copy'}});
$('#cancel').addEventListener('click',()=>controller?.abort());$('#clear-key').addEventListener('click',()=>{$('#api-key').value='';invalidate();destination();status('API key cleared.');});for(const id of ['api-key','protocol','endpoint','local-model','prompt','max-tokens'])$('#'+id).addEventListener('input',()=>{if(id==='endpoint')$('#api-key').value='';invalidate();destination()});
for(const provider of [...new Map(models.map(m=>[m.providerId,m.provider])).values()]){const option=el('option',provider.name);option.value=provider.id;$('#provider-filter').append(option)}for(const id of ['model-search','provider-filter','verified-only'])$('#'+id).addEventListener('input',()=>{shown=40;renderModels()});$('#show-more').addEventListener('click',()=>{shown+=40;renderModels()});
$('#clear-records').addEventListener('click',()=>{records=[];try{localStorage.removeItem(storageKey)}catch{}renderRecords();renderModels()});$('#export-records').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({schemaVersion:1,scope:'this-browser',records},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='byokit-inference-verifications.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)tracker.stop();else if(activeReport&&!$('#check-publication').hidden)trackPublication()});
window.addEventListener('pagehide',()=>{$('#api-key').value='';controller?.abort();tracker.stop();revision++});
window.addEventListener('pageshow',event=>{if(event.persisted){$('#api-key').value='';invalidate()}});
select(selected);renderModels();renderRecords();
void tracker.check('').catch(()=>{});
