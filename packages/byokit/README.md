# byokit

Add BYOK with a model list and one simple call. Keep your model choices fresh.

[Try the JavaScript Playground](https://staff-000.github.io/byokit/#playground) · [Model Explorer](https://staff-000.github.io/byokit/#explore) · [Verify Models](https://staff-000.github.io/byokit/verification.html) · [GitHub Repository](https://github.com/staff-000/byokit)

---

## Installation

```bash
npm install byokit
```

---

## Quick Start

### 1. Model Discovery + Inference in Two Calls

```js
import * as byokit from 'byokit/catalog';

// Discover recommended models
const [model] = byokit.getModels({
  providerIds: byokit.exact(byokit.ProviderId.DeepSeek),
  local: false,
  limit: 1,
});

if (!model?.connection) throw new Error('No model found');

// Run inference with familiar OpenAI-compatible client
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

---

## Presets, Speciality & Matchers

```js
// Curated presets:
byokit.getModels(); // DEFAULT reviewed models + Local
byokit.getModels(byokit.COMPLETE); // All models & modalities
byokit.getModels(byokit.GLOBAL); // Global editorial providers
byokit.getModels(byokit.CHINA); // China provider shortlist
byokit.getModels(byokit.OFFICIAL); // First-party creator offerings

// Required fields: speciality & tier
byokit.getModels(byokit.COMPLETE, {
  filters: {
    speciality: byokit.Speciality.General,
    tier: byokit.Tier.Flash,
  },
});

// Composable matchers: exact, any, contain, exclude, and, or, xor, not
byokit.getModels(byokit.COMPLETE, {
  filters: {
    output: byokit.exact(byokit.Modality.Text),
    tier: byokit.or(
      byokit.and(byokit.exact(byokit.Tier.Flagship), byokit.not(byokit.Tier.Lite)),
      byokit.exact(byokit.Tier.Flash),
    ),
  },
});
```

---

## Production Optimization: Build-Time Precompilation

For production apps with a fixed query, precompile at build time to avoid loading the 20 MB catalog at runtime:

1. Create `byok.config.json` (or click **Save config.json** in the explorer/playground):

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

2. Run the build compiler:

```bash
npx byokit build byok.config.json --out src/generated/models.js
```

3. Import with zero catalog overhead (~15 KB vs 20 MB):

```ts
import { getModels, OfferingId } from './generated/models.js';
import { OpenAI } from 'byokit/client';

const models = getModels();
const model = models.find((m) => m.id === OfferingId['google/gemini-3.8-flash']);

const client = new OpenAI({
  baseURL: model.connection.baseUrl,
  apiKey: process.env.GOOGLE_API_KEY ?? '',
});
```

---

## UI Components

### Vanilla DOM Key Picker

```js
import { mountByok } from 'byokit/dom';
import 'byokit/dom/styles.css';

const ui = mountByok(document.getElementById('picker'), {
  catalog: (await import('byokit/catalog')).default,
  onSave: (selection) => {
    console.log('Selected model:', selection);
  },
});
```

### React Settings Component

```jsx
import { ByokSettings } from 'byokit/react';
import 'byokit/dom/styles.css';

function Settings({ catalog }) {
  return (
    <ByokSettings
      options={{
        catalog,
        onSave: (selection) => console.log('Saved:', selection),
      }}
    />
  );
}
```

---

## CLI Tools

```bash
# Check token budget & model constraints offline
npx byokit check config.json --strict

# Compile fixed model queries at build time
npx byokit build byok.config.json --out src/generated/models.js
```

---

## Package Exports

- `byokit`: Core APIs (`Catalog`, `createByokClient`, `callModel`, validation)
- `byokit/catalog`: Bundled model catalog, SDK client wrappers (`OpenAI`, `Anthropic`), `getModels()`
- `byokit/client`: Lightweight SDK client wrappers (~15 KB, no catalog included)
- `byokit/enums`: Type-safe enums (`ProviderId`, `Modality`, `Speciality`, `Tier`, `Role`, etc.)
- `byokit/dom`: Vanilla DOM modal / picker interface (`mountByok`, `discoverLocal`)
- `byokit/dom/styles.css`: CSS styling for modal and picker
- `byokit/react`: React wrapper component (`ByokSettings`)
- `byokit/assets/*`: Provider SVGs and metadata

---

## License

MIT © [staff-000](https://github.com/staff-000)

### Credential safety

Built-in execution keeps keys in memory and sends them directly to the configured endpoint, with redirects disabled. It does not persist keys or send telemetry. Authenticated remote calls require HTTPS; loopback HTTP supports local development. For trusted development networks only, explicitly pass `allowInsecureHttp: true` (Python: `allow_insecure_http=True`). Custom headers on remote HTTP require the same opt-in.

The picker's default store is in memory; custom credential stores receive raw keys and control persistence. Credential references are scoped by provider and known connection. Python clients reject pickling and block generic JSON attribute dumps of credentials. Serialize non-secret settings and recreate clients. Application callbacks, debugging tools, and custom transports control their own logging and must not log keys or headers.
