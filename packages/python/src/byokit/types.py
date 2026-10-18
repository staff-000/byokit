from typing import TypedDict, NewType, Literal, Callable, Generic, TypeVar, Union, TypeAlias
from .enums import (
    FeatureStatus,
    Modality,
    Preset,
    ProviderId,
    Deployment,
    Country,
    CommercialUse,
    FeatureName,
    UnknownPolicy,
    FileFormat,
    Lifecycle,
    Popularity,
    Tag,
    ModelList,
    LocalApi,
    ModelSort,
    Speciality,
    Tier,
)

CustomProviderId = NewType("CustomProviderId", str)
CustomCountryCode = NewType("CustomCountryCode", str)
CustomFileFormat = NewType("CustomFileFormat", str)
CustomTag = NewType("CustomTag", str)
ContributorId = NewType("ContributorId", str)


class _FeatureOptional(TypedDict, total=False):
    source: str
    reviewedAt: str


class Feature(_FeatureOptional):
    status: FeatureStatus


class Budget(TypedDict, total=False):
    inputTokens: int
    outputTokens: int
    overheadTokens: int


class _SelectionOptional(TypedDict, total=False):
    offeringId: str
    credentialRef: str
    endpoint: str


class Selection(_SelectionOptional):
    providerId: str
    modelId: str


T = TypeVar("T")
SetMatcherMode = Literal["exact", "contain", "contains", "any", "exclude"]
BooleanOperator = Literal["and", "or", "xor", "not"]
ReleaseChannel = Literal["stable", "preview", "experimental", "unknown"]


class FilterMatcher(TypedDict, Generic[T], total=False):
    mode: SetMatcherMode
    op: BooleanOperator
    values: list[Union[T, "FilterMatcher[T]"]]
    exact: Union[T, list[Union[T, "FilterMatcher[T]"]]]
    contain: Union[T, list[Union[T, "FilterMatcher[T]"]]]
    contains: Union[T, list[Union[T, "FilterMatcher[T]"]]]
    any: Union[T, list[Union[T, "FilterMatcher[T]"]]]
    exclude: Union[T, list[Union[T, "FilterMatcher[T]"]]]


ListFilter: TypeAlias = Union[T, list[T], FilterMatcher[T]]
ModalityMatcherMode = SetMatcherMode
ModalityMatcher = FilterMatcher[Modality | str]
ModalityFilter = ListFilter[Modality | str]


class Filters(TypedDict, total=False):
    speciality: ListFilter[Speciality]
    tier: ListFilter[Tier]
    releaseChannel: ListFilter[ReleaseChannel]
    deployment: ListFilter[Deployment]
    origin: ListFilter[Country | CustomCountryCode]
    input: ModalityFilter
    output: ModalityFilter
    requiredFeatures: ListFilter[FeatureName]
    commercialUse: CommercialUse
    openWeights: bool
    fileFormats: ListFilter[FileFormat | CustomFileFormat]
    minContextTokens: int
    maxInputPricePerM: float
    maxOutputPricePerM: float
    maxParameters: int
    maxTimeToFirstTokenMs: float
    minTokensPerSecond: float
    includeTags: ListFilter[Tag | CustomTag]
    excludeTags: ListFilter[Tag | CustomTag]
    lifecycle: ListFilter[Lifecycle]
    popularity: ListFilter[Popularity]
    includeDeprecated: bool
    includePreviews: bool
    callable: bool
    verified: bool
    verifiedBy: ContributorId
    verifiedWithinDays: int
    official: bool
    releasedWithin: Literal["1m", "3m", "6m", "1y", "2y"] | Tag | str | int | float


class Prefer(TypedDict, total=False):
    features: list[FeatureName]
    lowerCost: bool


class UI(TypedDict, total=False):
    maxProviders: int
    maxModelsPerProvider: int
    allowCustomModel: bool


class _LocalOptional(TypedDict, total=False):
    api: LocalApi
    modelId: str
    name: str


class LocalEndpoint(_LocalOptional):
    endpoint: str


class PickerConfig(TypedDict, total=False):
    sort: ModelSort
    list: ModelList
    local: list[LocalEndpoint] | Literal[False]
    preset: Preset
    providerIds: ListFilter[str]
    limit: int
    asOf: str
    unknownPolicy: UnknownPolicy
    includePreviews: bool
    filters: Filters
    prefer: Prefer
    ui: UI


from threading import Event
from .enums import ApiProtocol, Role


class Connection(TypedDict):
    baseUrl: str
    protocol: ApiProtocol


class TextBlock(TypedDict):
    type: Literal["text"]
    text: str


class ToolFunction(TypedDict):
    name: str
    arguments: str


class ToolCall(TypedDict):
    id: str
    type: Literal["function"]
    function: ToolFunction


class _ChatMessageOptional(TypedDict, total=False):
    tool_calls: list[ToolCall]
    tool_call_id: str


class ChatMessage(_ChatMessageOptional):
    role: Role
    content: str | list[TextBlock] | None


class _FunctionOptional(TypedDict, total=False):
    description: str


class FunctionDefinition(_FunctionOptional):
    name: str
    parameters: dict


class FunctionTool(TypedDict):
    type: Literal["function"]
    function: FunctionDefinition


class _ChatOptional(TypedDict, total=False):
    max_tokens: int
    max_completion_tokens: int
    temperature: float
    top_p: float
    stop: str | list[str]
    tools: list[FunctionTool]
    tool_choice: Literal["auto", "none", "required"] | dict
    stream: Literal[False]


class ChatInput(_ChatOptional):
    messages: list[ChatMessage]


class ClaudeToolUse(TypedDict):
    type: Literal["tool_use"]
    id: str
    name: str
    input: dict


class ClaudeToolResult(TypedDict):
    type: Literal["tool_result"]
    tool_use_id: str
    content: str | list[TextBlock]


class ClaudeMessage(TypedDict):
    role: Literal[Role.USER, Role.ASSISTANT]
    content: str | list[TextBlock | ClaudeToolUse | ClaudeToolResult]


class ClaudeTool(_FunctionOptional):
    name: str
    input_schema: dict


class _ClaudeOptional(TypedDict, total=False):
    system: str | list[TextBlock]
    max_tokens: int
    temperature: float
    top_p: float
    top_k: int
    stop_sequences: list[str]
    tools: list[ClaudeTool]
    tool_choice: dict
    stream: Literal[False]


class ClaudeInput(_ClaudeOptional):
    messages: list[ClaudeMessage]


class CallOptions(TypedDict, total=False):
    headers: dict[str, str]
    check_budget: bool
    runtime_checks: bool
    timeout_ms: float
    input_tokens: int
    overhead_tokens: int
    cancel_event: Event
    on_warning: Callable[[dict], None]


class _CustomModelOptional(TypedDict, total=False):
    providerName: str
    name: str
    deployment: Deployment
    limits: dict


class CustomModel(_CustomModelOptional):
    providerId: ProviderId | CustomProviderId
    modelId: str
    baseUrl: str
    protocol: ApiProtocol


class AttemptRetry(TypedDict):
    action: str
    afterSeconds: int | None


class _AttemptOptional(TypedDict, total=False):
    httpStatus: int


class VerificationAttempt(_AttemptOptional):
    outcome: Literal[
        "succeeded", "partial", "blocked", "inconclusive", "canceled", "skipped"
    ]
    reason: str | None
    scope: Literal[
        "account", "model", "provider", "region", "request", "client", "unknown"
    ]
    certainty: Literal["explicit", "inferred", "unknown"]
    source: Literal["provider_code", "http_status", "client_error"]
    classifierVersion: Literal["1"]
    retry: AttemptRetry


class VerificationCheckResults(TypedDict):
    textGeneration: Literal["passed", "blocked", "inconclusive", "not_run"]
    speed: Literal["passed", "blocked", "inconclusive", "not_run"]


class VerificationPhase(TypedDict):
    phase: Literal["baseline", "generation"]
    attempt: VerificationAttempt


class _AssessmentOptional(TypedDict, total=False):
    phases: list[VerificationPhase]


class VerificationAssessment(_AssessmentOptional):
    attempt: VerificationAttempt
    checks: VerificationCheckResults


class _VerificationRecordOptional(TypedDict, total=False):
    assessment: VerificationAssessment
    tokensPerSecond: float
    timeToFirstTokenMs: float
    notes: str


class VerificationRecord(_VerificationRecordOptional):
    id: str
    offeringId: str
    contributor: str
    checkedAt: str
    result: Literal["passed", "failed"]
    checks: list[str]
    evidence: str
    adapter: str


class CommunityAssessment(TypedDict):
    status: Literal["verified", "issues_reported", "unverified", "stale"]
    lastSuccessAt: str | None
    successfulContributors: int
    recentIssues: dict[str, int]
    issueWindowDays: int
    latest: VerificationRecord | None
    latestSuccess: VerificationRecord | None


class VerificationSummary(TypedDict):
    status: Literal["passed", "unverified", "stale"]
    communityStatus: Literal["verified", "issues_reported", "unverified", "stale"]
    community: CommunityAssessment
    latest: VerificationRecord | None
    records: list[VerificationRecord]
