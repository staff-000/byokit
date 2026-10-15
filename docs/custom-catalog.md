# Add your own providers and models

There are three paths. No path requires an API key in catalog data.

| Need                                         | Where                                                          |
| -------------------------------------------- | -------------------------------------------------------------- |
| Add a model only in your app                 | `byokit.appendModel(models, custom)` / Python `append_model()` |
| Add an upstream Models.dev provider          | `catalog/overlays.json` → `providers`                          |
| Add a provider/model missing from Models.dev | `catalog/manual.json`                                          |

## Application-owned list

`appendModel` returns a deep-copied list with one custom offering at the end.
It does not mutate the input or bundled catalog, perform discovery, run inference,
re-sort, or apply hosted query filters. Supply `providerId`, `modelId`, `baseUrl`,
and an `ApiProtocol`; `providerName`, `name`, `deployment`, and `limits` are optional.
Pass only a provider base URL (such as `/v1`), not `/chat/completions`.
The API rejects unknown fields, duplicate offering IDs, invalid limits, and URLs
with embedded credentials, query strings, or fragments. Pass your key separately
to `call()`. Unknown capability metadata stays unknown; no LIVE claim is invented.

For local servers you can still use `getModels({ local: [{ endpoint, modelId }] })`.
To append one directly, use `deployment: byokit.Deployment.Local` and the server's
native `ApiProtocol`. A model added through appendModel is a custom offering, not
the empty Local setup placeholder.

## Add a Models.dev provider

1. Confirm its exact ID exists in the upstream snapshot.
2. Add `catalog/overlays.json` → `providers` → that ID with known `origin`,
   `rank`, and `presets: ["global"]` (optionally `"china"`).
3. Add its documented native base URL/protocol to `providerConnections` in
   `packages/core/connection.js` and Python `inference.py` so calls can execute.
4. Optionally add a stable `ProviderId` enum in `spec/enums.json`, then run
   `npm run enums:generate`. Otherwise use `customProviderId('provider-id')`.
5. Regenerate and validate using the commands below. The importer includes all
   upstream text-output offerings for that provider.

## Add manually, independently of upstream

Use [catalog/manual.example.json](../catalog/manual.example.json) as a template.
It is an illustrative fixture, never imported by default. Copy the relevant
records into [catalog/manual.json](../catalog/manual.json), keeping existing records.

- **Provider:** unique ID, name, auth requirement, deployment, known origin/tags.
- **Model:** unique ID, name, known weights/license/size/origin, and custom tags.
- **Offering:** unique provider/model pairing, exact API model ID, display name,
  explicit `connection: { baseUrl, protocol }`, modalities, limits, prices/features.
- **Evidence:** every provider, model, and offering needs
  `provenance: { source: "https://…", reviewedAt: "YYYY-MM-DD" }`.
- **Availability:** to appear in default LIVE queries, supply current
  `lifecycleEvidence: { status: "LIVE", basis: "provider", source: "https://…",
checkedAt: "…Z" }` after checking provider documentation. Without evidence it is
  UNCERTAIN; inspect with `filters.lifecycle: [byokit.Lifecycle.Uncertain]`.
  Nightly fetching does not refresh manual evidence dates automatically.
- **Shortlists:** manual providers join Global/COMPLETE. To extend another list,
  add `presets: [{ id: "default", providerIds: ["acme"] }]` to manual.json.
- **Existing provider:** omit the provider record and refer to its existing ID.
  You can reuse an existing model ID; omit that model record too.

IDs cannot replace upstream records. For corrections to existing data, use
`overlays.json` (`models` or `offerings`) with source/reviewedAt/fields. Add custom
namespaced tags such as `usecase:coding` in model/offerings `tags`. Derived tags are
recomputed, so don't use tags to invent capability or popularity claims.
Known limit/price values must be sourced. Use null for unknown numbers.

Connections support the existing OpenAI, Claude, Gemini, and Ollama adapters.
An unsupported native protocol requires a new adapter and tests; adding a URL
does not implement a new wire protocol. Credentials never belong in JSON,
connection URLs, evidence, or verification records.

## Regenerate and validate

```sh
curl --fail --location https://models.dev/api.json -o /tmp/models.json
node scripts/import-catalog.mjs /tmp/models.json --observed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
npm run verify
```

Reuse a pinned local snapshot offline and omit `--observed-at` to preserve its
observation time. `--manual path.json` selects a different additive fragment
(for tests/private catalogs). Import validates schema, references, duplicate IDs,
evidence, and endpoints. Manual additions are merged before correction overlays.
Contributor verification records are preserved. The lock records both upstream
and manual-file hashes. Commit source changes and generated JS/Python catalog
files together. Never edit generated catalogs directly.

## Nightly refresh

`.github/workflows/catalog-review.yml` runs at 08:23 UTC daily and supports manual
dispatch. It fetches only the public Models.dev JSON, imports the current manual
file, validates and builds, then uploads `nightly-catalog-candidate` for 14 days.
The candidate contains the diff, lock, catalog, and generated JS/Python data.
Failures leave production untouched. No provider inference or credentials are
involved. Review the artifact, commit its files, then release when ready.
The workflow intentionally has read-only repository permissions and does not
publish packages or overwrite production. [GitHub may delay scheduled runs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule); on
inactive public repositories GitHub can disable schedules after 60 days.
