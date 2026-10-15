# Reusable OpenAI and Claude clients

Byokit supplies lightweight clients with familiar constructor and resource methods.
These are byokit implementations of a supported subset, not the official SDKs.
Discovery remains offline and the standalone call helpers remain available.

## JavaScript / TypeScript

```ts
import * as byokit from '@byokit/core/catalog';

const models = byokit.getModels({ providerIds: [byokit.ProviderId.OpenRouter], local: false });
const model = models[0]; // Or use the app's selected offering.
if (!model?.connection) throw new Error('No configured model');
const client = new byokit.OpenAI({
  baseURL: model.connection.baseUrl,
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': 'https://your-app.example',
    'X-OpenRouter-Title': 'Your app',
  },
  models, // Optional: known limits/capabilities for offerings at this endpoint.
});

const first = await client.chat.completions.create({
  model: model.apiModelId,
  messages: [{ role: byokit.Role.User, content: 'Hello' }],
});
const second = await client.chat.completions.create({
  model: model.apiModelId,
  messages: [{ role: byokit.Role.User, content: 'Another question' }],
});
console.log(first.choices[0].message.content, second.choices[0].message.content);
```

The string `model` is the exact API ID at the configured endpoint, not a globally
resolved family name. Unknown IDs are sent unchanged with unknown fit metadata;
there is no model substitution, discovery request, or inference retry.

Claude-style calls use `new byokit.Anthropic({baseURL, apiKey})` and
`client.messages.create({model, max_tokens, system, messages})`. A root base URL
such as `https://gateway.example` targets `/v1/messages`; an existing `/v1` suffix
is accepted without duplicating it. OpenAI base URLs include their desired API
prefix, such as `https://openrouter.ai/api/v1`, and target `/chat/completions`.

## Python

```python
import os
import byokit

models = byokit.get_models({"providerIds": [byokit.ProviderId.ANTHROPIC], "local": False})
if not models:
    raise ValueError("No matching model")
model = models[0]
client = byokit.Anthropic(
    base_url=model["connection"]["baseUrl"],
    api_key=os.environ["ANTHROPIC_API_KEY"],
    models=models,
)
message = client.messages.create(
    model=model["apiModelId"],
    max_tokens=1024,
    system="Be concise.",
    messages=[{"role": byokit.Role.USER, "content": "Explain B-trees"}],
)
print(message.content)
# Mapping access remains available: message["content"].
```

`byokit.OpenAI(base_url=..., api_key=..., default_headers=...)` exposes
`client.chat.completions.create(model=..., messages=...)`. Python is synchronous;
cancellation and per-request execution options use `options={"cancel_event": event}`.
Nested responses support `.choices[0].message.content` as well as dictionary access.

## Existing official SDKs

You can use byokit only for discovery and keep your existing SDK. No byokit client
is required when the selected endpoint natively speaks the SDK's protocol.

```ts
import OpenAI from 'openai';
import * as byokit from '@byokit/core/catalog';

const [model] = byokit.getModels({ providerIds: [byokit.ProviderId.OpenRouter], local: false });
if (!model?.connection || model.connection.protocol !== byokit.ApiProtocol.OpenAI) {
  throw new Error('Choose an OpenAI-compatible endpoint');
}
const client = new OpenAI({ baseURL: model.connection.baseUrl, apiKey });
const result = await client.chat.completions.create({
  model: model.apiModelId,
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(result.choices[0].message.content);
```

```python
from anthropic import Anthropic
import os
import byokit

models = byokit.get_models({"providerIds": [byokit.ProviderId.ANTHROPIC], "local": False})
if not models or models[0]["connection"]["protocol"] != byokit.ApiProtocol.CLAUDE:
    raise ValueError("Choose a Claude-compatible endpoint")
model = models[0]
client = Anthropic(
    base_url=model["connection"]["baseUrl"].removesuffix("/v1"),
    api_key=os.environ["ANTHROPIC_API_KEY"],
)
message = client.messages.create(
    model=model["apiModelId"], max_tokens=1024, system="Be concise.",
    messages=[{"role": "user", "content": "Explain B-trees"}],
)
print(message.content)
```

Install `openai` or `anthropic` separately for these examples. They are optional
application dependencies, not dependencies of byokit's offline catalog. Official
SDK behavior (including retries, supported features and telemetry) is owned by that
SDK and its configuration. Byokit's runtime checks apply to its own calls; use
`checkFit()`/`check_fit()` explicitly before official SDK calls when needed.

References: [official OpenAI JavaScript SDK](https://developers.openai.com/api/reference/typescript),
[official Claude Python SDK](https://platform.claude.com/docs/en/api/sdks/python),
[OpenRouter integration](https://openrouter.ai/docs/quickstart).

## Protocols, validation and credentials

Byokit clients default to OpenAI or Claude native wire formats. A constructor
`protocol: byokit.ApiProtocol.Gemini` (Python `protocol=byokit.ApiProtocol.GEMINI`)
explicitly selects a native adapter; request/response format still follows the
client class. This extension is not part of official SDK compatibility. Changing
`baseURL` alone does not turn a native Gemini endpoint into an OpenAI endpoint.
No proxy service is introduced.

Optional `models` metadata must uniquely match the constructor endpoint and
protocol. A custom request ID never borrows another model's limits. Missing input
token counts and unknown limits warn; known budget/capability violations fail.
`runtimeChecks: false` (`runtime_checks=False`) skips only model-fit checks.
Defaults remain non-streaming text/system/sampling/tools, 1,024 output tokens capped
by a known smaller output limit, 90 seconds, and zero automatic retries. Unsupported
parameters fail. Tool calls are returned, never executed automatically.

The key stays in client memory for reuse and is sent only to its fixed endpoint.
Constructor/header/model settings are copied; later caller mutations cannot reroute
requests. Models are strings, so requests cannot supply another endpoint. Requests
have independent cancellation and deadlines. Keys never enter persistent settings,
logs, telemetry, diagnostics, catalog metadata or returned responses. Redirects are
blocked. Default headers are copied and cannot replace auth, cookies, Host,
Content-Type or transport framing headers. Per-request `headers` can override other
constructor headers without changing the key or endpoint. Empty `apiKey`/`api_key`
is an explicit choice for an unauthenticated local endpoint; omission is rejected.

## Migration

- Replace `new Byokit()` plus per-request keys with `new OpenAI({baseURL, apiKey})`
  or `new Anthropic({baseURL, apiKey})`.
- Replace request model objects with `model.apiModelId`.
- Put known offering metadata in the optional constructor `models` list.
- Legacy `openAI()`/`claude()` factories and bound-model callback constructor forms
  keep their prior behavior, but are deprecated. Use a new client to change accounts.
- `byokit.call(model, prompt, key)` and `callClaude()` remain stateless helpers.
