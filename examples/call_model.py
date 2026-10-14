import json
import os
import urllib.request
import byokit

models = byokit.get_models({
    "providerIds": [byokit.ProviderId.DEEP_SEEK], "limit": 1,
})
if not models:
    raise RuntimeError("No LIVE DeepSeek offering found.")
model = models[0]
api_key = os.environ["DEEPSEEK_API_KEY"]

request = urllib.request.Request(
    "https://api.deepseek.com/v1/chat/completions",
    method="POST",
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    },
    data=json.dumps({
        "model": model["apiModelId"],
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 256,
        "stream": False,
    }).encode(),
)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

opener = urllib.request.build_opener(NoRedirect)
with opener.open(request, timeout=90) as response:
    data = json.load(response)
print(data["choices"][0]["message"]["content"])
