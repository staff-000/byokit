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

byokit.getModels({filters:{excludeTags:[byokit.Tag.PricePremium],lifecycle:[byokit.Lifecycle.Live],popularity:[byokit.Popularity.Popular]}});
// @ts-expect-error lifecycle values require enums
byokit.getModels({filters:{lifecycle:['LIVE']}});
// @ts-expect-error unknown popularity label
byokit.getModels({filters:{popularity:['famous']}});
const lifecycle:byokit.Lifecycle=byokit.getModels()[0].lifecycle.status;

byokit.getModels();
byokit.getModels(byokit.COMPLETE);
byokit.getModels(byokit.CHINA,{local:false});
byokit.getModels({local:[{endpoint:'http://localhost:8000/v1',api:byokit.LocalApi.OpenAI,modelId:'my-model'}]});
// @ts-expect-error shortcuts are enum values, not raw strings
byokit.getModels('complete');
// @ts-expect-error unknown local protocol
byokit.getModels({local:[{endpoint:'http://localhost:8000',api:'vllm'}]});

import * as calls from '@byokit/core/catalog';
const chosen = calls.getModels({providerIds:[calls.ProviderId.DeepSeek]})[0];
calls.call(chosen,'Hi','key',{runtimeChecks:false});
calls.callClaude(chosen,{messages:[{role:calls.Role.User,content:'Hi'}]},'key');
// @ts-expect-error misspelled request parameter
calls.call(chosen,{messages:[{role:calls.Role.User,content:'Hi'}],max_toknes:100},'key');
// @ts-expect-error raw roles must use the public enum
calls.call(chosen,{messages:[{role:'user',content:'Hi'}]},'key');
// @ts-expect-error runtime checks must be boolean
calls.call(chosen,'Hi','key',{runtimeChecks:'false'});

const client=calls.openAI({model:chosen,apiKey:()=> 'application-owned-key'});
client.chat.completions.create({model:chosen.apiModelId,messages:[{role:calls.Role.User,content:'Hi'}]},{runtimeChecks:false});
const anthropic=new calls.Anthropic({model:chosen,apiKey:async()=> 'application-owned-key'});
anthropic.messages.create({messages:[{role:calls.Role.User,content:'Hi'}],max_tokens:100});
// @ts-expect-error SDK clients require a key accessor, not a retained key string
calls.openAI({model:chosen,apiKey:'key'});
// @ts-expect-error streaming is not part of the supported SDK subset
client.chat.completions.create({messages:[{role:calls.Role.User,content:'Hi'}],stream:true});

const modelReleaseDate: string | null | undefined = byokit.getModels()[0].releaseDate;
const modelTokensPerSecond: number | null | undefined = byokit.getModels()[0].speed?.tokensPerSecond;
