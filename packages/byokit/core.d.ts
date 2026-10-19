import {
  ModelSort,
  ModelList,
  LocalApi,
  LifecycleBasis,
  Lifecycle,
  Popularity,
  PopularityMetric,
  Tag,
  Severity,
  DiagnosticCode,
  ProviderId,
  Preset,
  Country,
  Deployment,
  AuthRequirement,
  Modality,
  FileFormat,
  FeatureName,
  FeatureStatus,
  CommercialUse,
  Architecture,
  ContextAccounting,
  UnknownPolicy,
  FitStatus,
  Certainty,
  Currency,
  ModelStatus,
  VerificationResult,
  CommunityVerificationStatus,
  VerificationStatus,
  VerificationCheck,
  LocalRuntime,
  Locale,
  SetupStatus,
  SetupEventType,
  Speciality,
  Tier,
  ModelTier,
} from './enums.js';
export * from './enums.js';
export interface Evidence {
  source: string;
  reviewedAt?: string;
}
export interface Feature extends Partial<Evidence> {
  status: FeatureStatus;
  details?: Record<string, unknown>;
}
export interface Asset {
  id: string;
  light: string;
  dark?: string;
  source: string;
  licenseNotice?: string;
  attribution?: string;
}
export interface Provider {
  id: ProviderId | CustomProviderId | (string & {});
  name: string;
  docsUrl?: string;
  origin?: Country | CustomCountryCode;
  auth: AuthRequirement;
  deployment: Deployment;
  logoId?: string;
  tags?: string[];
}
export interface Model {
  id: string;
  name: string;
  familyId?: string;
  type?: string;
  releaseChannel?: ReleaseChannel;
  releaseDate?: string | null;
  lastUpdated?: string | null;
  origin?: Country | CustomCountryCode;
  openWeights: boolean | null;
  commercialUse: CommercialUse;
  license: string | null;
  size?: {
    totalParameters: number | null;
    activeParameters: number | null;
    architecture: Architecture;
  };
  speciality: Speciality;
  tier: Tier;
  tags: string[];
}
export interface Offering {
  connection?: Connection;
  id: string;
  providerId: ProviderId | CustomProviderId | (string & {});
  modelId: string;
  apiModelId: string;
  name: string;
  releaseDate?: string | null;
  lastUpdated?: string | null;
  type?: string;
  releaseChannel?: ReleaseChannel;
  speciality: Speciality;
  tier: Tier;
  providerShape?: 'responses' | 'completions';
  requiresProviderOverride?: boolean;
  callSupport?: { textGeneration: boolean; reason: string | null };
  listingEvidence?: { source: string; checkedAt: string };
  deployment: Deployment;
  rank?: number;
  local?: { endpoint: string; api: LocalApi; configured: boolean };
  status?: ModelStatus;
  lifecycleEvidence?: LifecycleEvidence;
  popularityEvidence?: PopularityEvidence;
  lifecycle?: { status: Lifecycle; evidence: LifecycleEvidence | null };
  popularity?: { status: Popularity; evidence: PopularityEvidence | null };
  fileFormats?: (FileFormat | CustomFileFormat)[];
  hosting?: { region: string | null; eligibility: string };
  speed?: {
    timeToFirstTokenMs: number | null;
    tokensPerSecond: number | null;
    source: string | null;
  };
  modalities: { input: Modality[] | null; output: Modality[] | null };
  limits: {
    context: number | null;
    input: number | null;
    output: number | null;
    contextAccounting: ContextAccounting;
  };
  features: Partial<Record<FeatureName, Feature>>;
  price: {
    currency: Currency;
    unit?: 'per-million-tokens';
    reasoning?: number | null;
    inputAudio?: number | null;
    outputAudio?: number | null;
    input: number | null;
    output: number | null;
    cacheRead?: number | null;
    cacheWrite?: number | null;
    tiers?: unknown[];
  };
  tags: string[];
  provenance?: Evidence;
  artifact?: { quantization?: string; fileBytes?: number; digest?: string; format?: string };
}
export interface CatalogData {
  schemaVersion: 1;
  providers: Provider[];
  models: Model[];
  families: { id: string; name: string; logoId?: string }[];
  offerings: Offering[];
  presets: { id: string; providerIds: string[]; offeringIds?: string[] }[];
  recommendations?: {
    offeringId: string;
    reviewedAt: string;
    source: string;
    rationale: string;
    default?: boolean;
  }[];
  verifications?: VerificationRecord[];
  assets?: Asset[];
  provenance?: Evidence;
}
export interface LocalEndpoint {
  endpoint: string;
  api?: LocalApi;
  modelId?: string;
  name?: string;
}
export type SetMatcherMode = 'exact' | 'contain' | 'contains' | 'any' | 'exclude';
export type BooleanOperator = 'and' | 'or' | 'xor' | 'not';

export interface SetMatcher<T = any> {
  mode: SetMatcherMode;
  values: (T | ListFilter<T>)[];
}

export interface BooleanMatcher<T = any> {
  op: BooleanOperator;
  values: ListFilter<T>[];
}

export type ShorthandMatcher<T = any> =
  | { exact: (T | ListFilter<T>)[] | T | ListFilter<T> }
  | { contain: (T | ListFilter<T>)[] | T | ListFilter<T> }
  | { contains: (T | ListFilter<T>)[] | T | ListFilter<T> }
  | { any: (T | ListFilter<T>)[] | T | ListFilter<T> }
  | { exclude: (T | ListFilter<T>)[] | T | ListFilter<T> }
  | { and: ListFilter<T>[] | ListFilter<T> }
  | { or: ListFilter<T>[] | ListFilter<T> }
  | { xor: ListFilter<T>[] | ListFilter<T> }
  | { not: ListFilter<T>[] | ListFilter<T> };

export type ListFilter<T = any> = T | T[] | SetMatcher<T> | BooleanMatcher<T> | ShorthandMatcher<T>;

export type ModalityMatcherMode = SetMatcherMode;
export type ModalityMatcher = SetMatcher<Modality>;
export type ModalityShorthandMatcher = ShorthandMatcher<Modality>;
export type ModalityFilter = ListFilter<Modality>;

export type ReleaseChannel = 'stable' | 'preview' | 'experimental' | 'unknown';

export interface PickerConfig {
  sort?: ModelSort;
  list?: ModelList;
  local?: false | LocalEndpoint[];
  limit?: number;
  asOf?: string;
  preset?: Preset;
  providerIds?: ListFilter<ProviderId | CustomProviderId | (string & {})>;
  unknownPolicy?: UnknownPolicy;
  includePreviews?: boolean;
  dedupe?: number | boolean;
  filters?: {
    releaseChannel?: ListFilter<ReleaseChannel>;
    speciality?: ListFilter<Speciality>;
    tier?: ListFilter<Tier>;
    deployment?: ListFilter<Offering['deployment']>;
    origin?: ListFilter<Country | CustomCountryCode>;
    openWeights?: boolean;
    commercialUse?: Model['commercialUse'];
    input?: ListFilter<Modality>;
    output?: ListFilter<Modality>;
    requiredFeatures?: ListFilter<FeatureName>;
    minContextTokens?: number;
    maxInputPricePerM?: number;
    maxOutputPricePerM?: number;
    maxParameters?: number;
    fileFormats?: ListFilter<FileFormat | CustomFileFormat>;
    maxTimeToFirstTokenMs?: number;
    minTokensPerSecond?: number;
    includeTags?: ListFilter<Tag | CustomTag>;
    excludeTags?: ListFilter<Tag | CustomTag>;
    lifecycle?: ListFilter<Lifecycle>;
    popularity?: ListFilter<Popularity>;
    includeDeprecated?: boolean;
    includePreviews?: boolean;
    callable?: boolean;
    verified?:
      boolean | CommunityVerificationStatus | 'verified' | 'unverified' | 'verified to be failure';
    verifiedBy?: ContributorId;
    verifiedWithinDays?: number;
    official?: boolean;
    releasedWithin?: '1m' | '3m' | '6m' | '1y' | '2y' | Tag | (string & {}) | number;
    dedupe?: number | boolean;
  };
  prefer?: { features?: FeatureName[]; lowerCost?: boolean };
  ui?: { maxProviders?: number; maxModelsPerProvider?: number; allowCustomModel?: boolean };
  budget?: { maxInputTokens?: number; maxOutputTokens?: number; overheadTokens?: number };
}
export interface Selection {
  providerId: ProviderId | CustomProviderId | (string & {});
  offeringId?: string;
  modelId: string;
  credentialRef?: string;
  endpoint?: string;
  api?: LocalApi;
}
export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  severity: Severity;
  offeringId?: string;
}
export interface FitResult {
  status: FitStatus;
  certainty: Certainty;
  inputTokens?: number;
  outputTokens?: number;
  ratio?: number;
  diagnostics: Diagnostic[];
}
export interface Budget {
  inputTokens?: number;
  outputTokens?: number;
  overheadTokens?: number;
}
export interface FitOptions {
  requiredFeatures?: FeatureName[];
  modalities?: { input?: ModalityFilter; output?: ModalityFilter };
  estimate?: boolean;
  certainty?: FitResult['certainty'];
}
export interface Task {
  offeringIds: string[];
  budget?: PickerConfig['budget'];
  requires?: { features?: FeatureName[]; modalities?: FitOptions['modalities'] };
}
export interface CatalogOptions {
  trusted?: boolean;
}
export class Catalog {
  constructor(data: CatalogData, options?: CatalogOptions);
  data: CatalogData;
  providers: Map<string, Provider>;
  models: Map<string, Model>;
  offerings: Map<string, Offering>;
  get(id: string | undefined): Offering | undefined;
  getModels(config?: PickerConfig): ModelOption[];
  getModels(list: ModelList, config?: PickerConfig): ModelOption[];
  getModelsByProvider(config?: PickerConfig): Record<string, ModelOption[]>;
  getModelsByProvider(list: ModelList, config?: PickerConfig): Record<string, ModelOption[]>;
  serializeQuery(input?: PickerConfig | ModelList, options?: PickerConfig): string;
  getConfig(config?: PickerConfig): PickerConfig;
  getConfig(list: ModelList, config?: PickerConfig): PickerConfig;
  getConfigJson(config?: PickerConfig, indent?: number): string;
  getConfigJson(list: ModelList, config?: PickerConfig, indent?: number): string;
  toConfig(config?: PickerConfig): PickerConfig;
  toConfig(list: ModelList, config?: PickerConfig): PickerConfig;
  toConfigJson(config?: PickerConfig, indent?: number): string;
  toConfigJson(list: ModelList, config?: PickerConfig, indent?: number): string;
  hasCached(input?: PickerConfig | ModelList, options?: PickerConfig): boolean;
  getCached(input?: PickerConfig | ModelList, options?: PickerConfig): ModelOption[] | undefined;
  clearCache(): void;
  addVerifications(records: VerificationRecord[]): void;
  select(list: ModelList, config?: PickerConfig): { provider: Provider; offerings: Offering[] }[];
  select(config?: PickerConfig): { provider: Provider; offerings: Offering[] }[];
}
export function exact<T>(...args: (T | ListFilter<T> | (T | ListFilter<T>)[])[]): SetMatcher<T>;
export function contain<T>(...args: (T | ListFilter<T> | (T | ListFilter<T>)[])[]): SetMatcher<T>;
export const contains: typeof contain;
export function any<T>(...args: (T | ListFilter<T> | (T | ListFilter<T>)[])[]): SetMatcher<T>;
export function exclude<T>(...args: (T | ListFilter<T> | (T | ListFilter<T>)[])[]): SetMatcher<T>;
export function and<T>(...args: (T | ListFilter<T> | (T | ListFilter<T>)[])[]): BooleanMatcher<T>;
export function or<T>(...args: (T | ListFilter<T> | (T | ListFilter<T>)[])[]): BooleanMatcher<T>;
export function xor<T>(...args: (T | ListFilter<T> | (T | ListFilter<T>)[])[]): BooleanMatcher<T>;
export function not<T>(...args: (T | ListFilter<T> | (T | ListFilter<T>)[])[]): BooleanMatcher<T>;
export const Exact: typeof exact;
export const Contain: typeof contain;
export const Contains: typeof contain;
export const Any: typeof any;
export const Exclude: typeof exclude;
export const And: typeof and;
export const AND: typeof and;
export const Or: typeof or;
export const OR: typeof or;
export const Xor: typeof xor;
export const XOR: typeof xor;
export const Not: typeof not;
export const NOT: typeof not;
export function getReleaseChannel(offering: Partial<Offering>): ReleaseChannel;
export function getModelSpeciality(offering?: Offering | null, model?: Model | null): Speciality;
export function getModelTier(offering?: Offering | null, model?: Model | null): Tier;
export function normalizeModalityFilter(
  value: ModalityFilter | undefined | null,
  defaultMode?: ModalityMatcherMode,
): SetMatcher<Modality> | BooleanMatcher<Modality> | null;
export function matchesModality(
  modelValues: string[] | null | undefined,
  filterSpec: SetMatcher<Modality> | BooleanMatcher<Modality> | null | undefined,
  allowUnknown?: boolean,
): boolean;
export function validateCatalog(data: unknown): string[];
export function validateConfig(config?: PickerConfig): string[];
export function checkFit(
  offering: Offering | undefined,
  budget: Budget,
  options?: FitOptions,
): FitResult;
export function checkTask(catalog: Catalog, task: Task): Diagnostic[];
export function preflight(
  offering: Offering,
  messages: unknown[],
  options?: FitOptions & {
    outputTokens?: number;
    overheadTokens?: number;
    countTokens?: (
      messages: unknown[],
      offering: Offering,
    ) => Promise<{ tokens: number; certainty: Certainty.Measured | Certainty.Estimated }>;
  },
): Promise<FitResult>;
export function estimatePrice(
  offering: Offering,
  budget: { inputTokens: number; outputTokens: number },
):
  | { status: FitStatus.Unknown }
  | { status: Certainty.Estimated; currency: Currency.USD; amount: number; excludes: string[] };
export interface CredentialStore {
  get(ref: string): Promise<string | undefined>;
  set(ref: string, secret: string): Promise<void>;
  delete(ref: string): Promise<void>;
}
export function createMemoryCredentialStore(): CredentialStore;
export function resolveSelection(
  catalog: Catalog,
  selection: Selection,
): { selection: Selection; offering: Offering | undefined; diagnostics: Diagnostic[] };
export interface SetupState {
  selection: Selection;
  status: SetupStatus;
  requestId?: string;
  error?: string;
}
export type SetupEvent =
  | { type: SetupEventType.Edit; selection: Selection }
  | { type: SetupEventType.Checking; requestId: string }
  | { type: SetupEventType.Result; requestId: string; ok: boolean; error?: string };
export function reduceSetup(state: SetupState, event: SetupEvent): SetupState;

export function deriveTags(offering: Offering, model?: Partial<Model>): string[];
export function isFlashModel(offering?: Partial<Offering>, model?: Partial<Model>): boolean;
export function isOfficialOffering(
  offering: Offering,
  model?: Partial<Model>,
  providerTags?: string[],
): boolean;

export interface VerificationAttempt {
  outcome: 'succeeded' | 'partial' | 'blocked' | 'inconclusive' | 'canceled' | 'skipped';
  reason:
    | 'invalid_credentials'
    | 'quota_exhausted'
    | 'rate_limited'
    | 'access_denied'
    | 'region_restricted'
    | 'policy_restricted'
    | 'model_not_found_or_inaccessible'
    | 'invalid_request'
    | 'unsupported_operation'
    | 'provider_unavailable'
    | 'network_error'
    | 'timeout'
    | 'invalid_response'
    | 'empty_response'
    | 'unknown'
    | null;
  scope: 'account' | 'model' | 'provider' | 'region' | 'request' | 'client' | 'unknown';
  certainty: 'explicit' | 'inferred' | 'unknown';
  source: 'provider_code' | 'http_status' | 'client_error';
  classifierVersion: '1';
  httpStatus?: number;
  retry: {
    action:
      | 'none'
      | 'check_credentials'
      | 'check_billing'
      | 'retry_later'
      | 'check_limits'
      | 'check_model_access'
      | 'check_supported_locations'
      | 'review_policy'
      | 'check_model_id_and_access'
      | 'check_operation'
      | 'check_settings'
      | 'check_network'
      | 'review_response'
      | 'review_diagnostics';
    afterSeconds: number | null;
  };
}
export interface VerificationAssessment {
  attempt: VerificationAttempt;
  checks: {
    textGeneration: 'passed' | 'blocked' | 'inconclusive' | 'not_run';
    speed: 'passed' | 'blocked' | 'inconclusive' | 'not_run';
  };
  phases?: Array<{ phase: 'baseline' | 'generation'; attempt: VerificationAttempt }>;
}
export interface CommunityAssessment {
  status: 'verified' | 'issues_reported' | 'unverified' | 'stale';
  lastSuccessAt: string | null;
  successfulContributors: number;
  recentIssues: Partial<Record<NonNullable<VerificationAttempt['reason']>, number>>;
  issueWindowDays: 7;
  latest: VerificationRecord | null;
  latestSuccess: VerificationRecord | null;
}
export function classifyVerificationError(
  error?: { code?: string; status?: number; attempt?: VerificationAttempt },
  options?: { body?: unknown; retryAfter?: string; now?: number },
): VerificationAttempt;

export interface VerificationRecord {
  id: string;
  offeringId: string;
  contributor: ContributorId;
  checkedAt: string;
  result: VerificationResult;
  assessment?: VerificationAssessment;
  tokensPerSecond?: number;
  timeToFirstTokenMs?: number;
  checks: VerificationCheck[];
  evidence: string;
  adapter: string;
  notes?: string;
}
export interface VerificationSummary {
  community: CommunityAssessment;
  status: VerificationStatus;
  communityStatus?:
    CommunityVerificationStatus | 'verified' | 'unverified' | 'verified to be failure';
  latest: VerificationRecord | null;
  records: VerificationRecord[];
}
export interface ModelOption extends Offering {
  connection: Connection | null;
  lifecycle: { status: Lifecycle; evidence: LifecycleEvidence | null };
  popularity: { status: Popularity; evidence: PopularityEvidence | null };
  provider: Provider;
  model: Model;
  family: { id: string; name: string; logoId?: string } | null;
  logos: { provider: Asset | null; family: Asset | null };
  verification: VerificationSummary;
}
export function validateVerifications(records: unknown, data: CatalogData): string[];
export function verificationSummary(
  data: CatalogData,
  offeringId: string,
  options?: { asOf?: string; maxAgeDays?: number; contributor?: ContributorId },
): VerificationSummary;

declare const customBrand: unique symbol;
export type CustomProviderId = string & { readonly [customBrand]: 'provider' };
export type CustomCountryCode = string & { readonly [customBrand]: 'country' };
export type CustomFileFormat = string & { readonly [customBrand]: 'format' };
export type CustomTag = string & { readonly [customBrand]: 'tag' };
export type ContributorId = string & { readonly [customBrand]: 'contributor' };
export function customProviderId(value: string): CustomProviderId;
export function customCountryCode(value: string): CustomCountryCode;
export function customFileFormat(value: string): CustomFileFormat;
export function customTag(value: string): CustomTag;
export function githubContributor(handle: string): ContributorId;

export interface LifecycleEvidence {
  status: Lifecycle;
  source: string;
  checkedAt: string;
  basis?: LifecycleBasis;
}
export interface PopularityEvidence {
  metric: PopularityMetric;
  rank: number;
  population: number;
  scope: string;
  source: string;
  windowStart: string;
  windowEnd: string;
}

export interface Connection {
  baseUrl: string;
  protocol: import('./enums.js').ApiProtocol;
}
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface FunctionTool {
  type: 'function';
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}
export interface TextBlock {
  type: 'text';
  text: string;
}
export interface ChatMessage {
  role: import('./enums.js').Role;
  content: string | TextBlock[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export interface ChatInput {
  messages: ChatMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  tools?: FunctionTool[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  stream?: false;
}
export interface ClaudeToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ClaudeToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string | TextBlock[];
}
export interface ClaudeInput {
  messages: {
    role: import('./enums.js').Role.User | import('./enums.js').Role.Assistant;
    content: string | (TextBlock | ClaudeToolUse | ClaudeToolResult)[];
  }[];
  system?: string | TextBlock[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  tools?: { name: string; description?: string; input_schema: Record<string, unknown> }[];
  tool_choice?: { type: 'auto' | 'any' | 'none' } | { type: 'tool'; name: string };
  stream?: false;
}
export interface CallOptions {
  headers?: Record<string, string>;
  checkBudget?: boolean;
  runtimeChecks?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  inputTokens?: number;
  overheadTokens?: number;
  onWarning?: (diagnostic: Diagnostic) => void;
  fetch?: typeof globalThis.fetch;
}
export interface ChatResult {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] };
    finish_reason: string;
  }[];
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}
export interface ClaudeResult {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: (TextBlock | ClaudeToolUse)[];
  stop_reason:
    | 'end_turn'
    | 'max_tokens'
    | 'tool_use'
    | 'stop_sequence'
    | 'refusal'
    | 'pause_turn'
    | 'model_context_window_exceeded';
  stop_sequence: string | null;
  usage: { input_tokens?: number; output_tokens?: number };
}
export class CallError extends Error {
  code: string;
  diagnostics: Diagnostic[];
  status?: number;
  attempt: VerificationAttempt;
  assessment?: VerificationAssessment;
}
export class NotImplementedError extends Error {}
export function call(
  model: ModelOption,
  input: string | ChatInput,
  key: string,
  options?: CallOptions,
): Promise<ChatResult>;
export function callClaude(
  model: ModelOption,
  input: string | ClaudeInput,
  key: string,
  options?: CallOptions,
): Promise<ClaudeResult>;
export function prepareCall(
  model: ModelOption,
  input: string | ChatInput | ClaudeInput,
  options?: Pick<
    CallOptions,
    'checkBudget' | 'runtimeChecks' | 'inputTokens' | 'overheadTokens'
  > & {
    format?: 'openai' | 'claude';
  },
): {
  url: string;
  protocol: import('./enums.js').ApiProtocol;
  body: Record<string, unknown>;
  diagnostics: Diagnostic[];
};

/** @deprecated Legacy bound-model callback constructor. */
export interface SDKClientOptions extends CallOptions {
  model: ModelOption;
  apiKey?: () => string | Promise<string>;
}
export interface CompletionInput extends ChatInput {
  model?: string;
}
export interface MessageInput extends ClaudeInput {
  model?: string;
}
export interface OpenAIClient {
  chat: {
    completions: { create(input: CompletionInput, options?: CallOptions): Promise<ChatResult> };
  };
}
export interface ClaudeClient {
  messages: { create(input: MessageInput, options?: CallOptions): Promise<ClaudeResult> };
}
/** @deprecated Use new OpenAI({baseURL, apiKey}). */
export function openAI(options: SDKClientOptions): OpenAIClient;
/** @deprecated Use new Anthropic({baseURL, apiKey}). */
export function claude(options: SDKClientOptions): ClaudeClient;
export interface StandardClientOptions extends CallOptions {
  apiKey: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  /** Native wire protocol override; defaults to the named client’s protocol. */
  protocol?: import('./enums.js').ApiProtocol;
  /** Optional exact endpoint metadata for model-fit checks. */
  models?: readonly ModelOption[];
}
export interface StandardCompletionInput extends ChatInput {
  model: string;
}
export interface StandardMessageInput extends ClaudeInput {
  model: string;
}
export class OpenAI<
  Options extends StandardClientOptions | SDKClientOptions = StandardClientOptions,
> {
  constructor(options: Options);
  readonly chat: Options extends SDKClientOptions
    ? OpenAIClient['chat']
    : {
        completions: {
          create(input: StandardCompletionInput, options?: CallOptions): Promise<ChatResult>;
        };
      };
}
export class Anthropic<
  Options extends StandardClientOptions | SDKClientOptions = StandardClientOptions,
> {
  constructor(options: Options);
  readonly messages: Options extends SDKClientOptions
    ? ClaudeClient['messages']
    : { create(input: StandardMessageInput, options?: CallOptions): Promise<ClaudeResult> };
}

export interface ClientOptions {
  checkBudget?: boolean;
  runtimeChecks?: boolean;
  timeoutMs?: number;
}
export interface RequestOptions extends CallOptions {
  apiKey?: string;
}
export interface ChatRequest extends ChatInput {
  model: ModelOption;
}
export interface MessageRequest extends ClaudeInput {
  model: ModelOption;
}
/** @deprecated Use OpenAI or Anthropic with constructor credentials. */
export class Byokit {
  constructor(options?: ClientOptions);
  readonly chat: {
    readonly completions: {
      readonly create: (input: ChatRequest, options?: RequestOptions) => Promise<ChatResult>;
    };
  };
  readonly messages: {
    readonly create: (input: MessageRequest, options?: RequestOptions) => Promise<ClaudeResult>;
  };
}

export interface CustomModel {
  providerId: ProviderId | CustomProviderId | (string & {});
  providerName?: string;
  modelId: string;
  name?: string;
  baseUrl: string;
  protocol: import('./enums.js').ApiProtocol;
  deployment?: Deployment;
  limits?: Partial<Offering['limits']>;
}
/** Append one explicit, unverified model; does not mutate input, query the network, or re-sort. */
export function appendModel(models: readonly ModelOption[], model: CustomModel): ModelOption[];
export function serializeQuery(input?: PickerConfig | ModelList, options?: PickerConfig): string;
export function getConfig(config?: PickerConfig): PickerConfig;
export function getConfig(list: ModelList, config?: PickerConfig): PickerConfig;
export function getConfigJson(config?: PickerConfig, indent?: number): string;
export function getConfigJson(list: ModelList, config?: PickerConfig, indent?: number): string;
export function toConfig(config?: PickerConfig): PickerConfig;
export function toConfig(list: ModelList, config?: PickerConfig): PickerConfig;
export function toConfigJson(config?: PickerConfig, indent?: number): string;
export function toConfigJson(list: ModelList, config?: PickerConfig, indent?: number): string;
export function getReleaseTags(releaseDate: string | undefined | null, asOf?: string): string[];
export function parseReleasedWithinDays(val: unknown): number | undefined;
