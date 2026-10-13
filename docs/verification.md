# Initial implementation verification

- 35 Node tests passed, including shared fit/filter conformance and browser DOM lifecycle tests.
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

## Simple query and local endpoint revision

Default queries cover OpenAI, Anthropic, Google, OpenRouter, DeepSeek, then Local.
COMPLETE has no shortlist cap; CHINA and NON_CHINA use typed shortcuts. Hosted
selection defaults to LIVE, with provider-specific lifecycle evidence. Snapshot
imports retain their recorded observation date and cannot silently freshen a
changed unobserved source. Cross-language tests cover shortcuts, local append,
protocol records, and a retired direct offering that remains LIVE via an aggregator.
Local discovery tests cover native Ollama installed/running endpoints and
OpenAI-compatible root or /v1 URLs. UI tests cover local URL/API draft retention
and disabled recovery for a retired saved hosted model. The catalog was freshly
fetched from Models.dev, without provider keys or inference calls.
