# Initial implementation verification

- 32 Node tests passed, including shared fit/filter conformance and browser DOM lifecycle tests.
- 84 fit vectors agree across native JavaScript/TypeScript API and Python implementations.
- 6 standalone Python tests passed, including bundled resource loading.
- TypeScript declaration/client fixture checks passed.
- The real pinned snapshot passed the published JSON Schema.
- CLI checks exercise excessive budgets, strict warnings, subset builds and generated ID unions.
- Headless Chrome on macOS passed Save, China/global switch, secret isolation, mobile overflow and page-error checks.
- npm package dry-run checks passed; Python wheel built successfully with bundled catalog resources.

No live inference or billable provider checks ran. onCheck and token counting are host-provided adapters.
Windows/Linux browser smoke and unique model-family artwork remain release follow-ups.

## README/interface revision

The executable quickstart matches its documented output. Flat getModels/get_models
queries agree across JS/Python, including contributor and freshness filters. Test
reports are isolated fixtures; no actual contributor claims are seeded. Tests cover
latest failures, stale/future dates, feature-only reports, malformed evidence,
secret fields, missing targets, returned-data isolation and unchanged capabilities.

## Enum contract revision

Shared enum generation is tested against JS/Python serialized values. TypeScript
fixtures require compile errors for raw fixed-choice strings and misspelled members.
JSON/JavaScript queries reject unknown vocabularies at runtime. Python ships py.typed
and an enum-based query TypedDict; Pyright checks valid calls and confirms invalid
raw-literal calls fail. Generated build IDs
now have both runtime enum objects and matching TS enum declarations.
