# byokit

Add BYOK with a model list and one simple call. Keep your model choices fresh.  
Full parity across **TypeScript/JavaScript** and **Python**.

[Try the JavaScript Playground](https://staff-000.github.io/byokit/#playground) · [Model Explorer](https://staff-000.github.io/byokit/#explore) · [Verify Models & Earn Badge](https://staff-000.github.io/byokit/verification.html) · [Contribute](CONTRIBUTING.md)

---

## Key Highlights

1. **"Model Discovery + Unified Execution" in Two Calls** — One simple call to get an up-to-date list of BYOK models (`byokit.getModels()`), and one simple call to run inference (`byokit.call()` or familiar `OpenAI` / `Anthropic` client wrappers). No provider-specific SDK glue required.
2. **Presets, Composable Matchers & Rich Filters** — Curated presets (`DEFAULT`, `COMPLETE`, `CHINA`, `GLOBAL`, `OFFICIAL`) paired with composable matchers (`exact`, `any`, `contain`, `exclude`, `and`, `or`, `xor`, `not`) for modalities, required `speciality`, model `tier`, context windows, pricing, and tag exclusions.
3. **Regular Releases & Community Verification** — Pinned catalog snapshots sync automatically every 12 hours from Models.dev with scheduled releases, backed by browser-based community inference verification and contributor badges.
4. **Credential Privacy by Default** — Built-in execution keeps keys in memory and sends them directly to the configured endpoint. The website stores sanitized verification records, not keys. Custom storage and transport integrations are controlled by your application.
5. **Build-Time Generation (0 Runtime Overhead) & Caching** — Precompile your fixed query at build time (`npx byokit build`) into a tiny ~15 KB static module with typed autocomplete instead of shipping the full 20 MB catalog. Dynamic queries at runtime are deterministically cached.
6. **Pre-Flight Task & Budget Fit Checking** — Validate declared token budgets, context limits, features, and modalities before making requests (`byokit.checkModelFit()` / `byokit check`) to prevent runtime failures and wasted tokens.
7. **Complete Cross-Language Parity** — Full feature parity across JavaScript/TypeScript and Python (`byokit.get_models()`, `byokit.call()`, matching enums, sorting rules, and budget checks).

---

## Installation

```sh
# npm (Node.js / TypeScript / Browser)
npm install byokit

# pip (Python)
pip install byokit
```

---

## 60-Second Quickstart

Discover available models and run inference in two simple calls:

### TypeScript / JavaScript

```ts
import * as byokit from 'byokit';

// 1. Get models from curated recommendations
const [model] = byokit.getModels({
  providerIds: byokit.exact(byokit.ProviderId.DeepSeek),
  limit: 1,
  local: false,
});
if (!model?.connection) throw new Error('No model found');

// 2. Call the model using familiar OpenAI-compatible client
const client = new byokit.OpenAI({
  baseURL: model.connection.baseUrl,
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
});

const response = await client.chat.completions.create({
  model: model.apiModelId,
  messages: [{ role: byokit.Role.User, content: 'Hello!' }],
});

console.log(response.choices[0].message.content);
```

### Python

```python
import os
import byokit

# 1. Get models from curated recommendations
models = byokit.get_models({
    "providerIds": byokit.exact(byokit.ProviderId.DEEP_SEEK),
    "limit": 1,
    "local": False,
})
if not models:
    raise ValueError("No matching model")
model = models[0]

# 2. Call the model using familiar OpenAI-compatible client
client = byokit.OpenAI(
    base_url=model["connection"]["baseUrl"],
    api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
)

response = client.chat.completions.create(
    model=model["apiModelId"],
    messages=[{"role": byokit.Role.USER, "content": "Hello!"}],
)

print(response.choices[0].message.content)
```

---

## Step 1: Discover & Filter Models

### Curated Presets

Discovery runs completely offline against a pinned catalog snapshot. By default, `byokit.getModels()` returns a curated shortlist of reviewed models plus a Local setup entry:

```ts
// Curated reviewed recommendations (OpenAI, Gemini, Claude, DeepSeek) + Local
const defaultModels = byokit.getModels();

// Complete catalog: every upstream provider and modality, including retired/uncertain entries
const allModels = byokit.getModels(byokit.COMPLETE);

// Global: one non-retired model per editorial provider + Local
const globalModels = byokit.getModels(byokit.GLOBAL);

// China: China-headquartered provider shortlist + Local
const chinaModels = byokit.getModels(byokit.CHINA);

// Official: official model creators only (excludes third-party aggregators/re-hosters) + Local
const officialModels = byokit.getModels(byokit.OFFICIAL);

// Group models by provider:
const byProvider = byokit.getModelsByProvider();
// byProvider['openai'] -> array of OpenAI models
```

### Required Fields: `speciality` & `tier`

Every model in the catalog includes structured editorial classifications:

- **`speciality`**: Purpose and capability focus:
  - `Speciality.General` — Multi-purpose conversational and reasoning models
  - `Speciality.Coding` — Code generation and debugging models (alias: `Codex`)
  - `Speciality.Reasoning` — Extended thought, math, and STEM reasoning models
  - `Speciality.Cybersecurity` — Threat analysis, vulnerability, and security models
  - `Speciality.Music` / `Voice` / `Medical` / `Unknown`
- **`tier`**: Performance and cost scale:
  - `Tier.Flagship` — Premier frontier intelligence (e.g. Claude 3.7 Sonnet, GPT-4.5)
  - `Tier.Workhorse` — Balanced general-purpose production engines (e.g. GPT-4o)
  - `Tier.Flash` — Fast, low-latency, cost-effective models (e.g. Gemini 2.0 Flash)
  - `Tier.Lite` — Lightweight budget models
  - `Tier.Mini` — Small compact models

Filter easily by required speciality and tier:

```ts
// Discover only general-purpose flash models
const flashModels = byokit.getModels(byokit.COMPLETE, {
  local: false,
  filters: {
    speciality: byokit.Speciality.General,
    tier: byokit.Tier.Flash,
  },
});
```

### Composable Matchers

All list-based filters support explicit, composable matchers for complete logical expressiveness:

- **`exact(...)`**: Match strictly this set of values (order and duplicates ignored).
- **`contain(...)`**: Require all listed values to be present (permits additional values).
- **`any(...)`**: Require at least one of the listed values to match.
- **`exclude(...)`**: Reject any result that matches any of the listed values.
- **Boolean operators**: `and(...)`, `or(...)`, `xor(...)`, `not(...)` for complex logic.

```ts
// Example: select text models excluding lite models, or select any flash model
const matched = byokit.getModels(byokit.COMPLETE, {
  local: false,
  filters: {
    tier: byokit.or(
      byokit.and(byokit.exact(byokit.Tier.Flagship), byokit.not(byokit.Tier.Lite)),
      byokit.exact(byokit.Tier.Flash),
    ),
  },
});
```

### Modality Matching (`input` and `output`)

Control input and output modalities (`Text`, `Image`, `Audio`, `Video`):

- `output: byokit.exact(byokit.Modality.Text)` — Returns strictly text-only generation (excludes multimodal image-generating or audio-output models).
- `input: byokit.contain(byokit.Modality.Image)` — Finds vision models accepting images alongside text.
- `output: byokit.any(byokit.Modality.Text, byokit.Modality.Image)` — Matches models producing either text or images.

```ts
// Pure text-only models
byokit.getModels({ filters: { output: byokit.exact(byokit.Modality.Text) } });

// All models capable of generating images
byokit.getModels(byokit.COMPLETE, {
  filters: { output: byokit.contain(byokit.Modality.Image) },
});
```

### Deterministic Sorting

Sort across providers before applying a result `limit`:

```ts
byokit.getModels(byokit.COMPLETE, { sort: byokit.ModelSort.PriceAscend }); // Input price: low → high
byokit.getModels(byokit.COMPLETE, { sort: byokit.ModelSort.PriceDescend }); // Input price: high → low
byokit.getModels(byokit.COMPLETE, { sort: byokit.ModelSort.SpeedDescend }); // Tokens/sec: high → low
byokit.getModels(byokit.COMPLETE, { sort: byokit.ModelSort.AlphabeticalAscend }); // Default
```

_Note: Non-USD and unknown prices sort last in either direction. Ties sort alphabetically. Generic Local entries remain appended._

### Filter Reference

| Filter Key           | Type / Enum                 | Description                                                                    |
| :------------------- | :-------------------------- | :----------------------------------------------------------------------------- |
| `speciality`         | `Speciality` or Matcher     | `General`, `Coding`, `Reasoning`, `Cybersecurity`, `Music`, `Voice`, `Medical` |
| `tier`               | `Tier` or Matcher           | `Flagship`, `Workhorse`, `Flash`, `Lite`, `Mini`                               |
| `input` / `output`   | `Modality` or Matcher       | `Text`, `Image`, `Audio`, `Video`                                              |
| `providerIds`        | `ProviderId` or Matcher     | `OpenAI`, `Anthropic`, `Google`, `DeepSeek`, etc.                              |
| `requiredFeatures`   | `FeatureName` or Matcher    | `FunctionCalling`, `JsonSchema`, `PromptCaching`, `ThinkingControls`, etc.     |
| `excludeTags`        | `Tag` or Matcher            | Tags to reject (e.g. `Tag.OriginChina`, `Tag.PricePremium`)                    |
| `minContextTokens`   | `number`                    | Minimum required context window                                                |
| `maxInputPricePerM`  | `number`                    | Maximum USD per 1M input tokens                                                |
| `maxOutputPricePerM` | `number`                    | Maximum USD per 1M output tokens                                               |
| `lifecycle`          | `Lifecycle` or Matcher      | `Live`, `Outdated`, `Retired`, `Uncertain`                                     |
| `releaseChannel`     | `ReleaseChannel` or Matcher | `Stable`, `Preview`, `Experimental`, `Unknown`                                 |
| `official`           | `boolean`                   | Restrict to canonical first-party creator endpoints                            |
| `callable`           | `boolean`                   | Filter reviewed text-generation adapter compatibility                          |
| `verified`           | `boolean`                   | Contributor-verified live inference call records                               |

---

## Step 2: Call the Model

`byokit` supports standard OpenAI and Anthropic client interfaces, plus a lightweight direct helper:

### 1. OpenAI Format

```ts
const client = new byokit.OpenAI({
  baseURL: model.connection.baseUrl,
  apiKey: process.env.MY_API_KEY,
});

const completion = await client.chat.completions.create({
  model: model.apiModelId,
  messages: [{ role: byokit.Role.User, content: 'Analyze this code' }],
});
```

### 2. Anthropic Format (Claude)

```ts
const client = new byokit.Anthropic({
  baseURL: model.connection.baseUrl,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const message = await client.messages.create({
  model: model.apiModelId,
  max_tokens: 1024,
  messages: [{ role: byokit.Role.User, content: 'Summarize this document' }],
});
```

### 3. Direct Helper

```ts
// One-liner stateless call:
const result = await byokit.call(model, 'Explain quantum computing in one sentence', apiKey);
console.log(result.choices[0].message.content);
```

### Credential Privacy

- Built-in execution sends credentials directly to the configured endpoint and does not persist keys to disk, browser storage, or telemetry. Keys remain in memory for active calls or reusable clients.
- Authenticated remote endpoints require HTTPS. HTTP on `localhost`, IPv4 loopback, and `::1` supports local development. Trusted development networks can explicitly opt in with `allowInsecureHttp: true` (Python: `allow_insecure_http=True`); this exposes credentials to that network.
- Python clients reject pickling, and their credential holder blocks generic JSON attribute dumps. Recreate clients from non-secret settings rather than serializing them. Returned results and normalized provider errors omit/redact the supplied key; do not dump clients, request headers, or process locals to logs.
- The picker defaults to an in-memory credential store. An application-provided `credentialStore` receives raw keys and can persist them. Custom fetch functions, callbacks, debugging tools, and storage adapters remain the application's responsibility.

---

## Step 3: Production Optimization (Build-Time Precompilation)

While `byokit.getModels()` is ideal for dynamic queries and interactive prototyping, evaluating dynamic queries at runtime parses the **20 MB** catalog snapshot.

Most production applications use a **fixed model query**. Precompiling your query at build time generates a static, typed ~15 KB module with **zero catalog runtime overhead**:

### 1. Declare your query in `byok.config.json`

> **Tip:** You can click **"Save config.json"** directly in the [interactive website explorer](https://staff-000.github.io/byokit/#explore) or call `byokit.getConfigJson(...)` in code.

```json
{
  "providerIds": ["anthropic", "google", "openai", "deepseek"],
  "local": false,
  "filters": {
    "speciality": "general",
    "tier": "flash"
  }
}
```

### 2. Compile at build time

```sh
# Node / TypeScript:
npx byokit build byok.config.json --out src/generated/models.js

# Python:
byokit build byok.config.json --out app/generated_models.py
```

This generates typed `OfferingId` and `ModelId` enums alongside your filtered models.

### 3. Import with zero overhead

Pair the generated file with `byokit/client` (~15 KB, contains the SDK client wrappers without the 20 MB catalog):

**TypeScript / JavaScript:**

```ts
import { getModels, OfferingId } from './generated/models.js';
import { OpenAI } from 'byokit/client';

const models = getModels(); // ~15 KB static data, instant load
const model = models.find((m) => m.id === OfferingId['google/gemini-3.8-flash']);

const client = new OpenAI({
  baseURL: model.connection.baseUrl,
  apiKey: process.env.GOOGLE_API_KEY ?? '',
});
```

**Python:**

```python
from app.generated_models import get_models, OfferingId
import byokit

models = get_models() # Instant load, no 20 MB JSON parsed
model = next(m for m in models if m["id"] == OfferingId.GOOGLE_GEMINI_3_8_FLASH)

client = byokit.OpenAI(base_url=model["connection"]["baseUrl"], api_key=api_key)
```

---

## Append Custom or Local Models

Append your own self-hosted or proprietary endpoints while preserving the unified `byokit` interface:

```ts
const models = byokit.appendModel(byokit.getModels(), {
  providerId: byokit.customProviderId('acme'),
  providerName: 'Acme AI',
  modelId: 'acme-deep-v1',
  baseUrl: 'https://api.acme.example.com/v1',
  protocol: byokit.ApiProtocol.OpenAI,
});

// Appended model can be passed directly to byokit.call() or new byokit.OpenAI()
```

_Custom entries are verified after user query filters, never mutate the shared catalog, and reject duplicate offering IDs._

---

## Pre-Flight Budget Fit Checking

Verify token budgets, context constraints, required features, and modalities before sending requests:

```sh
# CLI check
npx byokit check task.config.json --strict
```

Or programmatically in code:

```ts
const fit = byokit.checkModelFit(model, {
  estimatedInputTokens: 50_000,
  maxOutputTokens: 4_000,
  requiredFeatures: [byokit.FeatureName.FunctionCalling],
});

if (!fit.fits) {
  console.warn(`Model does not fit constraints: ${fit.reasons.join(', ')}`);
}
```

---

## Community Verification & Scheduled Releases

- **Browser Call Verification**: Verify hosted models with your own API key directly in your browser on the [Verification Page](https://staff-000.github.io/byokit/verification.html). Share successful reports to earn a **Model Verifier badge** on GitHub. API keys never leave your browser.
- **Automated Catalog Sync**: A GitHub Actions workflow syncs latest snapshots from Models.dev every 12 hours (`0 3,15 * * *`).
- **Scheduled Automated Releases**: Automatically bumps patch versions and publishes to npm and PyPI when significant updates accumulate (`0 18 * * *`).

---

## License & Acknowledgements

- Built on the open [Models.dev](https://models.dev) catalog. Thank you to its maintainers and community contributors.
- Licensed under the [MIT License](LICENSE).
