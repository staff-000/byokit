export type FeatureStatus = 'supported' | 'unsupported' | 'conditional' | 'unknown';
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'embedding';
export type FeatureName = 'functionCalling' | 'parallelTools' | 'forcedToolChoice' | 'strictToolSchema' | 'promptCaching' | 'jsonMode' | 'jsonSchema' | 'strictJsonSchema' | 'systemMessages' | 'developerMessages' | 'thinking' | 'thinkingDisable' | 'thinkingBudget' | 'thinkingEffort';
export interface Evidence { source: string; reviewedAt?: string; }
export interface Feature extends Partial<Evidence> { status: FeatureStatus; details?: Record<string,unknown>; }
export interface Asset { id: string; light: string; dark?: string; source: string; licenseNotice?: string; attribution?: string; }
export interface Provider { id:string; name:string; docsUrl?:string; origin?:string; auth:'required'|'optional'|'none'; deployment:'hosted'|'local'|'self-hosted'; logoId?:string; tags?:string[]; }
export interface Model { id:string; name:string; familyId?:string; origin?:string; openWeights:boolean|null; commercialUse:'allowed'|'restricted'|'unknown'; license:string|null; size?:{totalParameters:number|null;activeParameters:number|null;architecture:'dense'|'moe'|'unknown'}; tags:string[]; }
export interface Offering { id:string; providerId:string; modelId:string; apiModelId:string; name:string; deployment:'hosted'|'local'|'self-hosted'; rank?:number; status?:string; fileFormats?:string[];hosting?:{region:string|null;eligibility:string};speed?:{timeToFirstTokenMs:number|null;tokensPerSecond:number|null;source:string|null}; modalities:{input:Modality[]|null;output:Modality[]|null}; limits:{context:number|null;input:number|null;output:number|null;contextAccounting:'combined'|'input-only'|'unknown'}; features:Partial<Record<FeatureName,Feature>>; price:{currency:string;input:number|null;output:number|null;cacheRead?:number|null;cacheWrite?:number|null;tiers?:unknown[]}; tags:string[]; provenance?:Evidence; artifact?:{quantization?:string;fileBytes?:number;digest?:string;format?:string}; }
export interface CatalogData { schemaVersion:1; providers:Provider[]; models:Model[]; families:{id:string;name:string;logoId?:string}[]; offerings:Offering[]; presets:{id:string;providerIds:string[]}[]; assets?:Asset[]; provenance?:Evidence; }
export interface PickerConfig { preset?:string; providerIds?:string[]; unknownPolicy?:'include'|'exclude'; filters?:{deployment?:Offering['deployment'][];origin?:string[];openWeights?:boolean;commercialUse?:Model['commercialUse'];input?:Modality[];output?:Modality[];requiredFeatures?:FeatureName[];minContextTokens?:number;maxInputPricePerM?:number;maxOutputPricePerM?:number;maxParameters?:number;fileFormats?:string[];maxTimeToFirstTokenMs?:number;minTokensPerSecond?:number;includeTags?:string[];excludeTags?:string[];includeDeprecated?:boolean};prefer?:{features?:FeatureName[];lowerCost?:boolean};ui?:{maxProviders?:number;maxModelsPerProvider?:number;allowCustomModel?:boolean};budget?:{maxInputTokens?:number;maxOutputTokens?:number;overheadTokens?:number}; }
export interface Selection { providerId:string; offeringId?:string; modelId:string; credentialRef?:string; endpoint?:string; }
export interface Diagnostic { code:string; message:string; severity:'warning'|'error'; offeringId?:string; }
export interface FitResult { status:'fits'|'exceeds'|'unknown';certainty:'declared'|'measured'|'estimated'|'unknown';inputTokens?:number;outputTokens?:number;ratio?:number;diagnostics:Diagnostic[]; }
export interface Budget { inputTokens?:number;outputTokens?:number;overheadTokens?:number; }
export interface FitOptions { requiredFeatures?:FeatureName[];modalities?:{input?:Modality[];output?:Modality[]};estimate?:boolean;certainty?:FitResult['certainty']; }
export interface Task { offeringIds:string[];budget?:PickerConfig['budget'];requires?:{features?:FeatureName[];modalities?:FitOptions['modalities']}; }
export class Catalog { constructor(data:CatalogData);data:CatalogData;providers:Map<string,Provider>;models:Map<string,Model>;offerings:Map<string,Offering>;get(id:string|undefined):Offering|undefined;select(config?:PickerConfig):{provider:Provider;offerings:Offering[]}[]; }
export function validateCatalog(data:unknown):string[];
export function validateConfig(config?:PickerConfig):string[];
export function checkFit(offering:Offering|undefined,budget:Budget,options?:FitOptions):FitResult;
export function checkTask(catalog:Catalog,task:Task):Diagnostic[];
export function preflight(offering:Offering,messages:unknown[],options?:FitOptions & {outputTokens?:number;overheadTokens?:number;countTokens?:(messages:unknown[],offering:Offering)=>Promise<{tokens:number;certainty:'measured'|'estimated'}>}):Promise<FitResult>;
export function estimatePrice(offering:Offering,budget:{inputTokens:number;outputTokens:number}):{status:'unknown'}|{status:'estimated';currency:'USD';amount:number;excludes:string[]};
export interface CredentialStore { get(ref:string):Promise<string|undefined>;set(ref:string,secret:string):Promise<void>;delete(ref:string):Promise<void>; }
export function createMemoryCredentialStore():CredentialStore;
export function resolveSelection(catalog:Catalog,selection:Selection):{selection:Selection;offering:Offering|undefined;diagnostics:Diagnostic[]};
export interface SetupState { selection:Selection;status:'idle'|'checking'|'ready'|'error';requestId?:string;error?:string; }
export type SetupEvent = {type:'edit';selection:Selection}|{type:'checking';requestId:string}|{type:'result';requestId:string;ok:boolean;error?:string};
export function reduceSetup(state:SetupState,event:SetupEvent):SetupState;

export function deriveTags(offering:Offering,model?:Partial<Model>):string[];
