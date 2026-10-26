# Creator selection migration

Breaking behavior: dedupe now selects the newest canonical models per creator, speciality and tier across providers, retaining every eligible offering. It no longer caps each provider independently. Result sorting and limits still apply afterward.

Use creatorIds with the same matcher syntax as providerIds. Returned creatorId identifies the model builder; providerId identifies whose credentials and endpoint to use. Unknown creators are null and excluded when creatorIds is specified. Older catalogs remain valid.

Attribution uses catalog/creators.json canonical namespaces and explicit model overrides, never the serving provider or display name. Unknown aggregator attribution must be reviewed before adding mappings.
