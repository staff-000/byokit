import * as byokit from '@byokit/core/catalog';
const models=byokit.getModels({providerIds:[byokit.ProviderId.DeepSeek]});
console.log(JSON.stringify(models.map(({id,name})=>({id,name})),null,2));
