import os
import byokit

models = byokit.get_models({
    "providerIds": [byokit.ProviderId.DEEP_SEEK], "limit": 1, "local": False,
})
if not models:
    raise ValueError("No matching model")
model = models[0]
client = byokit.Byokit()
completion = client.chat.completions.create(
    model=model,
    messages=[{"role": byokit.Role.USER, "content": "Reply with exactly: OK"}],
    api_key=os.environ["DEEPSEEK_API_KEY"],
)
print(completion["choices"][0]["message"]["content"])
