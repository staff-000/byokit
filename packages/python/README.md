# byokit for Python

Get a short list of AI models without Node or a network request:

```python
from byokit import get_models, Preset
models=get_models({'preset':Preset.CHINA,'limit':10})
print([{'id':m['id'],'name':m['name']} for m in models])
```

Returns provider/model metadata, limits, price, features, tags, logos and contributor
verification reports. `Catalog(custom_data).get_models(query)` uses a custom snapshot.
Pure Python, with no runtime dependencies. AI execution and credentials remain in
your application. See the repository README for filters and CONTRIBUTING.md for
metadata and call-report submissions.

```bash
python -m pip install ./packages/python
byokit check examples/byok.config.json
```
