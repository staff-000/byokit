import {Catalog,checkFit,PickerConfig,FeatureName,Modality,Preset,ProviderId,Deployment,UnknownPolicy,LocalRuntime,Locale,githubContributor,customTag,customProviderId,exact,any,Speciality,Tier} from 'byokit';
import {mountByok} from 'byokit/dom';
import {discoverLocal} from 'byokit/dom/local';
import {getModels} from 'byokit/catalog';
const config:PickerConfig={
  preset:Preset.Global,
  providerIds:exact(ProviderId.DeepSeek),
  filters:{
    speciality:exact(Speciality.General),
    tier:any(Tier.Flagship, Tier.Workhorse),
    input:exact(Modality.Image),
    requiredFeatures:any(FeatureName.FunctionCalling),
    deployment:exact(Deployment.Hosted),
    includeTags:any(customTag('usecase:summarization'))
  },
  unknownPolicy:UnknownPolicy.Exclude
};
declare const catalog:Catalog;
checkFit(catalog.get('test/model'),{inputTokens:1000});
mountByok(document.createElement('div'),{catalog,config,locale:Locale.English,onSave:selection=>{console.log(selection.credentialRef)}});
discoverLocal('http://127.0.0.1:11434',{runtime:LocalRuntime.Ollama});
getModels({limit:10,filters:{verified:true,verifiedBy:githubContributor('example')}});
getModels({providerIds:exact(customProviderId('my-provider'))});
getModels({providerIds:[ProviderId.DeepSeek]});
// @ts-expect-error fixed choices require enum members, not raw strings
getModels({preset:'china'});
// Catalog provider IDs are extensible; unknown IDs are validated at runtime.
getModels({providerIds:exact('fireworks-ai'),filters:{callable:false}});
getModels({filters:{requiredFeatures:[FeatureName.FunctionCalling]}});
// @ts-expect-error even a correctly spelled raw feature is rejected
getModels({filters:{requiredFeatures:exact('functionCalling')}});
// @ts-expect-error modality typo
getModels({filters:{input:exact('imag')}});
// @ts-expect-error named constants must exist
const bad=FeatureName.FunctionCallling;

import {ProviderId as CatalogProviderId} from 'byokit/catalog';
getModels({providerIds:exact(CatalogProviderId.DeepSeek)});

import * as byokit from 'byokit/catalog';
byokit.getModels({providerIds:byokit.exact(byokit.ProviderId.DeepSeek)});

byokit.getModels({preset:byokit.Preset.Global,filters:{verifiedBy:byokit.githubContributor('example')}});

byokit.getModels({filters:{excludeTags:byokit.any(byokit.Tag.PricePremium),lifecycle:byokit.any(byokit.Lifecycle.Live),popularity:byokit.any(byokit.Popularity.Popular)}});
byokit.getModels({filters:{includeTags:byokit.any(byokit.Tag.ModelFlash, byokit.Tag.Flash)}});
// @ts-expect-error lifecycle values require enums
byokit.getModels({filters:{lifecycle:byokit.any('LIVE')}});
// @ts-expect-error unknown popularity label
byokit.getModels({filters:{popularity:byokit.any('famous')}});
const lifecycle:byokit.Lifecycle=byokit.getModels()[0].lifecycle.status;

byokit.getModels();
byokit.getModels(byokit.COMPLETE);
byokit.getModels(byokit.CHINA,{local:false});
byokit.getModels(byokit.OFFICIAL);
byokit.getModels(byokit.OFFICIAL_FLAGSHIP);
byokit.getModels({filters:{official:true}});
byokit.getModels({local:[{endpoint:'http://localhost:8000/v1',api:byokit.LocalApi.OpenAI,modelId:'my-model'}]});
const byProv: Record<string, byokit.ModelOption[]> = byokit.getModelsByProvider();
const deepseekModels: byokit.ModelOption[] | undefined = byProv['deepseek'];
// @ts-expect-error shortcuts are enum values, not raw strings
byokit.getModels('complete');
// @ts-expect-error unknown local protocol
byokit.getModels({local:[{endpoint:'http://localhost:8000',api:'vllm'}]});

import * as calls from 'byokit/catalog';
const chosen = calls.getModels({providerIds:calls.exact(calls.ProviderId.DeepSeek)})[0];
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

const sortedModels=byokit.getModels({sort:byokit.ModelSort.SpeedDescend,limit:1});
byokit.appendModel(sortedModels,{providerId:byokit.customProviderId('acme'),modelId:'custom',baseUrl:'https://example.com/v1',protocol:byokit.ApiProtocol.OpenAI});
// @ts-expect-error raw sort string is not the enum
byokit.getModels({sort:'speed'});

const branded=new calls.Byokit({runtimeChecks:true,timeoutMs:90000});
branded.chat.completions.create({model:chosen,messages:[{role:calls.Role.User,content:'Hi'}]},{apiKey:'key',runtimeChecks:false});
branded.messages.create({model:chosen,messages:[{role:calls.Role.User,content:'Hi'}]},{apiKey:'key'});
// @ts-expect-error client defaults must never accept credentials
new calls.Byokit({apiKey:'key'});
// @ts-expect-error exact offering metadata is required, not a bare model string
branded.chat.completions.create({model:'a-model',messages:[]},{apiKey:'key'});
// @ts-expect-error a model must be supplied on every request
branded.chat.completions.create({messages:[]},{apiKey:'key'});
// @ts-expect-error streaming is not yet supported
branded.messages.create({model:chosen,messages:[],stream:true},{apiKey:'key'});
// @ts-expect-error keys are per-request strings, not client-owned accessors
branded.chat.completions.create({model:chosen,messages:[]},{apiKey:()=> 'key'});

const standard=new calls.OpenAI({baseURL:'https://openrouter.ai/api/v1',apiKey:'key',defaultHeaders:{'HTTP-Referer':'https://app.example'}});
standard.chat.completions.create({model:'provider/model',messages:[{role:calls.Role.User,content:'Hi'}]},{runtimeChecks:false});
new calls.Anthropic({baseURL:'https://claude.example',apiKey:'key'}).messages.create({model:'model-id',max_tokens:1024,messages:[{role:calls.Role.User,content:'Hi'}]});
// @ts-expect-error constructor key is required for standard clients
new calls.OpenAI({baseURL:'https://example.com/v1'});
// @ts-expect-error standard clients require a string model ID
standard.chat.completions.create({model:chosen,messages:[]});
// @ts-expect-error standard clients require a model on each request
standard.chat.completions.create({messages:[]});
// @ts-expect-error request options cannot change the client account
standard.chat.completions.create({model:'test',messages:[]},{apiKey:'other'});

getModels({filters:{releaseChannel:['stable','unknown'],output:{or:[{exact:[Modality.Text]},{exact:[Modality.Image]}]}}});
// @ts-expect-error invalid release channel
getModels({filters:{releaseChannel:['banana']}});
