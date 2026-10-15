# @byokit/core

Get a short list of models matching your application, using the offline bundled catalog:

```js
import * as byokit from '@byokit/core/catalog';
const models = byokit.getModels();
console.log(models.map(({ id, name }) => ({ id, name })));
```

Each result includes provider/model metadata, limits, price, features, tags, logos
and contributor verification reports. Discovery queries metadata offline. Use `new byokit.OpenAI({baseURL, apiKey})` and
`client.chat.completions.create({model: model.apiModelId, messages})`, or
`new byokit.Anthropic({baseURL, apiKey})` and `client.messages.create(...)`.
Configure the account once and reuse it for multiple calls. Keys remain in memory
and are never persisted. Standalone `byokit.call(model, prompt, key)` remains supported.

See the [SDK guide](https://github.com/staff-000/byokit/blob/main/docs/sdk.md) for
examples, protocol adapters, official SDK integration, validation, and migration.
