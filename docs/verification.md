# Initial implementation verification

- 22 Node tests passed, including shared fit/filter conformance and browser DOM lifecycle tests.
- 84 fit vectors agree across native JavaScript/TypeScript API and Python implementations.
- 6 standalone Python tests passed, including bundled resource loading.
- TypeScript declaration/client fixture checks passed.
- The real pinned snapshot passed the published JSON Schema.
- CLI checks exercise excessive budgets, strict warnings, subset builds and generated ID unions.
- Headless Chrome on macOS passed Save, China/global switch, secret isolation, mobile overflow and page-error checks.
- npm package dry-run checks passed; Python wheel built successfully with bundled catalog resources.

No live inference or billable provider checks ran. onCheck and token counting are host-provided adapters.
Windows/Linux browser smoke and unique model-family artwork remain release follow-ups.
