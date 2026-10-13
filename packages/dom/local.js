import {LocalRuntime,LocalApi} from '@byokit/core';
/** Explicit discovery only; never called on mount or catalog refresh. */
export async function discoverLocal(endpoint,{runtime,api,runningOnly=false,fetch:fetcher=globalThis.fetch,signal,allowRemote=false}={}) {
  const url=new URL(endpoint);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(!loopback&&!allowRemote))throw new Error('Use an explicit HTTP(S) endpoint; remote endpoints require allowRemote.');
  if(runtime!==undefined&&!Object.values(LocalRuntime).includes(runtime))throw new Error('Unknown local runtime');
  const protocol=api || (runtime===LocalRuntime.OpenAICompatible?LocalApi.OpenAI:LocalApi.Ollama);
  if(!Object.values(LocalApi).includes(protocol))throw new Error('Unknown local API');
  const base=url.pathname.replace(/\/$/,'');
  url.pathname=protocol===LocalApi.Ollama?base.replace(/\/v1$/,'')+(runningOnly?'/api/ps':'/api/tags'):(base.endsWith('/v1')?base:base+'/v1')+'/models';
  const response=await fetcher(url,{signal:signal || AbortSignal.timeout(10000),credentials:'omit',redirect:'error'});
  if(!response.ok)throw new Error('Local discovery failed');
  const data=await response.json(),list=protocol===LocalApi.Ollama?data.models:data.data;
  if(!Array.isArray(list))throw new Error('Invalid model list');
  return list.slice(0,1000).map(m=> {
    const name=m.name || m.id;if(typeof name!=='string')throw new Error('Invalid model ID');
    return {id:`local/${name}`,providerId:'local',modelId:`local/${name}`,apiModelId:name,name,deployment:'local',local:{endpoint,api:protocol,configured:true},modalities:{input:null,output:null},limits:{context:null,input:null,output:null,contextAccounting:'unknown'},features:{},price:{currency:'USD',input:null,output:null},tags:['deployment:local'],artifact:{quantization:m.details?.quantization_level,fileBytes:m.size,digest:m.digest},provenance:{source:endpoint,reviewedAt:new Date().toISOString()}};
  });
}
