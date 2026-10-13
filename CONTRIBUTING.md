# Contributing to byokit

## Choose the right file

| Change | Source file |
|---|---|
| Audience presets/provider shortlist | `catalog/overlays.json` → providers |
| Model facts/custom tags | `catalog/overlays.json` → models |
| Provider-specific capabilities, price, context/custom tags | `catalog/overlays.json` → offerings |
| Actual contributor call reports | `catalog/verifications.json` |
| Derived tag rules | `deriveTags` in `packages/core/index.js` and `derive_tags` in Python |
| Query/filter behavior | `packages/core/index.js`, declarations, Python counterpart |
| Shared data contract | `catalog/catalog.schema.json` |
| DOM/React UI | `packages/dom`, `packages/react` |

Do not edit catalog/catalog.json, packages/core/catalog.js or the Python bundled
snapshot directly. They are generated together. Preserve unrelated contributor changes.

## Fixed API choices and enums

Add or change a fixed choice in `spec/enums.json`, then run `npm run enums:generate`.
That generates JS constants, actual TS enum declarations and matching Python enums.
Do not hand-edit generated enum files. Update runtime validators, schema and tests
when changing a vocabulary. CLI JSON stores the serialized enum values; public TS
examples use members such as `Modality.Image` and `FeatureName.FunctionCalling`.

Model IDs and custom tags change independently of this fixed vocabulary. Build
catalog-specific model-ID enums with `npm run build`; use explicit custom helpers
for namespaced tags, nonstandard providers/formats and contributor handles.

## Tags and evidence

Use structured fields for measurable facts and capabilities. A generic `cap:` tag
must not bypass a feature requirement. Derived prefixes are reserved; choose a
namespace such as usecase: for custom labels. Model tags describe the underlying
model; offering tags describe a specific serving provider. Keep all custom tags you
want when replacing fields.tags. Every overlay needs source and reviewedAt.

Never infer commercial permission from open weights, hosting from company origin,
strict schema enforcement from JSON mode, or speed from model size. Use unknown
until evidence supports a claim. A benchmark needs test environment and date.

## Verification reports

The example file is a template only. Use a unique record ID, exact existing offeringId,
your GitHub identity, actual UTC test time, passed/failed, check names, adapter/version,
and a public evidence URL. Name textGeneration only after exercising a generating
call; list functionCalling or other features only when exercised too. Your test may
consume provider quota. Signing in or listing models does not verify inference.

Evidence should give a small reproducible test, expected assertions and sanitized
observations. Keep credentials and sensitive content out of commits. New report
fields are rejected to avoid accidental key/payload storage. Notes/evidence still
need human review for secrets; validation cannot authenticate the claimed author.

Reviewers must inspect evidence, compare contributor identity with the PR author,
and check the offering/adapter/test scope. Reports document a particular account,
environment and time, not every user's access. Later failures supersede older
passes for the text-call summary; records remain visible. A feature-only report
does not mark text generation verified and does not rewrite metadata capabilities.

No real call reports are seeded. Mock reports are confined to tests.

## Regenerate and validate

```bash
npm install
curl --fail --location https://models.dev/api.json -o /tmp/models.json
node scripts/import-catalog.mjs /tmp/models.json
npm test
npm run test:python
npm run typecheck
npm run typecheck:python
npm run check
```

Reuse an existing local upstream file for offline work. Include the updated generated
files, lockfile and source overlay/report changes in the same PR. Review removed
models and changed limits/prices. Missing overlay/report targets fail regeneration.

For a code change, run the affected test file while developing, then the checks above.
Add a shared conformance case for TS/Python semantics. Keep ordinary queries/builds
offline and avoid making metadata edits launch AI calls or redirect keys.

## Releases

SDK and catalog changes require review. The scheduled importer produces a candidate
artifact, not an automatic publication. Package names are provisional until registry
availability is checked. See docs/roadmap.md for remaining work.
