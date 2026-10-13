from typing import TypedDict, NewType
from .enums import (FeatureStatus,Modality,Preset,ProviderId,Deployment,Country,CommercialUse,FeatureName,UnknownPolicy,FileFormat)

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
    includeTags: list[CustomTag]
    excludeTags: list[CustomTag]
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
class PickerConfig(TypedDict, total=False):
    preset: Preset
    providerIds: list[ProviderId | CustomProviderId]
    limit: int
    asOf: str
    unknownPolicy: UnknownPolicy
    filters: Filters
    prefer: Prefer
    ui: UI
