# byokit for Python

Get a short list of AI models without Node or a network request:

```python
import byokit
models=byokit.get_models()
print([{'id':m['id'],'name':m['name']} for m in models])
```

Returns provider/model metadata, limits, price, features, tags, logos and contributor
verification reports. `byokit.Catalog(custom_data).get_models(query)` uses a custom snapshot.
Pure Python, with no runtime dependencies. Use `byokit.call(model, input, key)` for OpenAI format or
`byokit.call_claude(model, input, key)` for Claude format. Keys are per-call
arguments and never cached by calls. See the repository README for filters and CONTRIBUTING.md for
metadata and call-report submissions.

```bash
python -m pip install ./packages/python
byokit check examples/byok.config.json
```

Use `byokit.get_models(byokit.COMPLETE)` for all LIVE offerings, or `byokit.CHINA` for China providers. `local` accepts URL/API/model entries appended without metadata filtering.
