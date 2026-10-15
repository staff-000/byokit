import {ApiProtocol,Deployment,AuthRequirement,CommercialUse,ContextAccounting,Lifecycle,Popularity,VerificationStatus,Currency} from './enums.js';
export function validateConnection(connection){
 if(!connection||Object.keys(connection).some(k=>!['baseUrl','protocol'].includes(k))||!Object.values(ApiProtocol).includes(connection.protocol))throw new Error('Invalid model connection');
 let url;try{url=new URL(connection.baseUrl)}catch{throw new Error('Invalid model endpoint')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Use an HTTP(S) model endpoint without credentials, query or fragment');
}
export function appendModel(models,custom){
 if(!Array.isArray(models)||!custom||typeof custom!=='object'||Array.isArray(custom)||Object.keys(custom).some(k=>!['providerId','providerName','modelId','name','baseUrl','protocol','deployment','limits'].includes(k)))throw new Error('Invalid custom model fields');
 for(const key of ['providerId','modelId'])if(typeof custom[key]!=='string'||!custom[key].trim())throw new Error('Custom provider and model IDs are required');
 for(const key of ['providerName','name'])if(custom[key]!==undefined&&(typeof custom[key]!=='string'||!custom[key].trim()))throw new Error('Invalid custom model name');
 const connection={baseUrl:custom.baseUrl,protocol:custom.protocol};validateConnection(connection);
 const deployment=custom.deployment??Deployment.Hosted;if(!Object.values(Deployment).includes(deployment))throw new Error('Unknown deployment');
 if(custom.limits!==undefined&&(!custom.limits||typeof custom.limits!=='object'||Array.isArray(custom.limits)))throw new Error('Invalid custom model limits');
 const limits={context:null,input:null,output:null,contextAccounting:ContextAccounting.Unknown,...custom.limits};
 if(Object.keys(limits).some(k=>!['context','input','output','contextAccounting'].includes(k))||!Object.values(ContextAccounting).includes(limits.contextAccounting)||['context','input','output'].some(k=>limits[k]!==null&&!(typeof limits[k]==='number'&&Number.isFinite(limits[k])&&limits[k]>0)))throw new Error('Invalid custom model limits');
 const id=custom.providerId+'/'+custom.modelId;if(models.some(m=>m.id===id))throw new Error('Duplicate model offering');
 const name=custom.name??custom.modelId;
 const model={id,providerId:custom.providerId,modelId:id,apiModelId:custom.modelId,name,deployment,connection,limits,modalities:{input:null,output:null},features:{},price:{currency:Currency.USD,input:null,output:null},tags:[],provider:{id:custom.providerId,name:custom.providerName??custom.providerId,deployment,auth:AuthRequirement.Optional,tags:[]},model:{id,name,openWeights:null,commercialUse:CommercialUse.Unknown,license:null,tags:[]},family:null,logos:{provider:null,family:null},lifecycle:{status:Lifecycle.Uncertain,evidence:null},popularity:{status:Popularity.Uncertain,evidence:null},verification:{status:VerificationStatus.Unverified,latest:null,records:[]}};
 return structuredClone([...models,model]);
}
