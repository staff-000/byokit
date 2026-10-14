from byokit import get_models, Preset, ProviderId, Modality, FeatureName, github_contributor
from byokit.types import PickerConfig
query: PickerConfig={"preset":Preset.NON_CHINA,"providerIds":[ProviderId.DEEP_SEEK],"filters":{"input":[Modality.TEXT],"requiredFeatures":[FeatureName.FUNCTION_CALLING],"verifiedBy":github_contributor("example")}}
get_models(query)

import byokit
byokit.get_models({"filters":{"excludeTags":[byokit.Tag.PRICE_PREMIUM],"lifecycle":[byokit.Lifecycle.LIVE],"popularity":[byokit.Popularity.POPULAR]}})

byokit.get_models(byokit.COMPLETE)
byokit.get_models(byokit.CHINA,{"local":False})
byokit.get_models({"local":[{"endpoint":"http://localhost:8000/v1","api":byokit.LocalApi.OPEN_AI,"modelId":"my-model"}]})

model = byokit.get_models()[0]
byokit.call(model, "Hi", "key", {"runtime_checks": False})
byokit.call_claude(model, {"messages": [{"role": byokit.Role.USER, "content": "Hi"}]}, "key")

client = byokit.OpenAI(model=model, api_key=lambda: "application-owned-key")
client.chat.completions.create(model=model["apiModelId"], messages=[{"role":byokit.Role.USER,"content":"Hi"}], options={"runtime_checks":False})
anthropic = byokit.Anthropic(model=model, api_key=lambda: "application-owned-key")
anthropic.messages.create(messages=[{"role":byokit.Role.USER,"content":"Hi"}], max_tokens=100)
