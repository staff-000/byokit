# byokit

**Get a list of providers and models for your BYOK application, then refine it into a short list with your filters.**

Filter by region preset, capabilities, price, context window, local execution,
and contributor-tested calls. Each result includes the metadata needed to build
an interface or configure your provider SDK. The demo UI is optional.

## Start with one API call

In this repository, run `npm install` first. Packages are not published yet.

```js
import * as byokit from '@byokit/core/catalog';

const models = byokit.getModels({ providerIds: [byokit.ProviderId.DeepSeek] });
console.log(models.map(({ id, name }) => ({ id, name })));
```

Expected output with the bundled snapshot:

```json
[
  {
    "id": "deepseek/deepseek-flash",
    "name": "DeepSeek V4.1 Flash"
  },
  {
    "id": "deepseek/deepseek-v4-pro",
    "name": "DeepSeek V4 Pro"
  }
]
```

`models` contains full records; the example prints only their IDs and names.
An explicit `providerIds` query returns all non-deprecated models in the bundled
catalog for those providers. Add `limit` when you want a smaller list. This is
catalog activity, not a live account-access check.
This API queries an offline catalog. It needs no API key and makes no network
request. To generate an AI response, pass the selected `apiModelId` to your
provider SDK and keep your key in your application's credential storage.

For a preset instead: `byokit.getModels({ preset: byokit.Preset.NonChina, limit: 10 })` returns up to ten
matches. `byokit.getModels()` uses the global preset and the same ten-result limit.

Python has the same interface and JSON field names:

```bash
python -m pip install ./packages/python
```

```python
import byokit

models = byokit.get_models({'providerIds': [byokit.ProviderId.DEEP_SEEK]})
print([{'id': m['id'], 'name': m['name']} for m in models])
```

Run the JavaScript example: `node examples/query.mjs`.

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

All requirements must match. Unknown values fail requirements by default;
`unknownPolicy: byokit.UnknownPolicy.Include` explicitly allows unknown metadata. Conditional support
still does not meet an unconditional feature requirement. Empty results mean no
models meet the rules; byokit never relaxes a rule to fill the list.

| Option | What it selects |
|---|---|
| `preset` | `non-china` audience shortlist (other presets remain available) |
| `providerIds` | Explicit provider IDs, overriding the preset shortlist |
| `limit` | Maximum returned models; default 10 for presets, all matches for explicit providers; maximum explicit limit 1,000 |
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
| `filters.includeTags`, `excludeTags` | All required tags; any excluded tag removes a result |
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
| `apiModelId` | Model ID to give that provider's SDK |
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
