from byokit import get_models, Preset, ProviderId, Modality, FeatureName, github_contributor
from byokit.types import PickerConfig
query: PickerConfig={"preset":Preset.NON_CHINA,"providerIds":[ProviderId.DEEP_SEEK],"filters":{"input":[Modality.TEXT],"requiredFeatures":[FeatureName.FUNCTION_CALLING],"verifiedBy":github_contributor("example")}}
get_models(query)
