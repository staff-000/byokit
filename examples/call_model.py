import os
import byokit
model = byokit.get_models({"providerIds":[byokit.ProviderId.DEEP_SEEK]})[0]
client = byokit.OpenAI(model=model,api_key=lambda:os.environ["DEEPSEEK_API_KEY"])
completion = client.chat.completions.create(model=model["apiModelId"],messages=[{"role":byokit.Role.USER,"content":"Reply with exactly: OK"}])
print(completion["choices"][0]["message"]["content"])
