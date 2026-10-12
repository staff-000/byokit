# byokit

**A small BYOK setup interface with curated providers, local models, and early compatibility checks.**

Initial 0.1 implementation. Unpublished package names are provisional; no registry availability is claimed.

## Try the working demo

Requires Node 20+ and Python 3.10+ for cross-language tests.

```bash
npm install
npm run demo
# Open http://127.0.0.1:4173/examples/index.html
npm test
npm run test:python
npm run typecheck
npm run check
npm run build
```

The demo uses in-memory keys and makes no hosted-provider calls. Local discovery is explicit.

## Add a BYOK interface

The packages are npm workspaces. Until publication, consume them from this repository or package them with `npm pack --workspace @byokit/core` (and the UI packages).

```js
import { mountByok } from '@byokit/dom';
import { createMemoryCredentialStore } from '@byokit/core';
import '@byokit/dom/styles.css';
import catalog from '@byokit/core/catalog'; // Or your build-generated subset.

const store = createMemoryCredentialStore(); // Replace with application-owned secure storage.
const ui = mountByok(document.querySelector('#ai-settings'), {
  catalog,
  config: { preset: 'china', ui: { maxProviders: 8, maxModelsPerProvider: 4, allowCustomModel: true } },
  credentialStore: store,
  onSave(selection) { /* Persist provider/model/credentialRef; no secret in selection. */ },
  // Optional: implement an explicit, preferably non-generating check using your provider adapter.
  // onCheck: async ({ providerId, modelId, apiKey }) => ({ ok: true }),
});
// ui.destroy() removes the UI and fences pending callbacks.
```

React: `ByokSettings` from `@byokit/react`, with an `options` prop matching `mountByok`.
Memoize options; replacing them remounts the panel and resets unsaved drafts.
Import the DOM stylesheet separately. React 18+ is a peer dependency.

Use `locale: 'zh'` for Chinese, or override `labels`. English is the default.
The `onCheck` callback receives the secret and an AbortSignal only following an explicit click.
Checks time out after 15 seconds (configurable with `checkTimeoutMs`).
Errors shown by the UI are generic to avoid leaking provider error bodies.

## Catalog and filtering

```js
import { Catalog } from '@byokit/core';
const c = new Catalog(catalog);
const groups = c.select({
  preset: 'global',
  filters: {
    input: ['text', 'image'], output: ['text'],
    requiredFeatures: ['functionCalling'], minContextTokens: 32000,
    maxInputPricePerM: 2,
  },
  prefer: { lowerCost: true, features: ['promptCaching'] },
  unknownPolicy: 'exclude',
  ui: { maxProviders: 8, maxModelsPerProvider: 4 },
});
```

No hard filter is relaxed to fill the menu. Empty results stay empty.
Unknown capabilities are excluded by default when a requirement asks for them.
Provider identity, model identity, family, and offering identity are separate.
A saved selection excluded by current filters remains visible; custom IDs remain possible.
Provider switches preserve separate in-memory drafts and keys; destroying the panel clears drafts.

Presets are editorial audience recommendations, not assurances of accessibility,
account eligibility, hosting location, or data residency. The initial China preset
uses DeepSeek, Zhipu AI, SiliconFlow and local runtimes; global includes a curated
set of providers and local runtimes. Override `providerIds` for your own shortlist.

## Build-time checks

```bash
node packages/cli/bin.mjs check examples/task.config.json --strict
node packages/cli/bin.mjs build examples/byok.config.json --out /tmp/byok-catalog.json
```

`check` validates declared task budgets/capabilities against the pinned catalog.
`--strict` makes warnings fail CI. Exit codes: 0 success, 1 failed checks,
2 invalid configuration. `build` emits selected offerings and associated metadata, a lockfile, and TypeScript
literal unions for the pinned offering/model IDs and supported capabilities.
No network is used by ordinary builds. Generated catalogs record input hashes.

```js
import { checkFit, preflight } from '@byokit/core';
checkFit(c.get('provider/model'), {
  inputTokens: 20000, outputTokens: 4000, overheadTokens: 2000,
});
await preflight(c.get('provider/model'), messages, {
  outputTokens: 4000,
  countTokens: async (messages, offering) => ({ tokens: 1234, certainty: 'measured' }),
});
```

Token counters are application/provider adapters; byokit does not claim a generic
exact tokenizer for multimodal requests. Without a counter the result is unknown.
An estimate remains unknown for fit guarantees. Known input/output/context limits
can still produce an exceeds result. Reasoning/tool/media overhead belongs in the
provider-aware budget. No truncation, model fallback or automatic provider billing.

Upstream context accounting is not assumed: the initial importer marks it unknown.
Reviewed offering overrides can set `combined` or `input-only`. Strict task checks
therefore warn when metadata is insufficient rather than guessing a fit.

## Python

```bash
python -m pip install ./packages/python
python -m byokit check examples/task.config.json --strict
```

```python
import json
from byokit import Catalog, check_fit
catalog = Catalog(json.load(open('catalog/catalog.json')))
groups = catalog.select({'preset': 'china', 'filters': {'input': ['text']}})
result = check_fit(catalog.get('provider/model'), {'inputTokens': 20000, 'outputTokens': 4000})
```

Python is native and dependency-free at runtime, shares JSON field names and passes
the same conformance vectors. Each SDK bundles the same offline snapshot. Python exposes `load_catalog()`;
TypeScript exposes `@byokit/core/catalog`. Neither SDK silently downloads data.

## Local models

`discoverLocal` from `@byokit/dom/local` supports Ollama and explicit
OpenAI-compatible endpoints. It only contacts an endpoint when you call it;
remote endpoints require `allowRemote: true`. Discovery times out after ten seconds.
Results retain artifact size, digest and quantization where available, while leaving
unverified context and capabilities unknown. It does not launch/install models.
The UI accepts a `discoverLocal` callback, so authenticated runtimes can use an
application-owned adapter. Selecting a local model does not make your whole app offline.

## Logos

Provider logo metadata comes from Models.dev. Family metadata includes a fallback
provider logo reference; unique family artwork remains a curated contribution.
The UI never loads catalog URLs automatically. Supply local `assets` mappings:

```js
assets: { 'provider:openai': '/assets/openai.svg' }
```

The optional `@byokit/assets` workspace ships nine provider SVGs and a manifest.
Use `node scripts/fetch-assets.mjs catalog/catalog.json assets/` to explicitly fetch
selected Models.dev SVGs. Only validated, sanitized local assets are emitted.
Missing artwork uses a neutral UI fallback. The asset manifest retains provenance
and notices. Do not include the whole icon collection in each application.

## Update the catalog

```bash
curl --fail --location https://models.dev/api.json -o /tmp/models.json
node scripts/import-catalog.mjs /tmp/models.json
```

The importer reads a local file, applies `catalog/overlays.json`, and produces a
snapshot, lockfile and change report. It retains up to 24 recent non-deprecated
text-output offerings per curated provider. Applications display fewer choices.
Price tags use a stated reference workload of 1,000 input + 1,000 output tokens:
`budget` ≤ $0.002, `mid` ≤ $0.02, `premium` above; zero token rates are not a free-service guarantee.
Speed and hosting fields remain unknown until sourced. Prices/capabilities come from upstream; openness, licensing and speed are never
inferred from marketing names. Review changes before accepting a new snapshot.
Scheduled CI emits a candidate artifact; it cannot publish packages or overwrite defaults.
### Reviewed capability overrides

Add entries under `models` or `offerings` in `catalog/overlays.json`:

```json
{
  "offerings": {
    "provider/model": {
      "source": "https://provider.example/docs/context",
      "reviewedAt": "2026-10-12",
      "fields": { "limits": { "contextAccounting": "combined" } }
    }
  }
}
```

Targets must exist, evidence is required, and identity/auth/endpoint fields cannot be
changed. Structured fields are merged and derived tags rebuilt. Missing targets
fail import so a disappearing recommendation gets reviewed.

## Scope and status

Implemented: catalog/preset selection, capability metadata and filtering, budget
checks, price estimates, TS declarations, browser UI, React wrapper, Python core/CLI,
local discovery, asset tooling, snapshot import and shared tests.

Next: deeper provider-specific capability overlays and context accounting review,
family artwork, exact token-count adapters, task-specific constrained client types,
Go/Rust SDKs, extra localization and platform smoke coverage. Full inference,
subscription authorization, quota dashboards and OS keychain implementations stay
in host applications or optional future integrations.

Credentials never enter catalog files. Memory is the only supplied key store.
The host controls endpoint/auth adapters; catalog updates cannot redirect keys.
No telemetry, CDN dependency, automatic inference, or hosted credential proxy.

## License

This project is licensed under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party notices and upstream attribution.
