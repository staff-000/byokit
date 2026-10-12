/** Explicit discovery only; never called on mount or catalog refresh. */
export async function discoverLocal(endpoint,{runtime='ollama',fetch:fetcher=globalThis.fetch,signal,allowRemote=false}={}) {
  const url=new URL(endpoint);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(!loopback&&!allowRemote))throw new Error('Use an explicit HTTP(S) endpoint; remote endpoints require allowRemote.');
  if(!['ollama','openai-compatible'].includes(runtime))throw new Error('Unknown local runtime');
  url.pathname=url.pathname.replace(/\/$/,'')+(runtime==='ollama'?'/api/tags':'/models');
  const response=await fetcher(url,{signal:signal || AbortSignal.timeout(10000),credentials:'omit',redirect:'error'});
  if(!response.ok)throw new Error('Local discovery failed');
  const data=await response.json(),list=runtime==='ollama'?data.models:data.data;
  if(!Array.isArray(list))throw new Error('Invalid model list');
  return list.slice(0,1000).map(m=> {
    const name=m.name || m.id;if(typeof name!=='string')throw new Error('Invalid model ID');
    return {id:`local/${name}`,providerId:runtime==='ollama'?'ollama':'local',modelId:`local/${name}`,apiModelId:name,name,deployment:'local',modalities:{input:null,output:null},limits:{context:null,input:null,output:null,contextAccounting:'unknown'},features:{},price:{currency:'USD',input:null,output:null},tags:['deployment:local'],artifact:{quantization:m.details?.quantization_level,fileBytes:m.size,digest:m.digest},provenance:{source:endpoint,reviewedAt:new Date().toISOString()}};
  });
}
