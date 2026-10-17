# Optional integration tools

## UI

```js
import * as byokit from 'byokit/dom';
import data from 'byokit/catalog';
import 'byokit/dom/styles.css';

const ui = byokit.mountByok(element, {
  catalog: data,
  config: {
    preset: byokit.Preset.Global,
    ui: { maxProviders: 8, maxModelsPerProvider: 4, allowCustomModel: true },
  },
  credentialStore: applicationCredentialStore,
  onSave: (selection) => saveSelection(selection),
  onCheck: async ({ providerId, modelId, apiKey, signal }) =>
    checkProvider({ providerId, modelId, apiKey, signal }),
});
```

Callbacks are application functions. The save callback receives a credential reference,
not the key. Connection checks are explicit and time out after 15 seconds. Provider
switches keep drafts independent; unmount clears drafts and fences late callbacks.
`locale: 'zh'` supplies basic Chinese labels; custom labels are supported.

React exports `ByokSettings` from `byokit/react`. Pass memoized `options` matching
the DOM options and import its stylesheet separately. Changing options remounts.

## Advanced catalogs

`new byokit.Catalog(customData).getModels(query)` uses your own catalog. Its `select` method
returns provider groups for menus with per-provider limits. `byokit.Catalog.get` looks up
an offering by ID. The simple `getModels` helper uses the bundled snapshot.

## Budgets

```js
import * as byokit from 'byokit/catalog';
const fit = byokit.checkFit(model, {
  inputTokens: 20000,
  outputTokens: 4000,
  overheadTokens: 2000,
});
```

Results are fits/exceeds/unknown, with diagnostics. Context accounting may include
output, exclude output, or be unknown. Unknown counts do not imply a fit. Use
`preflight` with an application/provider-aware counter for actual requests.
Estimates and multimodal overhead must be explicit. There is no model substitution
or automatic truncation.

```bash
# Check budgets offline
byokit check examples/task.config.json --strict

# Build precompiled static model list (recommended for production):
byokit build examples/byok.config.json --out src/generated/models.js
# Or for Python:
byokit build examples/byok.config.json --out app/generated_models.py
# Or pruned catalog JSON (for custom catalogs):
byokit build examples/byok.config.json --out /tmp/byok-catalog.json
```

Strict mode fails warnings. CLI exit codes: 0 success, 1 failed checks, 2 invalid config.
When `--out` targets `.js` (or `.mjs`), the build pre-evaluates `getModels(config)` once and generates `models.js` plus `models.d.ts` exporting pre-computed `models`, `getModels()`, and `OfferingId`/`ModelId` enums.
Combine this with `import { OpenAI, Role, call } from 'byokit/client'` to avoid bundling the 20 MB catalog at runtime.
Python generates `generated_models.py` exporting `MODELS`, `get_models()`, and `OfferingId` enum classes.
`config.catalog` is optional; when omitted, builds automatically use the bundled catalog snapshot.

## Local discovery and logos

`discoverLocal` from `byokit/dom/local` supports URL-based Ollama/OpenAI-compatible endpoints.
Pass `api: byokit.LocalApi.OpenAI` for Ollama, vLLM, or llama.cpp `/v1/models`;
pass `api: byokit.LocalApi.Ollama` for native `/api/tags`, optionally `runningOnly: true` for `/api/ps`.
UI `discoverLocal(endpoint, signal, {api})` callbacks receive the selected protocol.
Queries append one generic Local setup entry, or explicit `local` URL/model entries,
without hosted metadata filtering. `local: false` removes them.
It runs only when called, defaults to loopback, requires allowRemote for other hosts,
and times out after ten seconds. Supply application callbacks for authenticated runtimes.

Pass an `assets` map to the UI, mapping logo IDs to local URLs. Catalog logo URLs
are never loaded implicitly. Family marks may fall back to provider artwork.
`node scripts/fetch-assets.mjs catalog/catalog.json assets/` explicitly fetches
selected, validated SVGs; retain notices and branding attribution.
