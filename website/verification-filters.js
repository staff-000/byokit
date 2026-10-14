import * as byokit from '../packages/core/catalog.js';
export function filterModels(state={}){
 let providerIds=byokit.getModels(byokit.COMPLETE,{local:false,filters:{lifecycle:Object.values(byokit.Lifecycle),includeDeprecated:true}}).map(m=>m.providerId);
 providerIds=[...new Set(providerIds)];
 if(state.provider)providerIds=providerIds.filter(id=>id===state.provider);
 const filters={lifecycle:state.includeOutdated?[byokit.Lifecycle.Live,byokit.Lifecycle.Outdated]:[byokit.Lifecycle.Live],includeDeprecated:!!state.includeOutdated};
 if(state.feature&&state.feature!=='any')filters.requiredFeatures=[state.feature];
 if(state.modality&&state.modality!=='any')filters.input=[state.modality];
 if(state.weights&&state.weights!=='any')filters.openWeights=state.weights==='open';
 if(Number(state.context)>0)filters.minContextTokens=Number(state.context);
 if(state.price&&state.price!=='any')filters.maxInputPricePerM=Number(state.price);
 let models=byokit.getModels(byokit.COMPLETE,{providerIds,local:false,filters});
 if(state.region&&state.region!=='any')models=models.filter(m=>state.region==='china'?m.provider.origin===byokit.Country.China:!!m.provider.origin&&m.provider.origin!==byokit.Country.China);
 if(!state.provider||state.provider===byokit.ProviderId.Local)models.push(...byokit.getModels().filter(m=>m.local));
 const search=(state.search||'').trim().toLowerCase();if(search)models=models.filter(m=>[m.name,m.apiModelId,m.provider.name,...m.tags,...m.model.tags].join(' ').toLowerCase().includes(search));
 if(state.sort==='release')models.sort((a,b)=>(b.releaseDate||'').localeCompare(a.releaseDate||''));
 else if(state.sort==='speed')models.sort((a,b)=>(b.speed?.tokensPerSecond??-1)-(a.speed?.tokensPerSecond??-1));
 else if(state.sort==='price')models.sort((a,b)=>(a.price.input??Infinity)-(b.price.input??Infinity));
 return models;
}
