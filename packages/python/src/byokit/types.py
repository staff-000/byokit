from typing import TypedDict, NewType, Literal, Callable
from .enums import (FeatureStatus,Modality,Preset,ProviderId,Deployment,Country,CommercialUse,FeatureName,UnknownPolicy,FileFormat,Lifecycle,Popularity,Tag,ModelList,LocalApi)

CustomProviderId=NewType("CustomProviderId",str)
CustomCountryCode=NewType("CustomCountryCode",str)
CustomFileFormat=NewType("CustomFileFormat",str)
CustomTag=NewType("CustomTag",str)
ContributorId=NewType("ContributorId",str)

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
class Filters(TypedDict, total=False):
    deployment: list[Deployment]
    origin: list[Country | CustomCountryCode]
    input: list[Modality]
    output: list[Modality]
    requiredFeatures: list[FeatureName]
    commercialUse: CommercialUse
    openWeights: bool
    fileFormats: list[FileFormat | CustomFileFormat]
    minContextTokens: int
    maxInputPricePerM: float
    maxOutputPricePerM: float
    maxParameters: int
    maxTimeToFirstTokenMs: float
    minTokensPerSecond: float
    includeTags: list[Tag | CustomTag]
    excludeTags: list[Tag | CustomTag]
    lifecycle: list[Lifecycle]
    popularity: list[Popularity]
    includeDeprecated: bool
    verified: bool
    verifiedBy: ContributorId
    verifiedWithinDays: int
class Prefer(TypedDict, total=False):
    features: list[FeatureName]
    lowerCost: bool
class UI(TypedDict, total=False):
    maxProviders: int
    maxModelsPerProvider: int
    allowCustomModel: bool
class _LocalOptional(TypedDict,total=False):
    api: LocalApi
    modelId: str
    name: str
class LocalEndpoint(_LocalOptional):
    endpoint: str
class PickerConfig(TypedDict, total=False):
    list: ModelList
    local: list[LocalEndpoint] | Literal[False]
    preset: Preset
    providerIds: list[ProviderId | CustomProviderId]
    limit: int
    asOf: str
    unknownPolicy: UnknownPolicy
    filters: Filters
    prefer: Prefer
    ui: UI


from threading import Event
from .enums import ApiProtocol, Role
class Connection(TypedDict):
    baseUrl: str
    protocol: ApiProtocol
class TextBlock(TypedDict):
    type: Literal['text']
    text: str
class ToolFunction(TypedDict):
    name: str
    arguments: str
class ToolCall(TypedDict):
    id: str
    type: Literal['function']
    function: ToolFunction
class _ChatMessageOptional(TypedDict,total=False):
    tool_calls: list[ToolCall]
    tool_call_id: str
class ChatMessage(_ChatMessageOptional):
    role: Role
    content: str | list[TextBlock] | None
class _FunctionOptional(TypedDict,total=False):
    description: str
class FunctionDefinition(_FunctionOptional):
    name: str
    parameters: dict
class FunctionTool(TypedDict):
    type: Literal['function']
    function: FunctionDefinition
class _ChatOptional(TypedDict,total=False):
    max_tokens: int
    max_completion_tokens: int
    temperature: float
    top_p: float
    stop: str | list[str]
    tools: list[FunctionTool]
    tool_choice: Literal['auto','none','required'] | dict
    stream: Literal[False]
class ChatInput(_ChatOptional):
    messages: list[ChatMessage]
class ClaudeToolUse(TypedDict):
    type: Literal['tool_use']
    id: str
    name: str
    input: dict
class ClaudeToolResult(TypedDict):
    type: Literal['tool_result']
    tool_use_id: str
    content: str | list[TextBlock]
class ClaudeMessage(TypedDict):
    role: Literal[Role.USER,Role.ASSISTANT]
    content: str | list[TextBlock | ClaudeToolUse | ClaudeToolResult]
class ClaudeTool(_FunctionOptional):
    name: str
    input_schema: dict
class _ClaudeOptional(TypedDict,total=False):
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
class CallOptions(TypedDict,total=False):
    runtime_checks: bool
    timeout_ms: float
    input_tokens: int
    overhead_tokens: int
    cancel_event: Event
    on_warning: Callable[[dict],None]
