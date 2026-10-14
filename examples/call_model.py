import os
import byokit

model = byokit.get_models({"providerIds": [byokit.ProviderId.DEEP_SEEK]})[0]
result = byokit.call(model, "Reply with exactly: OK", os.environ["DEEPSEEK_API_KEY"])
print(result["choices"][0]["message"]["content"])
