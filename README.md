# byokit

Get providers and models for your BYOK application. Refine the list with filters,
then call the model your user chooses. TypeScript/JavaScript and Python supported.

[Try the JavaScript playground](https://staff-000.github.io/byokit/#playground) · [Verify models](https://staff-000.github.io/byokit/verification.html) · [Contribute](CONTRIBUTING.md)

## Get models

```ts
import * as byokit from '@staff-000/byokit/catalog';

const models = byokit.getModels();
// One LIVE model per default provider, plus a Local setup entry.

byokit.getModels(byokit.COMPLETE); // All LIVE offerings from supported providers
byokit.getModels(byokit.GLOBAL); // One LIVE model per supported provider + Local
byokit.getModels(byokit.CHINA); // China-provider shortlist + Local
```

Discovery runs offline. The bundled catalog comes from a pinned Models.dev
snapshot; update it and release your app to refresh model choices. Packages are
currently repository workspaces, not published to npm/PyPI.

Models are sorted alphabetically by model name by default. Sort across hosted
results before applying `limit`:

```ts
byokit.getModels(byokit.COMPLETE, { sort: byokit.ModelSort.PriceAscend }); // Input price: low → high
byokit.getModels(byokit.COMPLETE, { sort: byokit.ModelSort.PriceDescend }); // Input price: high → low
byokit.getModels(byokit.COMPLETE, { sort: byokit.ModelSort.SpeedDescend }); // Tokens/sec: high → low
```

Unknown values and non-USD prices sort last; ties use alphabetical order. Local stays appended.
Default/Global/China first pick their recommended model per provider; use COMPLETE
or `providerIds` to sort every matching offering. `ModelSort.ProviderOrder` retains
provider order and existing per-provider preference ranking.

## Call a model

```ts
const [model] = byokit.getModels({
  providerIds: [byokit.ProviderId.DeepSeek],
  limit: 1,
  local: false,
});
if (!model?.connection) throw new Error('No configured model');

const client = new byokit.OpenAI({
  baseURL: model.connection.baseUrl,
  apiKey,
});
const completion = await client.chat.completions.create({
  model: model.apiModelId,
  messages: [{ role: byokit.Role.User, content: 'Hello' }],
});
console.log(completion.choices[0].message.content);
// Example: Hello! — actual model output varies.
```

Configure the endpoint and key once; reuse the client for multiple requests and
model IDs at that endpoint. `defaultHeaders` supports attribution headers such as
`HTTP-Referer` and `X-OpenRouter-Title`. Keys stay in client memory; byokit never
persists them to disk, browser storage, logs, or telemetry.

Use `new byokit.Anthropic({baseURL, apiKey})` and `client.messages.create(...)`
for Claude-style requests/responses. Python uses `OpenAI` / `Anthropic`,
`base_url`, `api_key`, and `default_headers`; responses support attribute and dict
access. [Full examples, official SDK integration, and migration](docs/sdk.md).

OpenAI and Anthropic clients default to their named wire protocol. An arbitrary
base URL must speak that protocol. Byokit's explicit `protocol` extension supports
native Gemini/Ollama and cross-format adapters; official SDKs do not provide this
translation. Clients implement non-streaming text, system messages, sampling, and
tools; unsupported features fail explicitly. Tools are returned for your app to run.

Defaults: 1,024 output tokens, 90-second timeout, no retries. Optional `models`
constructor metadata enables known-limit/capability checks for those exact IDs;
unknown metadata produces warnings. Set `runtimeChecks: false` to skip fit checks;
request and endpoint validation remain. Browser calls require provider CORS support.

`byokit.call(model, 'Hello', apiKey)` and `callClaude()` remain stateless helpers.
Legacy callback factories and the per-request `Byokit` client are deprecated and
continue to work. `getModels()` always returns an array: `limit: 1` caps hosted
results, `local: false` prevents a Local setup entry, and an empty result is possible.

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

| Filter                                          | Options                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `providerIds`, `limit`, `local`                 | Provider selection, hosted result cap, local endpoints                                                                                     |
| `deployment`, `origin`                          | Hosted/local/self-hosted; known origin                                                                                                     |
| `includeTags`, `excludeTags`                    | All included tags required; any excluded tag removes a result                                                                              |
| `input`, `output`, `fileFormats`                | Text/image/audio/video/embedding; document formats                                                                                         |
| `requiredFeatures`                              | Function calling, parallel tools, tool choice/schema, prompt caching, JSON/structured output, system/developer messages, thinking controls |
| `minContextTokens`                              | Minimum context window                                                                                                                     |
| `maxInputPricePerM`, `maxOutputPricePerM`       | Maximum USD per million tokens                                                                                                             |
| `openWeights`, `commercialUse`, `maxParameters` | Weight availability, licensing, model size                                                                                                 |
| `minTokensPerSecond`, `maxTimeToFirstTokenMs`   | Known speed and latency measurements                                                                                                       |
| `lifecycle`, `includeDeprecated`                | LIVE by default; optional OUTDATED/UNCERTAIN                                                                                               |
| `popularity`                                    | POPULAR / NOT_POPULAR / UNCERTAIN from sourced usage ranks                                                                                 |
| `verified`, `verifiedBy`, `verifiedWithinDays`  | Community call reports and freshness                                                                                                       |

Except the first row, these fields belong inside `filters`. Use exported enums
such as `byokit.Modality.Image`, `byokit.FeatureName.JsonSchema`, and
`byokit.Lifecycle.Outdated`. Custom tags use `byokit.customTag('usecase:coding')`.
Unknown metadata fails requirements by default; `unknownPolicy` can explicitly
include it. Local entries are appended without hosted metadata filtering.
`prefer.features` and `prefer.lowerCost` guide per-provider shortlist selection;
use `ModelSort.ProviderOrder` to retain that ranking in returned lists.

`sort` is a top-level enum option: `ModelSort.AlphabeticalAscend` (default),
`AlphabeticalDescend`, `PriceAscend`, `PriceDescend`, `SpeedAscend`,
`SpeedDescend`, or `ProviderOrder`. Unknown prices/speeds stay last in either
direction. Legacy `Alphabetical`, `Price`, and `Speed` names still work.

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
model = models[0]
client = byokit.OpenAI(base_url=model["connection"]["baseUrl"], api_key=api_key)
result = client.chat.completions.create(
    model=model["apiModelId"],
    messages=[{"role": byokit.Role.USER, "content": "Hello"}],
)
print(result.choices[0].message.content)
```

Install locally with `python -m pip install ./packages/python`.
Python offers `Anthropic`, `call_claude()`, `append_model(models, custom)`,
and the equivalent `ModelSort.ALPHABETICAL_ASCEND`, `PRICE_ASCEND`,
`PRICE_DESCEND`, `SPEED_ASCEND`, `SPEED_DESCEND`, and `PROVIDER_ORDER` options.

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
