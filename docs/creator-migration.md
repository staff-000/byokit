# Creator selection migration

Breaking behavior: dedupe now selects the newest canonical models per creator, speciality and tier across providers, retaining every eligible offering. It no longer caps each provider independently. Result sorting and limits still apply afterward.

Use creatorIds with the same matcher syntax as providerIds. Returned creatorId identifies the model builder; providerId identifies whose credentials and endpoint to use. Unknown creators are null and excluded when creatorIds is specified. Older catalogs remain valid.

Attribution uses catalog/creators.json canonical namespaces and explicit model overrides, never the serving provider or display name. Unknown aggregator attribution must be reviewed before adding mappings.

Attribution refresh: run `node scripts/refresh-creators.mjs` to update creator metadata in the pinned catalog and JavaScript/Python bundles without fetching a new model list. Full catalog imports apply the same resolver automatically. Resolution uses canonical author namespaces, explicit ID overrides, anchored API model-family rules, provider-specific ID formats, and unambiguous exact API-ID matches. Explicit author namespaces take precedence over family rules so derivative models retain their own creators. Display names are never consulted.

`catalog/creator-coverage.json` reports all unresolved model IDs as well as unresolved OpenRouter offerings. Router and composite entries (including OpenRouter auto/free) intentionally have no single creator. Other unknown IDs remain null until attribution is supported; no manual action is required to use attributed models.
