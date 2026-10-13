import { Lifecycle,Popularity,PopularityMetric,Tag,Severity,DiagnosticCode,ProviderId, Preset, Country, Deployment, AuthRequirement, Modality, FileFormat, FeatureName, FeatureStatus, CommercialUse, Architecture, ContextAccounting, UnknownPolicy, FitStatus, Certainty, Currency, ModelStatus, VerificationResult, VerificationStatus, VerificationCheck, LocalRuntime, Locale, SetupStatus, SetupEventType } from './enums.js';
export * from './enums.js';
export interface Evidence { source: string; reviewedAt?: string; }
export interface Feature extends Partial<Evidence> { status: FeatureStatus; details?: Record<string,unknown>; }
export interface Asset { id: string; light: string; dark?: string; source: string; licenseNotice?: string; attribution?: string; }
export interface Provider { id:ProviderId|CustomProviderId; name:string; docsUrl?:string; origin?:Country|CustomCountryCode; auth:AuthRequirement; deployment:Deployment; logoId?:string; tags?:string[]; }
export interface Model { id:string; name:string; familyId?:string; origin?:Country|CustomCountryCode; openWeights:boolean|null; commercialUse:CommercialUse; license:string|null; size?:{totalParameters:number|null;activeParameters:number|null;architecture:Architecture}; tags:string[]; }
export interface Offering { id:string; providerId:ProviderId|CustomProviderId; modelId:string; apiModelId:string; name:string; deployment:Deployment; rank?:number; status?:ModelStatus; lifecycleEvidence?:LifecycleEvidence;popularityEvidence?:PopularityEvidence;lifecycle?:{status:Lifecycle;evidence:LifecycleEvidence|null};popularity?:{status:Popularity;evidence:PopularityEvidence|null}; fileFormats?:(FileFormat|CustomFileFormat)[];hosting?:{region:string|null;eligibility:string};speed?:{timeToFirstTokenMs:number|null;tokensPerSecond:number|null;source:string|null}; modalities:{input:Modality[]|null;output:Modality[]|null}; limits:{context:number|null;input:number|null;output:number|null;contextAccounting:ContextAccounting}; features:Partial<Record<FeatureName,Feature>>; price:{currency:Currency;input:number|null;output:number|null;cacheRead?:number|null;cacheWrite?:number|null;tiers?:unknown[]}; tags:string[]; provenance?:Evidence; artifact?:{quantization?:string;fileBytes?:number;digest?:string;format?:string}; }
export interface CatalogData { schemaVersion:1; providers:Provider[]; models:Model[]; families:{id:string;name:string;logoId?:string}[]; offerings:Offering[]; presets:{id:string;providerIds:string[]}[]; verifications?:VerificationRecord[];assets?:Asset[]; provenance?:Evidence; }
export interface PickerConfig { limit?:number;asOf?:string;preset?:Preset; providerIds?:(ProviderId|CustomProviderId)[]; unknownPolicy?:UnknownPolicy; filters?:{deployment?:Offering['deployment'][];origin?:(Country|CustomCountryCode)[];openWeights?:boolean;commercialUse?:Model['commercialUse'];input?:Modality[];output?:Modality[];requiredFeatures?:FeatureName[];minContextTokens?:number;maxInputPricePerM?:number;maxOutputPricePerM?:number;maxParameters?:number;fileFormats?:(FileFormat|CustomFileFormat)[];maxTimeToFirstTokenMs?:number;minTokensPerSecond?:number;includeTags?:(Tag|CustomTag)[];excludeTags?:(Tag|CustomTag)[];lifecycle?:Lifecycle[];popularity?:Popularity[];includeDeprecated?:boolean;verified?:boolean;verifiedBy?:ContributorId;verifiedWithinDays?:number};prefer?:{features?:FeatureName[];lowerCost?:boolean};ui?:{maxProviders?:number;maxModelsPerProvider?:number;allowCustomModel?:boolean};budget?:{maxInputTokens?:number;maxOutputTokens?:number;overheadTokens?:number}; }
export interface Selection { providerId:ProviderId|CustomProviderId; offeringId?:string; modelId:string; credentialRef?:string; endpoint?:string; }
export interface Diagnostic { code:DiagnosticCode; message:string; severity:Severity; offeringId?:string; }
export interface FitResult { status:FitStatus;certainty:Certainty;inputTokens?:number;outputTokens?:number;ratio?:number;diagnostics:Diagnostic[]; }
export interface Budget { inputTokens?:number;outputTokens?:number;overheadTokens?:number; }
export interface FitOptions { requiredFeatures?:FeatureName[];modalities?:{input?:Modality[];output?:Modality[]};estimate?:boolean;certainty?:FitResult['certainty']; }
export interface Task { offeringIds:string[];budget?:PickerConfig['budget'];requires?:{features?:FeatureName[];modalities?:FitOptions['modalities']}; }
export class Catalog { constructor(data:CatalogData);data:CatalogData;providers:Map<string,Provider>;models:Map<string,Model>;offerings:Map<string,Offering>;get(id:string|undefined):Offering|undefined;getModels(config?:PickerConfig):ModelOption[];select(config?:PickerConfig):{provider:Provider;offerings:Offering[]}[]; }
export function validateCatalog(data:unknown):string[];
export function validateConfig(config?:PickerConfig):string[];
export function checkFit(offering:Offering|undefined,budget:Budget,options?:FitOptions):FitResult;
export function checkTask(catalog:Catalog,task:Task):Diagnostic[];
export function preflight(offering:Offering,messages:unknown[],options?:FitOptions & {outputTokens?:number;overheadTokens?:number;countTokens?:(messages:unknown[],offering:Offering)=>Promise<{tokens:number;certainty:Certainty.Measured|Certainty.Estimated}>}):Promise<FitResult>;
export function estimatePrice(offering:Offering,budget:{inputTokens:number;outputTokens:number}):{status:FitStatus.Unknown}|{status:Certainty.Estimated;currency:Currency.USD;amount:number;excludes:string[]};
export interface CredentialStore { get(ref:string):Promise<string|undefined>;set(ref:string,secret:string):Promise<void>;delete(ref:string):Promise<void>; }
export function createMemoryCredentialStore():CredentialStore;
export function resolveSelection(catalog:Catalog,selection:Selection):{selection:Selection;offering:Offering|undefined;diagnostics:Diagnostic[]};
export interface SetupState { selection:Selection;status:SetupStatus;requestId?:string;error?:string; }
export type SetupEvent = {type:SetupEventType.Edit;selection:Selection}|{type:SetupEventType.Checking;requestId:string}|{type:SetupEventType.Result;requestId:string;ok:boolean;error?:string};
export function reduceSetup(state:SetupState,event:SetupEvent):SetupState;

export function deriveTags(offering:Offering,model?:Partial<Model>):string[];

export interface VerificationRecord {id:string;offeringId:string;contributor:ContributorId;checkedAt:string;result:VerificationResult;checks:VerificationCheck[];evidence:string;adapter:string;notes?:string;}
export interface VerificationSummary {status:VerificationStatus;latest:VerificationRecord|null;records:VerificationRecord[];}
export interface ModelOption extends Offering {lifecycle:{status:Lifecycle;evidence:LifecycleEvidence|null};popularity:{status:Popularity;evidence:PopularityEvidence|null};provider:Provider;model:Model;family:{id:string;name:string;logoId?:string}|null;logos:{provider:Asset|null;family:Asset|null};verification:VerificationSummary;}
export function validateVerifications(records:unknown,data:CatalogData):string[];
export function verificationSummary(data:CatalogData,offeringId:string,options?:{asOf?:string;maxAgeDays?:number;contributor?:ContributorId}):VerificationSummary;

declare const customBrand:unique symbol;
export type CustomProviderId=string & {readonly [customBrand]:'provider'};
export type CustomCountryCode=string & {readonly [customBrand]:'country'};
export type CustomFileFormat=string & {readonly [customBrand]:'format'};
export type CustomTag=string & {readonly [customBrand]:'tag'};
export type ContributorId=string & {readonly [customBrand]:'contributor'};
export function customProviderId(value:string):CustomProviderId;
export function customCountryCode(value:string):CustomCountryCode;
export function customFileFormat(value:string):CustomFileFormat;
export function customTag(value:string):CustomTag;
export function githubContributor(handle:string):ContributorId;

export interface LifecycleEvidence {status:Lifecycle;source:string;checkedAt:string;}
export interface PopularityEvidence {metric:PopularityMetric;rank:number;population:number;scope:string;source:string;windowStart:string;windowEnd:string;}
