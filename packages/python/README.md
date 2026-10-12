# byokit for Python

Pure-Python catalog selection, fit checks and CLI. No Node dependency.

```bash
python -m pip install ./packages/python
byokit check examples/byok.config.json
```

Use `Catalog(json.load(...)).select(config)` and `check_fit(offering, budget)`.
See the repository README for metadata semantics and examples.
