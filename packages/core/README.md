# @byokit/core

Get a short list of models matching your application, using the offline bundled catalog:

```js
import * as byokit from '@byokit/core/catalog';
const models=byokit.getModels();
console.log(models.map(({id,name})=>({id,name})));
```

Each result includes provider/model metadata, limits, price, features, tags, logos
and contributor verification reports. Discovery queries metadata offline. Use `new byokit.Byokit()` with
`client.chat.completions.create({model,messages}, {apiKey})`, or
`client.messages.create({model,messages}, {apiKey})` for Claude-style formats.
The model and key belong to each request; the client retains only non-secret
defaults. `byokit.call(model, 'Hello', key)` remains the concise helper.
Legacy model-bound clients remain supported and are deprecated.

See the [repository README](https://github.com/staff-000/byokit#readme) for filters,
sorting, custom models, validation, and full examples.
