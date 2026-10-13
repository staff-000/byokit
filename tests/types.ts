import {Catalog,checkFit,PickerConfig,FeatureName,Modality,Preset,ProviderId,Deployment,UnknownPolicy,LocalRuntime,Locale,githubContributor,customTag,customProviderId} from '@byokit/core';
import {mountByok} from '@byokit/dom';
import {discoverLocal} from '@byokit/dom/local';
import {getModels} from '@byokit/core/catalog';
const config:PickerConfig={preset:Preset.NonChina,providerIds:[ProviderId.DeepSeek],filters:{input:[Modality.Image],requiredFeatures:[FeatureName.FunctionCalling],deployment:[Deployment.Hosted],includeTags:[customTag('usecase:summarization')]},unknownPolicy:UnknownPolicy.Exclude};
declare const catalog:Catalog;
checkFit(catalog.get('test/model'),{inputTokens:1000});
mountByok(document.createElement('div'),{catalog,config,locale:Locale.English,onSave:selection=>{console.log(selection.credentialRef)}});
discoverLocal('http://127.0.0.1:11434',{runtime:LocalRuntime.Ollama});
getModels({limit:10,filters:{verified:true,verifiedBy:githubContributor('example')}});
getModels({providerIds:[customProviderId('my-provider')]});
// @ts-expect-error fixed choices require enum members, not raw strings
getModels({preset:'china'});
// @ts-expect-error unknown providers are caught at compile time
getModels({providerIds:['deepseak']});
// @ts-expect-error even a correctly spelled raw feature is rejected
getModels({filters:{requiredFeatures:['functionCalling']}});
// @ts-expect-error modality typo
getModels({filters:{input:['imag']}});
// @ts-expect-error named constants must exist
const bad=FeatureName.FunctionCallling;

import {ProviderId as CatalogProviderId} from '@byokit/core/catalog';
getModels({providerIds:[CatalogProviderId.DeepSeek]});

import * as byokit from '@byokit/core/catalog';
byokit.getModels({providerIds:[byokit.ProviderId.DeepSeek]});

byokit.getModels({preset:byokit.Preset.NonChina,filters:{verifiedBy:byokit.githubContributor('example')}});
