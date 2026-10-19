# byokit

Get a model list, let the user choose, and call that model with their API key. BYOKit provides offline catalog queries and text-generation adapters for JavaScript/TypeScript and Python.

[Website and playground](https://staff-000.github.io/byokit/) · [Model explorer](https://staff-000.github.io/byokit/#explore) · [Verify a model](https://staff-000.github.io/byokit/verification.html) · [SDK reference](https://github.com/staff-000/byokit/blob/main/docs/sdk.md)

## Install

```sh
npm install byokit
# Or, for Python:
pip install byokit
```

## Call a model

These examples run in Node.js or Python. Run JavaScript as an ES module (`.mjs`, or `"type": "module"` in `package.json`); TypeScript uses your usual compiler or runner. Set `DEEPSEEK_API_KEY` in the process environment first. The key must belong to the selected provider; BYOKit does not supply credentials.

### JavaScript / TypeScript

<!-- example: hosted-js -->

```js
import * as byokit from 'byokit';

const key = process.env.DEEPSEEK_API_KEY;
if (!key) throw new Error('Set DEEPSEEK_API_KEY');

const [model] = byokit.getModels(byokit.DEFAULT, {
  providerIds: [byokit.ProviderId.DeepSeek],
  local: false,
  limit: 1,
  filters: { callable: true },
});
if (!model?.connection) throw new Error('No matching callable model');

const response = await byokit.call(model, 'Hello!', key);
console.log(response.choices[0].message.content);
```

### Python

<!-- example: hosted-python -->

```python
import os
import byokit

key = os.environ["DEEPSEEK_API_KEY"]
models = byokit.get_models(byokit.DEFAULT, {
    "providerIds": [byokit.ProviderId.DEEP_SEEK],
    "local": False,
    "limit": 1,
    "filters": {"callable": True},
})
if not models or not models[0]["connection"]:
    raise ValueError("No matching callable model")
model = models[0]

response = byokit.call(model, "Hello!", key)
print(response["choices"][0]["message"]["content"])
```

`getModels()` / `get_models()` is synchronous and sends no requests. `call()` sends one request to the selected model's configured endpoint. JavaScript calls return a Promise; Python calls are synchronous. The direct helper chooses the wire protocol from `model.connection.protocol` and returns an OpenAI-compatible completion, including for supported Claude, Gemini, and Ollama adapters.

## Integration contract for developers and AI coding agents

1. **Choose an offering, not a model name guessed from memory.** `DEFAULT` is a maintained recommendation list. Use `COMPLETE` for full discovery, then apply filters. Always handle an empty result.
2. **Use the correct identifier.** Pass the complete returned model object to `byokit.call()`. When using a client, pass `model.apiModelId` as the request's `model` string. `model.id` identifies a provider offering and is not necessarily an API model ID.
3. **Match the key to `model.providerId`.** A reseller offering needs that reseller's key, not the model creator's key. For multiple providers, keep a separate key for each provider. Never send one key across a model list containing different providers.
4. **Check call support.** `model.callSupport.textGeneration` describes adapter compatibility. It does not prove availability, account access, credits, or a successful call. Newly discovered providers can be listed without a call adapter.
5. **Keep the protocol.** `byokit.call()` reads it automatically. With BYOKit's `OpenAI` or `Anthropic` clients, copy both `connection.baseUrl` and `connection.protocol`. These clients implement a subset of familiar SDK interfaces; they are not the official SDKs.
6. **Local requires configuration.** The generic Local setup entry is not callable. Supply a URL, protocol, and exact served model ID; configuration sends no request. Do not infer installed models or scan local ports.
7. **Execution supports non-streaming text and tool-call responses.** Image/audio/video models are discoverable, but media generation and streaming execution are not implemented. Returned tool calls are never executed automatically.
8. **Keep credentials outside model metadata and source code.** Use environment variables on servers. In browser apps, collect the user's key in memory and send it directly to its endpoint; provider CORS policies may prevent browser calls.

A returned model uses the same field names in JavaScript objects and Python dictionaries:

| Field                         | Meaning                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| `id`                          | Provider-offering identity; use for selection and records           |
| `providerId`                  | Provider whose endpoint and account key are used                    |
| `apiModelId`                  | Exact model ID sent to that provider                                |
| `connection`                  | `{ baseUrl, protocol }`, or `null` if no reviewed connection exists |
| `callSupport`                 | `{ textGeneration, reason }`                                        |
| `local`                       | Present on Local entries: `{ endpoint, api, configured }`           |
| `modalities`                  | Declared `input` / `output` arrays; unknown values can be `null`    |
| `limits`, `price`, `features` | Provider-specific facts; unknown values must stay unknown           |
| `lifecycle`, `verification`   | Separate provider evidence and community observations               |

JavaScript and Python function/enum names differ; model field names do not:

| JavaScript                                                        | Python                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `getModels`, `getModelsByProvider`                                | `get_models`, `get_models_by_provider`                             |
| `ProviderId.OpenAI`, `ProviderId.DeepSeek`                        | `ProviderId.OPEN_AI`, `ProviderId.DEEP_SEEK`                       |
| `ProviderId.Google`, `ProviderId.Anthropic`                       | `ProviderId.GOOGLE`, `ProviderId.ANTHROPIC`                        |
| `ProviderId.OpenRouter`, `ProviderId.ZhipuAI`                     | `ProviderId.OPEN_ROUTER`, `ProviderId.ZHIPU_AI`                    |
| `ProviderId.SiliconFlow`, `ProviderId.Mistral`, `ProviderId.Groq` | `ProviderId.SILICON_FLOW`, `ProviderId.MISTRAL`, `ProviderId.GROQ` |
| `LocalApi.OpenAI`, `LocalApi.Ollama`                              | `LocalApi.OPEN_AI`, `LocalApi.OLLAMA`                              |
| `ApiProtocol.OpenAI`, `ApiProtocol.Gemini`, `ApiProtocol.Claude`  | `ApiProtocol.OPEN_AI`, `ApiProtocol.GEMINI`, `ApiProtocol.CLAUDE`  |
| `and`, `or`, `not`, `xor`                                         | `and_`, `or_`, `not_`, `xor_`                                      |
| `callClaude`, `checkFit`                                          | `call_claude`, `check_fit`                                         |

## Local models

Replace `my-installed-model` with the exact model ID served by your server. No discovery, verification, or model download is needed to construct the entry. The call itself requires a running server with that model available.

<!-- example: local-js -->

```js
import * as byokit from 'byokit';

const [model] = byokit.getModels({
  providerIds: [], // Return only the configured Local entry.
  local: [
    {
      endpoint: 'http://localhost:11434',
      api: byokit.LocalApi.Ollama,
      modelId: 'my-installed-model',
    },
  ],
});
const response = await byokit.call(model, 'Hello!', '');
console.log(response.choices[0].message.content);
```

<!-- example: local-python -->

```python
import byokit

model = byokit.get_models({
    "providerIds": [],
    "local": [{
        "endpoint": "http://localhost:11434",
        "api": byokit.LocalApi.OLLAMA,
        "modelId": "my-installed-model",
    }],
})[0]
response = byokit.call(model, "Hello!", "")
print(response["choices"][0]["message"]["content"])
```

For an OpenAI-compatible local server, use `LocalApi.OpenAI` / `LocalApi.OPEN_AI` and its base URL, such as `http://localhost:8000/v1`. The empty key means no authentication; pass the server's own key separately when required. `connection.baseUrl` and `connection.protocol` are resolved on the returned entry. Local IDs stay stable across list reordering and distinguish endpoint, protocol, and model.

The website's **Set up a local server** action offers URL, protocol, model ID, and **Use this model**. Saving sends no request. **Find models** and **Verify model** are separate, explicit actions; local results stay private.

## Reusable SDK clients

Use these when your app prefers `chat.completions.create()` or `messages.create()`. They reuse a key at a fixed endpoint. After selecting `model` and `key` as in the hosted examples:

<!-- example: client-js -->

```js
const client = new byokit.OpenAI({
  baseURL: model.connection.baseUrl,
  protocol: model.connection.protocol,
  apiKey: key,
  models: [model], // Optional metadata; also preserves the offering's call-support checks.
});
const response = await client.chat.completions.create({
  model: model.apiModelId,
  max_tokens: 128,
  messages: [{ role: byokit.Role.User, content: 'Hello!' }],
});
console.log(response.choices[0].message.content);
```

<!-- example: client-python -->

```python
client = byokit.OpenAI(
    base_url=model["connection"]["baseUrl"],
    protocol=model["connection"]["protocol"],
    api_key=key,
    models=[model],
)
response = client.chat.completions.create(
    model=model["apiModelId"],
    max_tokens=128,
    messages=[{"role": byokit.Role.USER, "content": "Hello!"}],
)
print(response.choices[0].message.content)
```

For Claude-style responses, use `byokit.Anthropic` and `client.messages.create(...)`, with the same endpoint/protocol fields and an explicit `max_tokens`. In JavaScript the result is `message.content`; in Python use `message.content` or `message["content"]`. `callClaude()` / `call_claude()` is the stateless equivalent. See [complete Claude examples and official SDK integration](https://github.com/staff-000/byokit/blob/main/docs/sdk.md).

A request's `model` string is sent unchanged. Without catalog metadata in `models`, a reusable client can send arbitrary API model IDs with unknown capabilities; it does not automatically select or verify those IDs.

## Discovery and filters

| List                             | Behavior                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `DEFAULT` / no arguments         | Maintained offering recommendations plus a Local setup entry                             |
| `COMPLETE`                       | Every imported offering, including deprecated, uncertain, unsupported, and media entries |
| `GLOBAL`, `CHINA`                | Editorial provider collections with default call-support/lifecycle filtering             |
| `OFFICIAL` / `OFFICIAL_FLAGSHIP` | First-party creator offerings; excludes aggregators and the generic Local entry          |

Pass `local: false` (Python: `"local": False`) to exclude Local setup entries. `DEFAULT` is the way to request curated current choices; do not approximate it by picking the newest release. Full coverage means the upstream catalog plus reviewed manual additions, not every model that exists.

<!-- example: filters-js -->

```js
import * as byokit from 'byokit';

const textModels = byokit.getModels(byokit.COMPLETE, {
  local: false,
  filters: {
    callable: true,
    lifecycle: byokit.any(byokit.Lifecycle.Live, byokit.Lifecycle.Uncertain),
    speciality: byokit.Speciality.General,
    tier: byokit.any(byokit.Tier.Workhorse, byokit.Tier.Flash),
  },
});
console.log(textModels.map((model) => model.apiModelId));

// Catalog discovery only; this does not enable image generation calls.
const imageModels = byokit.getModels(byokit.COMPLETE, {
  local: false,
  filters: { output: byokit.contain(byokit.Modality.Image) },
});
console.log(imageModels.map((model) => model.apiModelId));
```

Python accepts the same configuration dictionary using `True` / `False` and Python enum names, such as `byokit.Lifecycle.LIVE`, `byokit.Speciality.GENERAL`, and `byokit.Tier.FLASH`.

- `exact(...)` matches the exact set; `contain(...)` requires all requested values and permits extras; `any(...)` requires at least one; `exclude(...)` rejects matches. Boolean matchers compose them. Input arrays require all requested modalities; output arrays match the exact output set. Use `contain(Modality.Image)` to include image output alongside other outputs.
- `providerIds` is a top-level option. Other filters are inside `filters`. Catalog provider ID strings such as `"fireworks-ai"` are supported without enum membership; an unknown provider ID is rejected at runtime.
- `filters.callable` narrows adapter compatibility. `filters.lifecycle` narrows provider-backed lifecycle evidence and takes precedence over `includeDeprecated`. `Lifecycle` values are `Live`, `Outdated`, and `Uncertain` in JavaScript; there is no `Retired` enum member.
- `speciality` and `tier` are editorial classifications, not model IDs or availability checks. Both may be `Unknown`; tier also includes `Edge`. Do not invent enum members based on a model name.
- Price fields are token prices per million tokens; media pricing may be unknown. Unknown capabilities, limits, and prices are not zero or unsupported.
- Supported sorts include `ModelSort.PriceAscend`, `PriceDescend`, `AlphabeticalAscend`, `AlphabeticalDescend`, and `ProviderOrder`. Speed sort enum values are reserved and currently throw `NotImplementedError`.

See [filter types and enum definitions](https://github.com/staff-000/byokit/blob/main/packages/byokit/index.d.ts) for the full API surface.

## Errors and execution defaults

A failed attempt does not establish that a model is retired or unavailable for everyone. `CallError` exposes `code`, optional HTTP `status`, and normalized `attempt` metadata such as `reason`, `scope`, and retry guidance. Examples include quota exhaustion, invalid credentials, access restrictions, rate limits, network errors, and timeouts. No automatic retry occurs; honor provider retry guidance when implementing manual retries.

Execution defaults: non-streaming text, an output limit of 1,024 tokens capped by a known model limit, a 90-second timeout, and zero automatic retries. Use `max_tokens` in the request to set output length. JavaScript execution options are the fourth argument to `call()` or the second argument to client `.create()`; Python uses the fourth `call()` argument or client `options={...}`. JavaScript supports `signal` and `timeoutMs`; Python supports `cancel_event` and `timeout_ms`.

Budget/capability enforcement is optional. Use `checkBudget: true` / `check_budget=True` and supply token counts when needed. Offline `checkFit(model, { inputTokens, outputTokens })` (Python: `check_fit`) returns `status`, `certainty`, and `diagnostics`; status is `fits`, `exceeds`, or `unknown`. It does not return a `fits` boolean, and unknown metadata does not establish a fit.

## Custom endpoints

Use `appendModel(models, custom)` / `append_model(models, custom)` to append an explicitly configured endpoint. Required custom fields are `providerId`, `modelId`, `baseUrl`, and `protocol`; JavaScript custom provider IDs can use `customProviderId('acme')`. Pass the appended model to `call()` with that endpoint's own key. Appending runs offline and does not verify the endpoint or its capabilities. See [custom catalog integration](https://github.com/staff-000/byokit/blob/main/docs/custom-catalog.md).

## Build a smaller model list

Dynamic discovery loads the bundled catalog. For a fixed query, generate a smaller static list so the app does not need the full catalog at runtime. Sizes depend on the query; generation itself does not call providers.

Create `byok.config.json`:

```json
{
  "list": "default",
  "local": false,
  "filters": { "callable": true }
}
```

```sh
# JavaScript / TypeScript:
npx byokit build byok.config.json --out src/generated/models.js

# Python:
python -m byokit build byok.config.json --out app/generated_models.py
```

The JavaScript output exports `getModels()` and generated ID constants; the Python output exports `get_models()` and generated enums. Use a returned model directly with `call()`; do not assume an enum member or model ID will exist in every generated query. For JavaScript, import execution helpers from `byokit/client` to avoid including the bundled catalog.

## Credential safety

- Built-in execution keeps keys in memory and sends them directly to the configured endpoint, with redirects disabled. It does not persist keys or send telemetry. Never include keys in model metadata, URLs, reports, prompts, or source code.
- Authenticated remote calls require HTTPS. HTTP authentication is allowed on `localhost`, IPv4 loopback, and `::1`. Trusted development networks can explicitly opt in using `allowInsecureHttp: true` / `allow_insecure_http=True`; this exposes credentials to that network. The website has no such bypass.
- The website persists sanitized verification records in browser storage, not keys, prompts, or generated text. Sharing on GitHub is an explicit action. Keys do leave the browser for the selected provider's endpoint.
- The DOM picker's default credential store is in memory. A custom `credentialStore` receives raw keys and controls persistence. `credentialRef` is a namespace scoped by provider and known connection; changing connections clears the key field.
- Python clients block pickling and generic JSON attribute dumps of their credential holders. Serialize non-secret settings and recreate clients instead. Application callbacks, custom transports, debugging tools, and process-memory inspection remain the application's responsibility.

## Highlights and further documentation

BYOKit combines maintained recommendations, full catalog discovery, optional DOM/React pickers, reusable protocol clients, build-time query generation, and separate community verification evidence. Catalog snapshots are refreshed by the repository's scheduled workflow; installed packages use their bundled snapshot until updated. A fresh catalog is not proof of a successful call.

| Import / guide                                                                           | Purpose                                                   |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `byokit`                                                                                 | Public helpers, enums, queries, and calls                 |
| `byokit/catalog`                                                                         | Same helpers plus the default catalog data export         |
| `byokit/client`                                                                          | Execution/core helpers without the bundled catalog        |
| `byokit/enums`                                                                           | Enum constants                                            |
| `byokit/dom`, `byokit/react`                                                             | Optional model/key pickers                                |
| [SDK guide](https://github.com/staff-000/byokit/blob/main/docs/sdk.md)                   | Client interfaces, protocol adapters, official SDKs       |
| [Integration guide](https://github.com/staff-000/byokit/blob/main/docs/integration.md)   | UI callbacks, credential stores, local discovery          |
| [Verification guide](https://github.com/staff-000/byokit/blob/main/docs/verification.md) | Attempts, community evidence, speed measurements, sharing |

Maintainers: edit this root README, then run `npm run readme:sync` to update the npm and PyPI READMEs. `npm run readme:check` and executable documentation tests catch drift.

MIT license. Built on the open [Models.dev](https://models.dev) catalog. [Contribute](https://github.com/staff-000/byokit/blob/main/CONTRIBUTING.md) · [License](https://github.com/staff-000/byokit/blob/main/LICENSE)
