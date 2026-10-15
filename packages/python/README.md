# byokit for Python

Get a short list of AI models without Node or a network request:

```python
import byokit
models=byokit.get_models()
print([{'id':m['id'],'name':m['name']} for m in models])
```

Returns provider/model metadata, limits, price, features, tags, logos and contributor
verification reports. `byokit.Catalog(custom_data).get_models(query)` uses a custom snapshot.
Pure Python, with no runtime dependencies. Use `client = byokit.Byokit()` and
`client.chat.completions.create(model=model, messages=messages, api_key=key)`.
Use `client.messages.create(...)` for Claude-style formats. Models and keys belong
to each request; the client retains only non-secret defaults. The older
model-bound `OpenAI`, `Anthropic`, `openAI`, and `claude` clients are deprecated
and continue to work.

See the [repository README](https://github.com/staff-000/byokit#readme) for full examples.
