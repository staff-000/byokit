# byokit for Python

Get a short list of AI models without Node or a network request:

```python
import byokit

models = byokit.get_models()
print([{"id": m["id"], "name": m["name"]} for m in models])
```

Returns provider/model metadata, limits, price, features, tags, logos and contributor
verification reports. `byokit.Catalog(custom_data).get_models(query)` uses a custom snapshot.
Pure Python, with no runtime dependencies. Use `client = byokit.OpenAI(base_url=..., api_key=...)` and
`client.chat.completions.create(model=model["apiModelId"], messages=...)`.
Use `byokit.Anthropic(...)` and `client.messages.create(...)` for Claude format.
Keys stay in client memory and are never persisted. Responses support attribute
and dictionary access. Stateless `byokit.call(model, prompt, key)` remains supported.

See the [SDK guide](https://github.com/staff-000/byokit/blob/main/docs/sdk.md) for
examples, protocol adapters, official SDK integration, validation, and migration.
