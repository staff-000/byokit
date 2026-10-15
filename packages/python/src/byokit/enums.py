# Generated from spec/enums.json. Run npm run enums:generate.
from enum import Enum

class ProviderId(str, Enum):
    OPEN_AI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    MISTRAL = "mistral"
    GROQ = "groq"
    OPEN_ROUTER = "openrouter"
    DEEP_SEEK = "deepseek"
    ZHIPU_AI = "zhipuai"
    SILICON_FLOW = "siliconflow"
    OLLAMA = "ollama"
    LOCAL = "local"

class Preset(str, Enum):
    GLOBAL = "global"
    CHINA = "china"

class Country(str, Enum):
    CHINA = "cn"
    UNITED_STATES = "us"
    FRANCE = "fr"

class Deployment(str, Enum):
    HOSTED = "hosted"
    LOCAL = "local"
    SELF_HOSTED = "self-hosted"

class AuthRequirement(str, Enum):
    REQUIRED = "required"
    OPTIONAL = "optional"
    NONE = "none"

class Modality(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    EMBEDDING = "embedding"

class FileFormat(str, Enum):
    PDF = "pdf"
    TEXT = "txt"
    MARKDOWN = "md"
    HTML = "html"
    JSON = "json"
    DOCX = "docx"

class FeatureName(str, Enum):
    FUNCTION_CALLING = "functionCalling"
    PARALLEL_TOOLS = "parallelTools"
    FORCED_TOOL_CHOICE = "forcedToolChoice"
    STRICT_TOOL_SCHEMA = "strictToolSchema"
    PROMPT_CACHING = "promptCaching"
    JSON_MODE = "jsonMode"
    JSON_SCHEMA = "jsonSchema"
    STRICT_JSON_SCHEMA = "strictJsonSchema"
    SYSTEM_MESSAGES = "systemMessages"
    DEVELOPER_MESSAGES = "developerMessages"
    THINKING = "thinking"
    THINKING_DISABLE = "thinkingDisable"
    THINKING_BUDGET = "thinkingBudget"
    THINKING_EFFORT = "thinkingEffort"

class FeatureStatus(str, Enum):
    SUPPORTED = "supported"
    UNSUPPORTED = "unsupported"
    CONDITIONAL = "conditional"
    UNKNOWN = "unknown"

class CommercialUse(str, Enum):
    ALLOWED = "allowed"
    RESTRICTED = "restricted"
    UNKNOWN = "unknown"

class Architecture(str, Enum):
    DENSE = "dense"
    MO_E = "moe"
    UNKNOWN = "unknown"

class ContextAccounting(str, Enum):
    COMBINED = "combined"
    INPUT_ONLY = "input-only"
    UNKNOWN = "unknown"

class UnknownPolicy(str, Enum):
    INCLUDE = "include"
    EXCLUDE = "exclude"

class FitStatus(str, Enum):
    FITS = "fits"
    EXCEEDS = "exceeds"
    UNKNOWN = "unknown"

class Certainty(str, Enum):
    DECLARED = "declared"
    MEASURED = "measured"
    ESTIMATED = "estimated"
    UNKNOWN = "unknown"

class Currency(str, Enum):
    USD = "USD"
    EUR = "EUR"
    CNY = "CNY"

class ModelStatus(str, Enum):
    STABLE = "stable"
    PREVIEW = "preview"
    ALPHA = "alpha"
    BETA = "beta"
    DEPRECATED = "deprecated"

class VerificationResult(str, Enum):
    PASSED = "passed"
    FAILED = "failed"

class VerificationStatus(str, Enum):
    UNVERIFIED = "unverified"
    PASSED = "passed"
    FAILED = "failed"
    STALE = "stale"

class VerificationCheck(str, Enum):
    TEXT_GENERATION = "textGeneration"
    FUNCTION_CALLING = "functionCalling"
    PARALLEL_TOOLS = "parallelTools"
    FORCED_TOOL_CHOICE = "forcedToolChoice"
    STRICT_TOOL_SCHEMA = "strictToolSchema"
    PROMPT_CACHING = "promptCaching"
    JSON_MODE = "jsonMode"
    JSON_SCHEMA = "jsonSchema"
    STRICT_JSON_SCHEMA = "strictJsonSchema"
    SYSTEM_MESSAGES = "systemMessages"
    DEVELOPER_MESSAGES = "developerMessages"
    THINKING = "thinking"
    THINKING_DISABLE = "thinkingDisable"
    THINKING_BUDGET = "thinkingBudget"
    THINKING_EFFORT = "thinkingEffort"

class LocalRuntime(str, Enum):
    OLLAMA = "ollama"
    OPEN_AI_COMPATIBLE = "openai-compatible"

class Locale(str, Enum):
    ENGLISH = "en"
    CHINESE = "zh"

class SetupStatus(str, Enum):
    IDLE = "idle"
    CHECKING = "checking"
    READY = "ready"
    ERROR = "error"

class SetupEventType(str, Enum):
    EDIT = "edit"
    CHECKING = "checking"
    RESULT = "result"

class Severity(str, Enum):
    WARNING = "warning"
    ERROR = "error"

class DiagnosticCode(str, Enum):
    CAPABILITY_UNSUPPORTED = "CAPABILITY_UNSUPPORTED"
    CAPABILITY_UNVERIFIED = "CAPABILITY_UNVERIFIED"
    CONTEXT_BUDGET_EXCEEDED = "CONTEXT_BUDGET_EXCEEDED"
    CONTEXT_NEAR_LIMIT = "CONTEXT_NEAR_LIMIT"
    CONTEXT_UNVERIFIED = "CONTEXT_UNVERIFIED"
    INPUT_BUDGET_EXCEEDED = "INPUT_BUDGET_EXCEEDED"
    LOCAL_CONTEXT_UNKNOWN = "LOCAL_CONTEXT_UNKNOWN"
    MODALITY_UNSUPPORTED = "MODALITY_UNSUPPORTED"
    MODALITY_UNVERIFIED = "MODALITY_UNVERIFIED"
    MODEL_DEPRECATED = "MODEL_DEPRECATED"
    MODEL_UNVERIFIED = "MODEL_UNVERIFIED"
    NO_MODELS = "NO_MODELS"
    OUTPUT_BUDGET_EXCEEDED = "OUTPUT_BUDGET_EXCEEDED"
    OUTPUT_LIMIT_UNKNOWN = "OUTPUT_LIMIT_UNKNOWN"
    TOKEN_COUNT_UNKNOWN = "TOKEN_COUNT_UNKNOWN"
    TOKEN_ESTIMATE = "TOKEN_ESTIMATE"
    BUDGET_UNDECLARED = "BUDGET_UNDECLARED"

class Lifecycle(str, Enum):
    LIVE = "LIVE"
    OUTDATED = "OUTDATED"
    UNCERTAIN = "UNCERTAIN"

class Popularity(str, Enum):
    POPULAR = "POPULAR"
    NOT_POPULAR = "NOT_POPULAR"
    UNCERTAIN = "UNCERTAIN"

class PopularityMetric(str, Enum):
    REQUESTS = "requests"
    TOKENS = "tokens"
    DOWNLOADS = "downloads"

class Tag(str, Enum):
    LIFECYCLE_LIVE = "lifecycle:LIVE"
    LIFECYCLE_OUTDATED = "lifecycle:OUTDATED"
    LIFECYCLE_UNCERTAIN = "lifecycle:UNCERTAIN"
    POPULARITY_POPULAR = "popularity:POPULAR"
    POPULARITY_NOT_POPULAR = "popularity:NOT_POPULAR"
    POPULARITY_UNCERTAIN = "popularity:UNCERTAIN"
    PRICE_PREMIUM = "price:premium"
    WEIGHTS_OPEN = "weights:open"
    ORIGIN_CHINA = "origin:cn"

class ModelList(str, Enum):
    DEFAULT = "default"
    COMPLETE = "complete"
    CHINA = "china"
    GLOBAL = "global"

class LocalApi(str, Enum):
    OPEN_AI = "openai-compatible"
    OLLAMA = "ollama"

class LifecycleBasis(str, Enum):
    PROVIDER = "provider"
    CATALOG_LISTING = "catalog-listing"

class ApiProtocol(str, Enum):
    OPEN_AI = "openai-compatible"
    CLAUDE = "claude"
    GEMINI = "gemini"
    OLLAMA = "ollama"

class Role(str, Enum):
    SYSTEM = "system"
    DEVELOPER = "developer"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"

class ModelSort(str, Enum):
    ALPHABETICAL_ASCEND = "alphabeticalAscend"
    ALPHABETICAL_DESCEND = "alphabeticalDescend"
    PRICE_ASCEND = "priceAscend"
    PRICE_DESCEND = "priceDescend"
    SPEED_ASCEND = "speedAscend"
    SPEED_DESCEND = "speedDescend"
    PROVIDER_ORDER = "provider-order"
    ALPHABETICAL = "alphabetical"
    PRICE = "price"
    SPEED = "speed"

DEFAULT=ModelList.DEFAULT
COMPLETE=ModelList.COMPLETE
CHINA=ModelList.CHINA
GLOBAL=ModelList.GLOBAL
