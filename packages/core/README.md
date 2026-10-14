# @byokit/core

Get a short list of models matching your application, using the offline bundled catalog:

```js
import * as byokit from '@byokit/core/catalog';
const models=byokit.getModels();
console.log(models.map(({id,name})=>({id,name})));
```

Each result includes provider/model metadata, limits, price, features, tags, logos
and contributor verification reports. Discovery queries metadata offline. Use `byokit.openAI({model,apiKey:()=>key})` and
`client.chat.completions.create(...)`, or `byokit.claude(...)` and
`client.messages.create(...)`. Keys are read per request and never cached by clients. The catalog export is optional; importing core alone
does not load it. No runtime dependencies.

Use `new byokit.Catalog(customData).getModels(query)` for a custom snapshot.
See the project README and CONTRIBUTING.md for all filters and tag/report updates.

Use `byokit.getModels(byokit.COMPLETE)` for all LIVE offerings, or `byokit.CHINA` for China providers. LIVE is per provider/offering. Local URL entries are appended without hosted metadata filtering.
