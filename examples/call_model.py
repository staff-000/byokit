import os
import byokit

models = byokit.get_models({
    "providerIds": [byokit.ProviderId.DEEP_SEEK], "local": False,
})
if not models or not models[0]["connection"]:
    raise ValueError("No configured model")
model = models[0]  # Or let the user choose.
client = byokit.OpenAI(
    base_url=model["connection"]["baseUrl"],
    api_key=os.environ["DEEPSEEK_API_KEY"],
)
completion = client.chat.completions.create(
    model=model["apiModelId"],
    max_tokens=1024,
    messages=[{"role": byokit.Role.USER, "content": "Hello"}],
)
print(completion.choices[0].message.content)
