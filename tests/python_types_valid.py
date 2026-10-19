from byokit import (
    get_models,
    Preset,
    ProviderId,
    Modality,
    FeatureName,
    github_contributor,
)
from byokit.types import PickerConfig

query: PickerConfig = {
    "preset": Preset.GLOBAL,
    "providerIds": [ProviderId.DEEP_SEEK],
    "filters": {
        "input": [Modality.TEXT],
        "requiredFeatures": [FeatureName.FUNCTION_CALLING],
        "verifiedBy": github_contributor("example"),
    },
}
get_models(query)

import byokit

byokit.get_models(
    {
        "filters": {
            "excludeTags": [byokit.Tag.PRICE_PREMIUM],
            "includeTags": [byokit.Tag.MODEL_FLASH, byokit.Tag.FLASH, byokit.Tag.CHANNEL_PREVIEW, byokit.Tag.PREVIEW, byokit.Tag.TIER_EDGE, byokit.Tag.EDGE],
            "lifecycle": [byokit.Lifecycle.LIVE],
            "popularity": [byokit.Popularity.POPULAR],
            "includePreviews": True,
        },
        "includePreviews": True,
    }
)

byokit.get_models(byokit.COMPLETE)
byokit.get_models(byokit.CHINA, {"local": False})
byokit.get_models(byokit.OFFICIAL)
byokit.get_models(byokit.OFFICIAL_FLAGSHIP)
byokit.get_models({"filters": {"official": True}})
byokit.get_models(
    {
        "local": [
            {
                "endpoint": "http://localhost:8000/v1",
                "api": byokit.LocalApi.OPEN_AI,
                "modelId": "my-model",
            }
        ]
    }
)

model = byokit.get_models()[0]
byokit.call(model, "Hi", "key", {"runtime_checks": False})
byokit.call_claude(
    model, {"messages": [{"role": byokit.Role.USER, "content": "Hi"}]}, "key"
)

client = byokit.OpenAI(
    base_url=model["connection"]["baseUrl"], api_key="application-owned-key"
)
client.chat.completions.create(
    model=model["apiModelId"],
    messages=[{"role": byokit.Role.USER, "content": "Hi"}],
    options={"runtime_checks": False},
).choices[0].message.content
anthropic = byokit.Anthropic(api_key="application-owned-key")
anthropic.messages.create(
    model="custom-id",
    messages=[{"role": byokit.Role.USER, "content": "Hi"}],
    max_tokens=100,
).content

import byokit

byokit.get_models({"sort": byokit.ModelSort.SPEED_DESCEND})
byokit.append_model(
    [],
    {
        "providerId": byokit.custom_provider_id("acme"),
        "modelId": "test",
        "baseUrl": "https://example.com/v1",
        "protocol": byokit.ApiProtocol.OPEN_AI,
    },
)

client2 = byokit.Byokit(runtime_checks=True, timeout_ms=90000)
client2.chat.completions.create(
    model=model,
    messages=[{"role": byokit.Role.USER, "content": "Hi"}],
    api_key="key",
    options={"runtime_checks": False},
)
client2.messages.create(
    model=model, messages=[{"role": byokit.Role.USER, "content": "Hi"}], api_key="key"
)

byokit.get_models(byokit.COMPLETE, {"providerIds": ["fireworks-ai"], "filters": {"callable": False}})

from byokit.types import Filters

composable: Filters = {
    "speciality": byokit.exact(byokit.Speciality.GENERAL),
    "tier": byokit.any(byokit.Tier.FLASH, byokit.Tier.WORKHORSE, byokit.Tier.EDGE),
    "releaseChannel": ["stable", "unknown"],
    "output": byokit.or_(byokit.exact(byokit.Modality.TEXT), byokit.exact(byokit.Modality.IMAGE)),
}
byokit.get_models({"filters": composable})

from byokit.types import CallOptions
trusted_development_options: CallOptions = {"allow_insecure_http": True}
