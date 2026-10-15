# byokit

Get providers and models for your BYOK application. Refine the list with filters,
then call the model your user chooses. TypeScript/JavaScript and Python supported.

[Try the website](https://staff-000.github.io/byokit/) · [Verify models](https://staff-000.github.io/byokit/verification.html) · [Contribute](CONTRIBUTING.md)

## Get models

```ts
import * as byokit from '@byokit/core/catalog';

const models = byokit.getModels();
// One LIVE model per default provider, plus a Local setup entry.

byokit.getModels(byokit.COMPLETE); // All LIVE offerings from supported providers
byokit.getModels(byokit.GLOBAL);   // One LIVE model per supported provider + Local
byokit.getModels(byokit.CHINA);    // China-provider shortlist + Local
```

Discovery runs offline. The bundled catalog comes from a pinned Models.dev
snapshot; update it and release your app to refresh model choices. Packages are
currently repository workspaces, not published to npm/PyPI.

Models are sorted alphabetically by model name by default. Sort across hosted
results before applying `limit`:

```ts
byokit.getModels(byokit.COMPLETE, { sort: byokit.ModelSort.Price }); // Input price: low → high
byokit.getModels(byokit.COMPLETE, { sort: byokit.ModelSort.Speed }); // Tokens/sec: high → low
```

Unknown values and non-USD prices sort last; ties use alphabetical order. Local stays appended.
Default/Global/China first pick their recommended model per provider; use COMPLETE
or `providerIds` to sort every matching offering. `ModelSort.ProviderOrder` retains
provider order and existing per-provider preference ranking.

## Call a model

```ts
const models = byokit.getModels({
  providerIds: [byokit.ProviderId.DeepSeek],
  limit: 1,
  local: false,
});
const model = models[0];
if (!model) throw new Error('No matching model');

const result = await byokit.call(model, 'Hello', api_key);
console.log(result.choices[0].message.content);
// Example: Hello! — actual model output varies.
```

`getModels()` always returns an array. `limit: 1` caps hosted results at one;
it can still return none. `local: false` prevents an extra Local entry.
Without the limit, a provider query returns all matching models. In an app,
let the user select one of them.

For SDK-style calls:

```ts
const client = byokit.openAI({ model, apiKey: () => api_key });
const completion = await client.chat.completions.create({
  messages: [{ role: byokit.Role.User, content: 'Hello' }],
});

// Claude-compatible format, across supported providers:
const message = await byokit.callClaude(model, 'Hello', api_key);
console.log(message.content); // [{ type: 'text', text: 'Hello!' }]
```

Calls support non-streaming text, system messages, sampling parameters and tools.
Tools are returned for your app to execute. Unsupported features are rejected.
Keys are used transiently and never stored by byokit. Browser calls require
provider CORS support. Defaults: 1,024 output tokens, 90-second timeout, no retries.
An optional fourth argument accepts `signal`, `timeoutMs`, and `runtimeChecks`
(default true). Disabling model-fit checks retains request/endpoint validation.

## Filter the list

```ts
const models = byokit.getModels(byokit.COMPLETE, {
  local: false,
  filters: {
    requiredFeatures: [byokit.FeatureName.FunctionCalling],
    minContextTokens: 32_000,
    maxInputPricePerM: 2,
    excludeTags: [byokit.Tag.OriginChina, byokit.Tag.PricePremium],
  },
});
```

Global includes China providers. Use exclusions when you want to omit them.
`OriginChina` excludes entries tagged `origin:cn` on their provider, model, or
offering; unknown origin is not a guarantee of exclusion. Origin is not hosting
location or network availability.

| Filter | Options |
|---|---|
| `providerIds`, `limit`, `local` | Provider selection, hosted result cap, local endpoints |
| `deployment`, `origin` | Hosted/local/self-hosted; known origin |
| `includeTags`, `excludeTags` | All included tags required; any excluded tag removes a result |
| `input`, `output`, `fileFormats` | Text/image/audio/video/embedding; document formats |
| `requiredFeatures` | Function calling, parallel tools, tool choice/schema, prompt caching, JSON/structured output, system/developer messages, thinking controls |
| `minContextTokens` | Minimum context window |
| `maxInputPricePerM`, `maxOutputPricePerM` | Maximum USD per million tokens |
| `openWeights`, `commercialUse`, `maxParameters` | Weight availability, licensing, model size |
| `minTokensPerSecond`, `maxTimeToFirstTokenMs` | Known speed and latency measurements |
| `lifecycle`, `includeDeprecated` | LIVE by default; optional OUTDATED/UNCERTAIN |
| `popularity` | POPULAR / NOT_POPULAR / UNCERTAIN from sourced usage ranks |
| `verified`, `verifiedBy`, `verifiedWithinDays` | Community call reports and freshness |

Except the first row, these fields belong inside `filters`. Use exported enums
such as `byokit.Modality.Image`, `byokit.FeatureName.JsonSchema`, and
`byokit.Lifecycle.Outdated`. Custom tags use `byokit.customTag('usecase:coding')`.
Unknown metadata fails requirements by default; `unknownPolicy` can explicitly
include it. Local entries are appended without hosted metadata filtering.
`prefer.features` and `prefer.lowerCost` guide per-provider shortlist selection;
use `ModelSort.ProviderOrder` to retain that ranking in returned lists.

`sort` is a top-level enum option: `ModelSort.Alphabetical` (default), `Price`, `Speed`, or `ProviderOrder`.

Each model returns its provider, `apiModelId`, `connection` (URL/protocol),
capabilities, modalities, limits, prices, tags, logos, lifecycle/popularity
evidence, and contributor verification records. `releaseDate` and `speed` are
included where known; current catalog speed measurements are unknown.
LIVE is listing evidence, not an account-access guarantee. Community verification
means a contributor reported a successful call for that exact provider/model.

## Append your own model

```ts
const models = byokit.appendModel(byokit.getModels(), {
  providerId: byokit.customProviderId('acme'),
  providerName: 'Acme',
  modelId: 'my-model',
  baseUrl: 'https://api.example.com/v1',
  protocol: byokit.ApiProtocol.OpenAI,
});
// models.at(-1) can be passed to byokit.call().
```

Returns a new list; never changes the catalog or stores a key. Custom entries are
unverified with unknown capabilities/limits unless you supply limits. Duplicate
offering IDs are rejected. Appending is explicit and happens after query filters,
sorting, and limits. [Add providers/models to the shared catalog](docs/custom-catalog.md).

## Python

```python
import byokit

models = byokit.get_models({
    "providerIds": [byokit.ProviderId.DEEP_SEEK], "limit": 1, "local": False,
})
if not models:
    raise ValueError("No matching model")
result = byokit.call(models[0], "Hello", api_key)
print(result["choices"][0]["message"]["content"])
```

Install locally with `python -m pip install ./packages/python`.
Python offers `call_claude()`, `OpenAI`, `Anthropic`, `append_model(models, custom)`,
and `ModelSort.ALPHABETICAL` / `PRICE` / `SPEED` / `PROVIDER_ORDER` too.

## Contribute

Edit provider metadata and model tags in [catalog/overlays.json](catalog/overlays.json).
Refresh the pinned source using the [catalog guide](CONTRIBUTING.md#regenerate-and-validate).
Run `npm install` and `npm run verify` before proposing a change.
[CONTRIBUTING.md](CONTRIBUTING.md) covers tags and call verification.
Successful website checks can be shared through GitHub Issues; published records
attribute the contributor and award a Model Verifier badge. API keys never enter reports.

Build-time budgets: declare `budget.maxInputTokens` and `maxOutputTokens`, then
run `byokit check config.json`. Known limit violations fail; missing/unknown
limits warn. [Design](docs/design.md) · [Integration](docs/integration.md) · [Verification](docs/verification.md)

## Nightly catalog refresh

GitHub Actions fetches Models.dev daily at **08:23 UTC**, merges manual additions,
validates, and uploads a candidate containing the catalog and generated JS/Python
data. It preserves verification reports. Download and review the artifact before
committing/releasing; production and package releases are explicit.
[Workflow](.github/workflows/catalog-review.yml) · [Maintenance guide](docs/custom-catalog.md)

## Thanks

Built on [Models.dev](https://models.dev). Thank you to its maintainers and
contributors for the catalog that makes byokit possible. [MIT license](LICENSE).
