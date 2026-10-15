import * as byokit from '../packages/core/catalog.js';
export function filterModels(state={}){
 let providerIds=byokit.getModels(byokit.COMPLETE,{local:false,sort:byokit.ModelSort.ProviderOrder,filters:{lifecycle:Object.values(byokit.Lifecycle),includeDeprecated:true}}).map(m=>m.providerId);
 providerIds=[...new Set(providerIds)];
 if(state.provider)providerIds=providerIds.filter(id=>id===state.provider);
 const filters={lifecycle:state.includeOutdated?[byokit.Lifecycle.Live,byokit.Lifecycle.Outdated]:[byokit.Lifecycle.Live],includeDeprecated:!!state.includeOutdated};
 if(state.feature&&state.feature!=='any')filters.requiredFeatures=[state.feature];
 if(state.modality&&state.modality!=='any')filters.input=[state.modality];
 if(state.weights&&state.weights!=='any')filters.openWeights=state.weights==='open';
 if(Number(state.context)>0)filters.minContextTokens=Number(state.context);
 if(state.price&&state.price!=='any')filters.maxInputPricePerM=Number(state.price);
 if(state.region==='china')filters.includeTags=[byokit.Tag.OriginChina];
 if(state.excludeTag)filters.excludeTags=[byokit.customTag(state.excludeTag)];
 let models=byokit.getModels(byokit.COMPLETE,{providerIds,local:false,filters,sort:state.sort==='price'?byokit.ModelSort.Price:state.sort==='speed'?byokit.ModelSort.Speed:byokit.ModelSort.ProviderOrder});

 if(!state.provider||state.provider===byokit.ProviderId.Local)models.push(...byokit.getModels().filter(m=>m.local));
 const search=(state.search||'').trim().toLowerCase();if(search)models=models.filter(m=>[m.name,m.apiModelId,m.provider.name,...m.tags,...m.model.tags].join(' ').toLowerCase().includes(search));
 if(state.sort==='release')models.sort((a,b)=>(b.releaseDate||'').localeCompare(a.releaseDate||''));


 return models;
}
