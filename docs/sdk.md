# Reusable OpenAI and Claude clients

Byokit supplies lightweight clients with familiar constructor and resource methods.
These are byokit implementations of a supported subset, not the official SDKs.
Discovery remains offline and the standalone call helpers remain available.

## JavaScript / TypeScript

```ts
import * as byokit from 'byokit/catalog';

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
import * as byokit from 'byokit/catalog';

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
protocol. A custom request ID never borrows another model's limits. Context token
budget verification is optional and disabled by default. When enabled with
`checkBudget: true` (`check_budget=True`) or `runtimeChecks: true` (`runtime_checks=True`),
missing input token counts and unknown limits warn, while known budget/capability violations fail.
Defaults remain non-streaming text/system/sampling/tools, 1,024 output tokens capped
by a known smaller output limit, 90 seconds, and zero automatic retries. Unsupported
parameters fail. Tool calls are returned, never executed automatically.

The key stays in client memory for reuse and is sent only to its fixed endpoint.
Constructor/header/model settings are copied; later caller mutations cannot reroute
requests. Models are strings, so requests cannot supply another endpoint. Requests
have independent cancellation and deadlines. Built-in execution does not persist keys
or send telemetry. Normalized provider errors and returned results omit/redact the
supplied key. Redirects are blocked. Default headers are copied and cannot replace auth, cookies, Host,
Content-Type or transport framing headers. Per-request `headers` can override other
constructor headers without changing the key or endpoint. Empty `apiKey`/`api_key`
is an explicit choice for an unauthenticated local endpoint; omission is rejected.

Authenticated remote calls require HTTPS. HTTP is allowed for `localhost`, IPv4
loopback (`127.0.0.0/8`), and `::1`. For a trusted development network only, explicitly
set `allowInsecureHttp: true` (Python: `allow_insecure_http=True`) in client or call
options. This also gates custom headers on remote HTTP, since headers may contain
credentials. The website does not offer this bypass. Unauthenticated remote HTTP
calls without custom headers remain possible.

Python reusable clients cannot be pickled; generic JSON serialization with
`default=vars` also fails safely when it reaches the credential holder. Attribute
dumps show a redacted holder rather than the key string. Serialize non-secret
configuration and recreate the client instead. Responses remain JSON serializable.
These protections prevent accidental dumps; code inspecting process memory or
explicitly accessing credentials can still read them. Do not log headers or locals.
Custom credential stores, transport functions, and application callbacks control
their own persistence and logging.

## Migration

- Replace `new Byokit()` plus per-request keys with `new OpenAI({baseURL, apiKey})`
  or `new Anthropic({baseURL, apiKey})`.
- Replace request model objects with `model.apiModelId`.
- Put known offering metadata in the optional constructor `models` list.
- Legacy `openAI()`/`claude()` factories and bound-model callback constructor forms
  keep their prior behavior, but are deprecated. Use a new client to change accounts.
- `byokit.call(model, prompt, key)` and `callClaude()` remain stateless helpers.

### Local models

Local is a setup option in model pickers. Supply a server URL, protocol, and model ID to get a regular callable model; configuring it sends no network request.

```js
const models = byokit.getModels({
  local: [
    {
      endpoint: 'http://localhost:11434',
      api: byokit.LocalApi.Ollama,
      modelId: 'my-installed-model',
    },
  ],
});
const local = models.find((model) => model.providerId === 'local');
const response = await byokit.call(local, 'Hello', '');
```

```python
models = byokit.get_models({
    "local": [{
        "endpoint": "http://localhost:11434",
        "api": byokit.LocalApi.OLLAMA,
        "modelId": "my-installed-model",
    }],
})
local = next(model for model in models if model["providerId"] == "local")
response = byokit.call(local, "Hello", "")
```

The entry contains `providerId`, `apiModelId`, and `connection` (`baseUrl` and `protocol`). Use `LocalApi.OpenAI` in JavaScript or `LocalApi.OPEN_AI` in Python for an OpenAI-compatible server. The empty key is suitable for a server without authentication; pass a key separately when required.

The generic **Local — configure endpoint** entry is a setup option, with `callSupport.textGeneration: false`. A URL without a model ID is also incomplete. Configured entries support routing through the selected adapter; configuration does not establish server availability or model capabilities. Unknown modalities remain unknown and are excluded by modality filters.

Local offering IDs identify the normalized endpoint, protocol, and served model ID, and stay stable when entries are reordered. Older `local/custom` and positional verification records remain readable but are not attributed to a new connection.

The DOM picker's **Use this model** action validates and saves without discovery or generation. For a configured local selection, `selection.model` is a regular `ModelOption` ready for `byokit.call(selection.model, prompt, key)`. Existing selection fields and credential references remain available. **Find models** is optional and runs only when clicked. The website keeps configuration in page memory and opens verification only when requested; local results remain private.
