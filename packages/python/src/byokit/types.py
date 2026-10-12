from typing import Literal, TypedDict

FeatureStatus = Literal["supported", "unsupported", "conditional", "unknown"]
Modality = Literal["text", "image", "audio", "video", "embedding"]
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
