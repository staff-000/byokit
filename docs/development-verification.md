# Development verification tracker

This document tracks the library and website checks separately from actual model
calls. A passing library test never becomes a contributor model-call report.

## Latest recorded run

- [Machine-readable latest run](verification/latest.json)
- [Run history](verification/runs/)
- [Public verification page](https://staff-000.github.io/byokit/verification.html)

Each run records its UTC start/end, Git commit, whether source changes were
present, a source SHA-256, platform/architecture, Node version, exact commands,
exit codes, durations, test totals when available, and output digests. These are
observed outcomes for the checked source, not promises about future versions.
Generated run records are committed with changes they verify. Source hashing
excludes verification reports themselves and ignored build/dependency files.

## Repeat and record

```bash
npm ci
npm run verify
```

For Chrome checks, launch the site preview in another terminal:

```bash
npm run site:build
npm run site:preview
# In another terminal:
npm run verify -- --browser
```

Set `BYOKIT_CHROME` to an installed Chrome executable on other operating systems.
Browser checks require a working preview at `/byokit/`. The recorder never runs
inference or needs provider credentials. Failed commands produce a failed record
and a nonzero exit; an omitted browser check is recorded as NOT RUN, not passed.

| Check                           | What it establishes                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript tests                | Filtering, lifecycle, exclusions, model reports, ownership of keys, local discovery, UI behavior, CLI and JS/Python parity          |
| Python tests                    | Native Python behavior and bundled catalog resource loading                                                                         |
| TypeScript / Python type checks | Typed enum interface and client examples                                                                                            |
| Catalog check and sample build  | Schema/budget checks and usable generated IDs                                                                                       |
| Website build                   | Static assets, browser modules and truthful verification data are packaged                                                          |
| Website Chrome smoke            | Actual list queries, filters, search, paging, language tabs, `/byokit/` paths, verification page, mobile layout and resource errors |

## Actual provider call verification

Canonical records live in [catalog/verifications.json](../catalog/verifications.json).
Use [the report template](../catalog/verification.example.json) and follow
[CONTRIBUTING.md](../CONTRIBUTING.md). Record exact offering ID, contributor,
checked timestamp, result, checks, adapter version and HTTPS evidence. Contributor
identity is a submitted claim; maintainers must verify authorship and evidence.
A source listing, catalog import, browser simulation, or test fixture is not a
successful provider call. Submit no API keys, tokens or account credentials.

The website verifies actual inference calls; development checks stay in this document. Failed/stale reports remain visible; runtime summaries use
the library's freshness rules. There are currently no submitted real-call reports.

## Open verification work

- Windows and Linux browser/runtime smoke tests.
- Real provider calls with each supported adapter and contributor evidence.
- Local server inference tests for Ollama, vLLM and llama.cpp.
- Account-specific model access, quota, and context behavior.
- Objective, sourced popularity rankings.

## Website publishing

`npm run site:build` produces `dist/site` with paths relative to `/byokit/`.
The [Pages workflow](../.github/workflows/pages.yml) publishes changes on `main`
to [staff-000.github.io/byokit](https://staff-000.github.io/byokit/).
GitHub repository Settings → Pages must use **GitHub Actions** as the source.
Verification JSON is included from the committed latest run; deployment does not
invent a new passing run or claim tests that were not executed.

Catalog checks report unknown catalog limits as warnings. The separate
`npm run check:budget` runs strict task-budget fixtures; unknown metadata is
never converted into verified context-accounting rules to make a check pass.
