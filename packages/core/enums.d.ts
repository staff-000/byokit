// Generated from spec/enums.json. Run npm run enums:generate.
export declare enum ProviderId {
  OpenAI = "openai",
  Anthropic = "anthropic",
  Google = "google",
  Mistral = "mistral",
  Groq = "groq",
  OpenRouter = "openrouter",
  DeepSeek = "deepseek",
  ZhipuAI = "zhipuai",
  SiliconFlow = "siliconflow",
  Ollama = "ollama",
  Local = "local",
}

export declare enum Preset {
  Global = "global",
  China = "china",
}

export declare enum Country {
  China = "cn",
  UnitedStates = "us",
  France = "fr",
}

export declare enum Deployment {
  Hosted = "hosted",
  Local = "local",
  SelfHosted = "self-hosted",
}

export declare enum AuthRequirement {
  Required = "required",
  Optional = "optional",
  None = "none",
}

export declare enum Modality {
  Text = "text",
  Image = "image",
  Audio = "audio",
  Video = "video",
  Embedding = "embedding",
}

export declare enum FileFormat {
  PDF = "pdf",
  Text = "txt",
  Markdown = "md",
  HTML = "html",
  JSON = "json",
  Docx = "docx",
}

export declare enum FeatureName {
  FunctionCalling = "functionCalling",
  ParallelTools = "parallelTools",
  ForcedToolChoice = "forcedToolChoice",
  StrictToolSchema = "strictToolSchema",
  PromptCaching = "promptCaching",
  JsonMode = "jsonMode",
  JsonSchema = "jsonSchema",
  StrictJsonSchema = "strictJsonSchema",
  SystemMessages = "systemMessages",
  DeveloperMessages = "developerMessages",
  Thinking = "thinking",
  ThinkingDisable = "thinkingDisable",
  ThinkingBudget = "thinkingBudget",
  ThinkingEffort = "thinkingEffort",
}

export declare enum FeatureStatus {
  Supported = "supported",
  Unsupported = "unsupported",
  Conditional = "conditional",
  Unknown = "unknown",
}

export declare enum CommercialUse {
  Allowed = "allowed",
  Restricted = "restricted",
  Unknown = "unknown",
}

export declare enum Architecture {
  Dense = "dense",
  MoE = "moe",
  Unknown = "unknown",
}

export declare enum ContextAccounting {
  Combined = "combined",
  InputOnly = "input-only",
  Unknown = "unknown",
}

export declare enum UnknownPolicy {
  Include = "include",
  Exclude = "exclude",
}

export declare enum FitStatus {
  Fits = "fits",
  Exceeds = "exceeds",
  Unknown = "unknown",
}

export declare enum Certainty {
  Declared = "declared",
  Measured = "measured",
  Estimated = "estimated",
  Unknown = "unknown",
}

export declare enum Currency {
  USD = "USD",
  EUR = "EUR",
  CNY = "CNY",
}

export declare enum ModelStatus {
  Stable = "stable",
  Preview = "preview",
  Alpha = "alpha",
  Beta = "beta",
  Deprecated = "deprecated",
}

export declare enum VerificationResult {
  Passed = "passed",
  Failed = "failed",
}

export declare enum VerificationStatus {
  Unverified = "unverified",
  Passed = "passed",
  Failed = "failed",
  Stale = "stale",
}

export declare enum VerificationCheck {
  TextGeneration = "textGeneration",
  FunctionCalling = "functionCalling",
  ParallelTools = "parallelTools",
  ForcedToolChoice = "forcedToolChoice",
  StrictToolSchema = "strictToolSchema",
  PromptCaching = "promptCaching",
  JsonMode = "jsonMode",
  JsonSchema = "jsonSchema",
  StrictJsonSchema = "strictJsonSchema",
  SystemMessages = "systemMessages",
  DeveloperMessages = "developerMessages",
  Thinking = "thinking",
  ThinkingDisable = "thinkingDisable",
  ThinkingBudget = "thinkingBudget",
  ThinkingEffort = "thinkingEffort",
}

export declare enum LocalRuntime {
  Ollama = "ollama",
  OpenAICompatible = "openai-compatible",
}

export declare enum Locale {
  English = "en",
  Chinese = "zh",
}

export declare enum SetupStatus {
  Idle = "idle",
  Checking = "checking",
  Ready = "ready",
  Error = "error",
}

export declare enum SetupEventType {
  Edit = "edit",
  Checking = "checking",
  Result = "result",
}

export declare enum Severity {
  Warning = "warning",
  Error = "error",
}

export declare enum DiagnosticCode {
  CapabilityUnsupported = "CAPABILITY_UNSUPPORTED",
  CapabilityUnverified = "CAPABILITY_UNVERIFIED",
  ContextBudgetExceeded = "CONTEXT_BUDGET_EXCEEDED",
  ContextNearLimit = "CONTEXT_NEAR_LIMIT",
  ContextUnverified = "CONTEXT_UNVERIFIED",
  InputBudgetExceeded = "INPUT_BUDGET_EXCEEDED",
  LocalContextUnknown = "LOCAL_CONTEXT_UNKNOWN",
  ModalityUnsupported = "MODALITY_UNSUPPORTED",
  ModalityUnverified = "MODALITY_UNVERIFIED",
  ModelDeprecated = "MODEL_DEPRECATED",
  ModelUnverified = "MODEL_UNVERIFIED",
  NoModels = "NO_MODELS",
  OutputBudgetExceeded = "OUTPUT_BUDGET_EXCEEDED",
  OutputLimitUnknown = "OUTPUT_LIMIT_UNKNOWN",
  TokenCountUnknown = "TOKEN_COUNT_UNKNOWN",
  TokenEstimate = "TOKEN_ESTIMATE",
  BUDGET_UNDECLARED = "BUDGET_UNDECLARED",
}

export declare enum Lifecycle {
  Live = "LIVE",
  Outdated = "OUTDATED",
  Uncertain = "UNCERTAIN",
}

export declare enum Popularity {
  Popular = "POPULAR",
  NotPopular = "NOT_POPULAR",
  Uncertain = "UNCERTAIN",
}

export declare enum PopularityMetric {
  Requests = "requests",
  Tokens = "tokens",
  Downloads = "downloads",
}

export declare enum Tag {
  LifecycleLive = "lifecycle:LIVE",
  LifecycleOutdated = "lifecycle:OUTDATED",
  LifecycleUncertain = "lifecycle:UNCERTAIN",
  PopularityPopular = "popularity:POPULAR",
  PopularityNotPopular = "popularity:NOT_POPULAR",
  PopularityUncertain = "popularity:UNCERTAIN",
  PricePremium = "price:premium",
  WeightsOpen = "weights:open",
  OriginChina = "origin:cn",
}

export declare enum ModelList {
  Default = "default",
  Complete = "complete",
  China = "china",
  Global = "global",
}

export declare enum LocalApi {
  OpenAI = "openai-compatible",
  Ollama = "ollama",
}

export declare enum LifecycleBasis {
  Provider = "provider",
  CatalogListing = "catalog-listing",
}

export declare enum ApiProtocol {
  OpenAI = "openai-compatible",
  Claude = "claude",
  Gemini = "gemini",
  Ollama = "ollama",
}

export declare enum Role {
  System = "system",
  Developer = "developer",
  User = "user",
  Assistant = "assistant",
  Tool = "tool",
}
export declare const DEFAULT:ModelList.Default, COMPLETE:ModelList.Complete, CHINA:ModelList.China, GLOBAL:ModelList.Global;
