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
    NON_CHINA = "non-china"

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
