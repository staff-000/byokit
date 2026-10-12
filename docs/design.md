# byokit design and extension contract

## Ownership

The catalog is metadata, not a credential transport. Applications own secret storage,
trusted endpoints and execution adapters. UI callbacks may consume credentials only
on explicit user action. Catalog refresh cannot initiate login/inference or replace
saved model IDs. Each configuration instance is independent.

## Metadata

Provider: account/service identity, audience overlay, docs, auth requirement.
Family: underlying family branding and related model grouping.
Model: underlying identity, openness, license, size and architecture.
Offering: provider/model pairing, API model ID, capabilities, prices and limits.
Deployment: hosted/local/self-hosted; local instances are discovered at runtime.

All feature states are supported/unsupported/conditional/unknown, with evidence.
Prompt cache pricing alone does not establish caching controls. JSON schema support
alone does not establish strict enforcement. Thinking support does not expose private
reasoning. Active MoE parameters and total parameters are distinct. Size cannot
reliably predict latency or available local context.

Capability extension keys should be namespaced. New optional metadata can be added
without discarding old selections. Schema breaking changes require a new schemaVersion.

## Presets and ranking

1. Choose a reviewed audience preset or explicit providerIds.
2. Apply hard filters to offerings and underlying models.
3. Rank by preferred features, optional input price, curated rank, stable ID.
4. Enforce maxProviders/maxModelsPerProvider.

Unknown values fail requirements unless unknownPolicy explicitly includes them.
Conditional support does not satisfy an unconditional hard requirement. Unknown
prices are not zero. Model origin is not serving location. Audience presets never
claim residency/eligibility. Hosting, speed evidence and commercial licenses require
reviewed data, not guesses; initial schema preserves unknowns.

## Limits

contextAccounting: combined includes output; input-only excludes output; unknown
makes positive fit assertions unavailable. Known output/input limits are still
checked. Token estimation is explicit and never promotes to measured status.
No selection substitution or history truncation. CI strict mode rejects warnings.

## Language compatibility

Use the versioned JSON catalog and diagnostic codes as the wire contract. JS/TS and
Python are handwritten idiomatic implementations. spec/conformance and fixtures
must agree before release. Runtime catalog snapshots are passed by callers; data
release cadence is independent from SDK release cadence. Go/Rust can implement the
same contract without FFI, a Python process or a Node process.

## UI lifecycle

Labels are replaceable; en/zh ship initially. Explicit connection tests are supplied
by the host. Selection revisions fence stale callback results and credential loads.
Unmount removes the panel and clears its input. Store writes and host actions already
started cannot be rolled back by destroying the component. Applications should
provide cancelable callbacks where their workflow requires it.

## Release gate

Tests, TS declaration checks, cross-language parity, demo verification, packing checks,
metadata/source reviews and asset notices before publication. No generated catalog
change auto-publishes a package. Availability of proposed package names is unverified.
