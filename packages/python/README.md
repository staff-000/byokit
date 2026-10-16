# byokit for Python

Add BYOK with a model list and one simple call. Keep your model choices fresh.

## Installation

```bash
pip install byokit
```

## Quick Start

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

## Discovery and call support

Defaults are reviewed offering recommendations. COMPLETE includes every upstream
provider and output modality, including retired and uncertain entries. GLOBAL and
CHINA remain editorial collections. Filter `output` for image/audio/video generation
and `callable` for reviewed text-call compatibility. Input/output arrays require all
listed modalities. Newly discovered providers may have no connection adapter.

`callSupport.textGeneration` is adapter compatibility; availability uses separate
provider evidence. Catalog observation never establishes LIVE availability.
Explicit lifecycle filters override `includeDeprecated`. Token prices are per
million tokens; media prices may be unknown. See the repository README for migration
details and examples.
