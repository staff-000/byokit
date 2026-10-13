import {getModels,ProviderId} from '@byokit/core/catalog';
const models=getModels({providerIds:[ProviderId.DeepSeek],limit:1});
console.log(JSON.stringify(models.map(({id,name})=>({id,name})),null,2));
