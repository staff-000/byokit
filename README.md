# byokit

**Get a list of providers and models for your BYOK application, then refine it into a short list with your filters.**

Filter by region preset, capabilities, price, context window, local execution,
and contributor-tested calls. Each result includes the metadata needed to build
an interface or call a selected model. The demo UI is optional.

[Website & model explorer](https://staff-000.github.io/byokit/) ·
[Verification tracker](docs/verification.md) ·
[Contributing](CONTRIBUTING.md)

## Start with one API call

In this repository, run `npm install` first. Packages are not published yet.

```js
import * as byokit from '@byokit/core/catalog';

const models = byokit.getModels();
console.log(models.map(model => model.provider.id));
```

Expected output:

```json
["openai", "anthropic", "google", "openrouter", "deepseek", "local"]
```

The default is one LIVE hosted model per provider: OpenAI, Anthropic (Claude),
Google (Gemini), OpenRouter, and DeepSeek, followed by one Local setup entry.
Providers without a matching LIVE model are omitted. Every result contains its
provider, API model ID, capabilities, limits, prices, and evidence; the example
prints just provider IDs.

```js
byokit.getModels();                       // Small default list + Local
byokit.getModels(byokit.COMPLETE);        // Every LIVE hosted offering in this catalog + Local
byokit.getModels(byokit.CHINA);           // One LIVE model per China provider + Local
byokit.getModels(byokit.NON_CHINA);       // One LIVE model per non-China provider + Local

// All LIVE offerings from a specific provider:
byokit.getModels({ providerIds: [byokit.ProviderId.DeepSeek] });

// A shortcut plus extra options:
byokit.getModels(byokit.COMPLETE, { local: false, limit: 20 });
```

COMPLETE covers all **supported providers in the bundled snapshot**, currently
nine hosted providers plus local adapters. It is not every provider worldwide.
The importer retains every text-output offering for these providers; COMPLETE
has no per-provider or overall limit unless you specify one. Default/region
queries choose one model per provider, so the first provider cannot fill the list.
Use `ui.maxModelsPerProvider` to request more per provider. `limit` caps hosted
results; the Local entry is appended afterward. `local: false` removes Local.
Existing `{ preset: byokit.Preset.NonChina }` and detailed filters still work.

Queries run offline, need no API key, and make no network requests. LIVE means
recent evidence lists this model at this provider; it does not guarantee access
for your account. The result states whether the evidence is a provider source or
a Models.dev catalog listing. To generate a response, use `byokit.call(model, input, key)`.

Python has the same shortcuts and JSON field names:

```bash
python -m pip install ./packages/python
```

```python
import byokit

models = byokit.get_models()
all_models = byokit.get_models(byokit.COMPLETE)
china_models = byokit.get_models(byokit.CHINA)
print([model['provider']['id'] for model in models])
```

Run the JavaScript example: `node examples/query.mjs`.

## Call the selected model

Choose a model, supply your input and key, and make one call:

```ts
import * as byokit from '@byokit/core/catalog';

const [model] = byokit.getModels({
  providerIds: [byokit.ProviderId.DeepSeek],
});
const result = await byokit.call(model, 'Hello', key);
console.log(result.choices[0].message.content);
```

Expected response (provider-generated values vary):

```json
{
  "id": "…",
  "object": "chat.completion",
  "model": "deepseek-flash",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "Hello!" },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6 }
}
```

Prefer Claude's Messages format? The same selected model works:

```ts
const message = await byokit.callClaude(model, 'Hello', key);
console.log(message.content);
// [{ type: 'text', text: 'Hello!' }]
```

`call()` accepts OpenAI-style messages and returns a Chat Completion.
`callClaude()` accepts Claude-style messages and returns a Message. Adapters
translate supported fields to the selected provider's native API. These are
compatible subsets, not replacements for every provider SDK feature.

Python uses the same model metadata and corresponding functions:

```python
import byokit

model = byokit.get_models({
    "providerIds": [byokit.ProviderId.DEEP_SEEK],
})[0]
result = byokit.call(model, "Hello", key)
print(result["choices"][0]["message"]["content"])

message = byokit.call_claude(model, "Hello", key)
print(message["content"])
```

### Parameters and runtime checks

```ts
const result = await byokit.call(model, {
  messages: [{ role: byokit.Role.User, content: 'Summarize this…' }],
  max_completion_tokens: 1024,
}, key, {
  runtimeChecks: true,  // Default; false skips model-fit checks
  inputTokens: 2000,   // Optional declared/countable input budget
  timeoutMs: 90_000,
  signal: controller.signal,
  onWarning: diagnostic => console.warn(diagnostic.code),
});
```

Python's fourth argument uses `runtime_checks`, `input_tokens`, `overhead_tokens`,
`timeout_ms`, `cancel_event` (a `threading.Event`), and `on_warning`.

The default output budget is 1,024 tokens, capped by a known smaller model limit.
Runtime checks reject known excessive budgets and unsupported capabilities;
unknown limits or unavailable input counts produce warnings. Supply a measured
input token count when you need a reliable context check. Disabling runtime
checks retains essential request-format and endpoint validation.

Supported: non-streaming text, system messages, sampling parameters, function
tool definitions, tool calls and tool results. Tools are returned for your
application to execute. Unsupported fields, streaming, multimedia and native
thinking blocks/signatures are rejected explicitly. Provider/model-specific
restrictions can still be rejected by the provider. No retries or model
substitution happen automatically.

Each model includes `connection: { baseUrl, protocol }` (protocol uses
`byokit.ApiProtocol`). Local entries need a configured URL and served model ID;
pass an empty key for an unauthenticated local server. Custom providers may supply
an explicit connection. Calls use the offering's `apiModelId`, not its family ID.

Keys are per-call arguments: the call API never stores, caches, logs, or returns
them. Authentication headers handle the key transiently while the request runs.
Your application owns any credential storage; never embed production keys in a
public website. Browser calls also depend on provider CORS and local-network
permissions. Calls may consume provider quota, including canceled calls.

Runnable examples: `node examples/call-model.mjs` or
`PYTHONPATH=packages/python/src python3 examples/call_model.py`, with
`DEEPSEEK_API_KEY` supplied by your environment. Packages are not published yet.

### Build-time budgets

Declare `budget.maxInputTokens` and `budget.maxOutputTokens` in your byokit build
configuration (or individual tasks). `byokit check config.json` fails known
limit violations and warns when budgets or model limits are missing; `--strict`
also fails warnings. TypeScript validates parameter names/types, not arbitrary
numeric relationships. Build checks are offline and consume no quota.

## Filter the list

```js
import * as byokit from '@byokit/core/catalog';

const models = byokit.getModels({
  preset: byokit.Preset.NonChina,
  limit: 10,
  filters: {
    deployment: [byokit.Deployment.Hosted, byokit.Deployment.Local],
    input: [byokit.Modality.Text, byokit.Modality.Image],
    output: [byokit.Modality.Text],
    requiredFeatures: [byokit.FeatureName.FunctionCalling],
    minContextTokens: 32000,
    maxInputPricePerM: 2,
  },
  prefer: { lowerCost: true },
});
```

All hosted requirements must match. Local entries are appended without metadata filtering. Unknown hosted values fail requirements by default;
`unknownPolicy: byokit.UnknownPolicy.Include` explicitly allows unknown metadata. Conditional support
still does not meet an unconditional feature requirement. Empty hosted results mean no hosted
models meet the rules; byokit never relaxes a rule to fill the list.

| Option | What it selects |
|---|---|
| `preset` | `non-china` audience shortlist (other presets remain available) |
| `providerIds` | Explicit provider IDs, overriding the preset shortlist |
| `limit` | Cap hosted results before appending Local; maximum explicit limit 1,000 |
| `filters.deployment` | `hosted`, `local`, or `self-hosted` |
| `filters.origin` | Known model-maker origin, such as `cn` or `us` |
| `filters.input`, `filters.output` | Required modalities: text, image, audio, video, embedding |
| `filters.fileFormats` | Required file formats, such as `pdf` |
| `filters.requiredFeatures` | Features that must have `supported` status |
| `filters.minContextTokens` | Minimum advertised context window |
| `filters.maxInputPricePerM`, `maxOutputPricePerM` | Maximum USD price per million tokens in the shipped catalog |
| `filters.openWeights` | Whether model weights are available |
| `filters.commercialUse` | `allowed`, `restricted`, or `unknown`; distinct from open weights |
| `filters.maxParameters` | Maximum total parameter count, when known |
| `filters.maxTimeToFirstTokenMs`, `minTokensPerSecond` | Sourced speed measurements, when available |
| `filters.includeTags`, `excludeTags` | Match provider/model/offering tags; all included tags required, any excluded tag removes a result |
| `filters.lifecycle` | Defaults to LIVE for hosted entries; explicitly request Outdated/Uncertain for inspection |
| `filters.popularity` | `byokit.Popularity.Popular`, `.NotPopular`, `.Uncertain` |
| `filters.includeDeprecated` | Include deprecated entries present in your catalog; default false |
| `filters.verified`, `verifiedBy`, `verifiedWithinDays` | Filter contributor reports; explained below |
| `prefer.features` | Rank models with these features higher without excluding others |
| `prefer.lowerCost` | Rank by lower input-token price within each provider |

Provider order follows the preset or `providerIds`; ranking happens within each
provider. For a price comparison across providers, sort the returned list yourself.
The non-China preset selects providers based outside China plus local runtimes.
Those providers may serve models originating elsewhere; use origin filters when
the underlying model maker matters. Presets are recommendations for an audience, not guarantees of network
access or data residency. Origin is separate from hosting. Speed and model size
remain unknown until a source or measurement supplies them.

Feature names include `functionCalling`, `parallelTools`, `forcedToolChoice`,
`strictToolSchema`, `promptCaching`, `jsonMode`, `jsonSchema`, `strictJsonSchema`,
`systemMessages`, `developerMessages`, `thinking`, `thinkingDisable`,
`thinkingBudget`, and `thinkingEffort`.

## Catch API typos at build time

Use enum members for fixed API choices. With TypeScript strict checking enabled, the compiler rejects raw literals and unknown
members before deployment:

```ts
byokit.getModels({filters:{input:[byokit.Modality.Image]}}); // valid
// TypeScript error: raw string is not a Modality enum member
byokit.getModels({filters:{input:['image']}});
// TypeScript error: this enum member does not exist
byokit.getModels({filters:{requiredFeatures:[byokit.FeatureName.FunctionCallling]}});
```

The same constants are available to JavaScript and as Python enums. JavaScript/JSON
inputs are validated at runtime; Python type checkers use the typed query configuration.
JSON catalogs/overlays still store enum values as text. Model IDs, URLs, and contributor
notes are open-ended data. Use `byokit.customProviderId`, `byokit.customCountryCode`, `byokit.customFileFormat`,
`byokit.customTag`, or `byokit.githubContributor` for explicit custom query values.

Fixed enum definitions live in `spec/enums.json`; run `npm run enums:generate` after changing them.

`npm run build` additionally emits runtime model/offering enums and matching TS types
in `examples/generated/catalog.json.ids.js`. These describe the pinned build snapshot:

```ts
import * as byokit from './examples/generated/catalog.json.ids.js';
const id=OfferingId['deepseek/deepseek-flash']; // when included in that build
```

## What each model returns

A result represents one model served by one provider. The same underlying model
served by two providers is two results because prices and features may differ.

| Field | Contents |
|---|---|
| `id`, `name` | Stable offering ID and display name |
| `apiModelId` | Model ID sent to the selected provider |
| `connection` | Provider base URL and native API protocol; null if not configured |
| `provider` | Provider ID, name, docs, authentication requirement, deployment type |
| `model`, `family` | Underlying model, family, openness, license, parameter counts |
| `modalities`, `fileFormats` | Supported input/output types and document formats |
| `features` | Status, source, and optional details for each capability |
| `limits` | Context, input, output limits and context-accounting rule |
| `price` | Currency, input/output/cache prices per million tokens, optional tiers |
| `speed`, `hosting` | Known measurements/location or explicit unknown fields |
| `tags` | Derived labels and contributor-maintained custom tags |
| `logos` | Provider and family asset metadata, or null; family may use a provider fallback |
| `provenance` | Source and review date for offering metadata |
| `verification` | Contributor call reports, latest text-call result, and freshness |

For example:

```js
const model = models[0];
model.apiModelId;                      // 'deepseek-flash'
model.limits.context;                 // 1000000 in this snapshot
model.features.functionCalling.status; // 'supported' from catalog metadata
model.verification.status;            // 'unverified': no submitted call report
```

Capabilities use `supported`, `unsupported`, `conditional`, or `unknown`. Unknown
numeric facts use null. Metadata support does not establish that your account has
access, and a successful text call does not verify tools or strict JSON output.
Logos are metadata only; queries never download images or send credentials.

## Which calls have contributors verified?

```js
import * as byokit from '@byokit/core/catalog';

const models = byokit.getModels({
  filters: {
    verified: true,
    verifiedBy: byokit.githubContributor('alice'),
    verifiedWithinDays: 30,
  },
});
```

The current catalog ships **no contributor verification claims**, so this returns
an empty list until actual reports are contributed.

Each report identifies the exact provider/model pairing, contributor, UTC test
time, adapter/version, checks, result, and public evidence. `verification.records`
returns all matching reports; `verification.latest` is the newest eligible
`textGeneration` report. `verification.status` is `passed`, `failed`, `stale`, or
`unverified`. The default freshness window is 90 days. Future-dated reports do not
establish verification. A later failed call supersedes an earlier successful one.

`verifiedBy` restricts reports to that contributor. Without it, the newest text
report across contributors determines status. Setting `verified: false` selects
results without a current passing report. Set `asOf` to a UTC ISO timestamp for
reproducible checks. Reports are contributor observations reviewed through pull
requests, not proof of identity, current entitlement, or universal availability.

### Exclude tags and select live, popular models

```ts
import * as byokit from '@byokit/core/catalog';

const models = byokit.getModels({
  preset: byokit.Preset.NonChina,
  filters: {
    excludeTags: [byokit.Tag.PricePremium, byokit.customTag('usecase:experimental')],
    lifecycle: [byokit.Lifecycle.Live],
    popularity: [byokit.Popularity.Popular],
  },
});
```

`excludeTags` removes a result if **any** listed tag occurs on its provider,
model, or offering. It wins over `includeTags`. Tags are exact matches, not
wildcards. Use `byokit.Tag` for built-in labels and `byokit.customTag()` for
other namespaced labels. You can also exclude `byokit.Tag.LifecycleOutdated`
while keeping entries whose lifecycle is uncertain.

Each result includes `lifecycle: { status, evidence }` and
`popularity: { status, evidence }`, plus equivalent `lifecycle:*` and
`popularity:*` tags. These refer to the **model at this provider**, since its
availability and usage can differ between providers.

| Label | Meaning |
|---|---|
| LIVE | Recent provider evidence or an explicitly dated Models.dev listing names this offering as active |
| OUTDATED | Dated evidence explicitly identifies this offering as deprecated, retired, or superseded |
| UNCERTAIN lifecycle | Evidence missing, future-dated, or more than 90 days old |
| POPULAR | Rank is in the top 10% (`rank <= ceil(population × 0.1)`) of a cited usage dataset |
| NOT_POPULAR | Ranked outside that dataset's top 10%; does not mean globally unpopular |
| UNCERTAIN popularity | No usable ranking, future-dated window, or window ended more than 30 days ago |

Popularity evidence includes `metric` (requests, tokens, or downloads), `rank`,
`population`, `scope`, `windowStart`, `windowEnd`, and an HTTPS `source`.
Only compare rankings within the same metric, population, platform, and window.
Quality benchmarks, picker order, model age, and GitHub stars are not usage metrics.
A truncated leaderboard cannot establish the full population or label absent models
NOT_POPULAR. Local downloads indicate downloads, not active installations.

The bundled snapshot includes dated Models.dev **catalog-listing** evidence per
provider/offering; it has no sourced popularity rankings, so popularity is
UNCERTAIN and the strict popular-model example returns only the Local setup
entry. Add `local: false` for hosted results only. Provider evidence can override
listings. `lifecycle.evidence.basis` distinguishes `catalog-listing` from `provider`.
Release `status` and contributor `verification` remain separate. A provider's
retired model can remain LIVE on OpenRouter; labels never transfer between them.
LIVE is the default hosted filter; use an explicit lifecycle array to inspect
OUTDATED or UNCERTAIN. Deprecated entries additionally need `includeDeprecated`.
Unknown-policy relaxation does not override lifecycle filters. Queries evaluate
freshness when called; use `asOf` for reproducible builds. Catalog imports preserve
recorded observation times instead of making evidence fresh on every build.

## Append your local server

```ts
import * as byokit from '@byokit/core/catalog';

const models = byokit.getModels({
  local: [{
    endpoint: 'http://localhost:8000/v1',
    api: byokit.LocalApi.OpenAI,
    modelId: 'my-served-model',
  }],
});
```

The configured entry replaces the empty Local setup entry and is appended after
hosted results. Tag, price, popularity, capability, and lifecycle filters apply
to hosted entries. `local: false`, `local: []`, or a hosted-only deployment filter
removes local entries. Explicit hosted `providerIds` also omit the placeholder;
providing `local` explicitly appends your server to any provider list.

URL + API protocol + model ID is enough to configure the host application's
client. Ollama, vLLM, and llama.cpp offer OpenAI-compatible servers; use
`byokit.LocalApi.OpenAI` and their `/v1` base URL. Ollama's native API uses
`byokit.LocalApi.Ollama` and its root URL. Protocol compatibility does not prove
support for tools, vision, structured output, or a context size. These stay
unknown until your application checks them. A Local setup entry is not marked
LIVE and is not a hosted model.

Optional discovery is explicit and makes a network request:

```ts
import * as byokit from '@byokit/core/catalog';
import * as byokitLocal from '@byokit/dom/local';

const installed = await byokitLocal.discoverLocal('http://localhost:8080/v1', {
  api: byokit.LocalApi.OpenAI,
});
// Pick the served model, or offer a selector when the server returns several.
const models = byokit.getModels({
  local: installed.slice(0, 1).map(model => ({
    endpoint: model.local!.endpoint,
    api: model.local!.api,
    modelId: model.apiModelId,
  })),
});
```

The `/v1/models` endpoint can report more than one served model. Native Ollama
`/api/tags` lists installed models, while `runningOnly: true` uses `/api/ps` for
currently loaded models. Zero discovery results means no configured local model;
byokit never invents a model ID or selects another model silently.

## Contribute: update model tags or capabilities

1. Run `npm install` from the repository root.
2. Edit **`catalog/overlays.json`**, not generated catalog files.
3. Add the exact offering ID under `offerings`, or an underlying model ID under
   `models`. Include a source and review date.
4. Regenerate the catalog, run checks, and submit the changes with their evidence.

Example overlay entry (add it to the existing `offerings` object):

```json
"deepseek/deepseek-flash": {
  "source": "https://provider.example/official-capability-docs",
  "reviewedAt": "2026-10-12",
  "fields": {
    "tags": ["usecase:summarization"],
    "features": {
      "functionCalling": {
        "status": "supported",
        "source": "https://provider.example/official-capability-docs"
      }
    }
  }
}
```

This is a template: replace the source and claim with real evidence. Change a
structured feature field to update capability tags. Do not manually add
`cap:functionCalling` while leaving that feature unsupported.

| Tag prefix | How it is updated |
|---|---|
| `cap:` | Derived from supported feature fields |
| `input:`, `output:` | Derived from modalities |
| `context:` | Derived from the context limit |
| `price:` | Derived from USD input/output prices |
| `weights:`, `origin:` | Derived from underlying model fields |
| `deployment:` | Derived from deployment type |
| `usecase:` or your own namespace | Add to `fields.tags` with supporting evidence |

Derived prefixes are reserved and recomputed. Custom `fields.tags` replaces the
previous custom tag list, so keep existing custom tags you want to retain.
Price labels use 1,000 input + 1,000 output tokens: budget ≤ $0.002, mid ≤ $0.02,
premium above that. A zero token rate does not imply a free service.

```bash
curl --fail --location https://models.dev/api.json -o /tmp/models.json
node scripts/import-catalog.mjs /tmp/models.json
npm test
npm run test:python
npm run typecheck
npm run typecheck:python
npm run check
```

The importer updates the catalog, bundled JS/Python snapshots, lockfile and change
report. Review those diffs together. Missing overlay targets fail import. Identity,
authentication, and endpoint fields cannot be overridden.

To change a preset, edit `providers.<id>.presets` in the same overlay. New provider
integration also needs the provider in the upstream snapshot. To change code:
JS/TS behavior lives in `packages/core`, Python behavior in `packages/python`,
UI behavior in `packages/dom` and `packages/react`. Add tests for changed behavior;
cross-language changes must pass the shared conformance checks. More detail:
[contributor guide](CONTRIBUTING.md).

## Contribute: record a tested model call

Copy `catalog/verification.example.json`, replace every placeholder, and append
the record to **`catalog/verifications.json`** after running an actual test:

```json
{
  "id": "alice-deepseek-text-2026-10-12",
  "offeringId": "deepseek/deepseek-flash",
  "contributor": "github:alice",
  "checkedAt": "2026-10-12T12:00:00Z",
  "result": "passed",
  "checks": ["textGeneration"],
  "adapter": "your-provider-adapter@version",
  "evidence": "https://github.com/alice/example/blob/commit/model-test.md"
}
```

This is an example, not an actual verification. Evidence should explain the test,
expected response and observed result. Include only checks actually exercised;
record failed calls too. Never include keys, authorization headers, private prompts
or personal data. Extra fields such as `apiKey` are rejected.

Regenerate and test using the commands above. Reviewers should compare the claimed
contributor with the pull request author and inspect evidence; the library cannot
authenticate a GitHub handle merely because it appears in JSON. Reports remain
separate from capability metadata; adding a passing report never upgrades a tag.

## Optional tools and demo

- **Context checks:** `checkFit` and `preflight` from `@byokit/core`, plus the CLI.
  Declared budgets can be checked during builds; dynamic requests need a supplied
  token counter. Unknown accounting rules or estimated counts stay explicit.
- **UI:** DOM settings panel and React wrapper, with application-owned key storage.
- **Local discovery:** `@byokit/dom/local` queries an explicitly selected Ollama or
  OpenAI-compatible endpoint; unverified local limits remain unknown.
- **Logos:** optional `@byokit/assets` package with local provider SVGs and notices.

```bash
npm run demo      # http://127.0.0.1:4173/examples/index.html
npm run build     # small catalog + pinned TypeScript IDs
```

The demo uses memory-only keys and makes no hosted AI calls. See
[the integration guide](docs/integration.md) for UI, budget and local-runtime examples.

## Thank you, Models.dev

A huge thank-you to the maintainers and contributors of [Models.dev](https://models.dev)
and its [open-source catalog](https://github.com/anomalyco/models.dev). Their work makes
provider/model metadata accessible and saves byokit from maintaining a complete model
database. byokit builds a curated filtering layer on top of that foundation. We appreciate
the community keeping the catalog useful and current; contribute upstream facts there
when possible. 

Architecture and data-flow diagrams: [design document](docs/design.md).

## License

[MIT](LICENSE). Catalog metadata and selected logos come from Models.dev;
see [third-party notices](THIRD_PARTY_NOTICES.md).
