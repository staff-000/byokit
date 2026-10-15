// Included in the generated offline worker with the real byokit library/catalog.
self.onmessage=async({data})=>{
 const {code,id}=data;
 if(typeof code!=='string'||code.length>30000)return;
 let messages=0,characters=0;
 const emit=(level,values)=>{
  if(messages>=100||characters>=24000)return;
  const seen=new WeakSet();
  let text=values.map(value=>{
   if(typeof value==='string')return value;
   try{return JSON.stringify(value,(_key,item)=>{if(typeof item==='bigint')return String(item)+'n';if(item&&typeof item==='object'){if(seen.has(item))return '[Circular]';seen.add(item)}return item},2)??String(value)}catch{return String(value)}
  }).join(' ');
  if(text.length>24000-characters)text=text.slice(0,24000-characters)+'\n… output truncated';
  characters+=text.length;messages++;
  self.postMessage({kind:'byokit-playground',id,type:'log',text:level==='log'?text:level+': '+text});
 };
 const output=Object.freeze(Object.fromEntries(['log','info','warn','error','table','debug'].map(level=>[level,(...values)=>emit(level,values)])));
 try{
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const value=await new AsyncFunction('byokit','console','"use strict";\n'+code)(byokit,output);
  if(value!==undefined)emit('log',[value]);
  self.postMessage({kind:'byokit-playground',id,type:'done',empty:messages===0});
 }catch(error){self.postMessage({kind:'byokit-playground',id,type:'error',text:String(error.name||'Error')+': '+String(error.message||error).slice(0,2000)});}
};
