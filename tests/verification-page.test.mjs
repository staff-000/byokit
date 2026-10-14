import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {JSDOM} from 'jsdom';
import {parseIssueReport} from '../website/verification-report.js';
import {canonicalReport} from '../scripts/verification-report.mjs';
const wait=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(r=>setTimeout(r,10))}throw new Error('Page state did not arrive.');};
test('anonymous page verifies, shares safely, fences stale calls and only confirms public evidence',async()=>{
 const html=await readFile('website/verification.html','utf8'),dom=new JSDOM(html,{url:'https://staff-000.github.io/byokit/verification.html',pretendToBeVisual:true});
 const originals={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.localStorage=dom.window.localStorage;
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 const $=s=>document.querySelector(s),change=(id,value)=>{$('#'+id).value=value;$('#'+id).dispatchEvent(new dom.window.Event('input',{bubbles:true}))};
 let calls=0,feed=[],providerMode='success',resolveProvider;
 globalThis.fetch=async(url,options={})=>{
  if(url==='./verification.json')return new Response(JSON.stringify({reports:feed}));
  assert.ok(String(url).startsWith('https://api.deepseek.com/'));calls++;assert.equal(options.headers.Authorization,'Bearer fixture-secret-key');
  const data=JSON.parse(options.body);assert.equal(data.messages[0].content,'private fixture prompt');
  if(providerMode==='pending')return new Promise(r=>resolveProvider=r);
  if(providerMode==='failure')return new Response('{}',{status:401});
  return new Response(JSON.stringify({model:data.model,choices:[{message:{content:'private generated output'}}],usage:{prompt_tokens:5,completion_tokens:4}}));
 };
 try{
  let source=await readFile('website/verification.js','utf8');for(const [relative,file] of [['./lib/core/catalog.js','packages/core/catalog.js'],['./verification-report.js','website/verification-report.js'],['./request-examples.js','website/request-examples.js'],['./inference.js','website/inference.js']])source=source.replace(`'${relative}'`,JSON.stringify(pathToFileURL(resolve(file)).href));
  await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.equal($('#github-sign-in'),null);assert.equal($('#verify').disabled,false);assert.equal(calls,0);
  change('provider-filter','deepseek');$('#models button').click();change('api-key','fixture-secret-key');change('prompt','private fixture prompt');
  $('#verify-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!$('#share-verification').hidden);
  assert.equal(calls,1);assert.match($('#call-status').textContent,/Call succeeded/);
  const share=new URL($('#share-verification').href),report=parseIssueReport(share.searchParams.get('body'));
  for(const secret of ['fixture-secret-key','private fixture prompt','private generated output']){assert.ok(!decodeURIComponent(share.href).includes(secret));assert.ok(!localStorage.getItem('byokit.inference-verifications.v1').includes(secret));}
  $('#share-verification').addEventListener('click',e=>e.preventDefault());$('#share-verification').click();await wait(()=>$('#publication-status').textContent.includes('Waiting'));
  assert.equal(calls,1);assert.ok(!$('#publication-status').textContent.includes('Published:'));
  feed=[canonicalReport({report,user:{id:123,login:'fixture-user'},evidence:'https://github.com/staff-000/byokit/issues/42',createdAt:report.checkedAt})];
  $('#check-publication').click();await wait(()=>$('#publication-status').textContent.startsWith('Published:'));assert.equal(calls,1);assert.match($('#models').textContent,/Community verified by @fixture-user/);
  providerMode='failure';$('#verify-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>$('#call-status').textContent.includes('HTTP 401'));
  assert.equal(JSON.parse(localStorage.getItem('byokit.inference-verifications.v1')).length,1);assert.equal($('#share-verification').hidden,true);
  providerMode='pending';$('#verify-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>resolveProvider);change('prompt','changed settings');
  resolveProvider(new Response(JSON.stringify({choices:[{message:{content:'late'}}]})));await new Promise(r=>setTimeout(r,30));assert.match($('#call-status').textContent,/Settings changed/);assert.equal(JSON.parse(localStorage.getItem('byokit.inference-verifications.v1')).length,1);
  window.dispatchEvent(new dom.window.Event('pagehide'));assert.equal($('#api-key').value,'');
 }finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();Object.assign(globalThis,originals);}
});
