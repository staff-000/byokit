# byokit

Add BYOK with a model list and one simple call. Keep your model choices fresh.

## Installation

```bash
npm install byokit
```

## Quick Start

### 1. Catalog & Client Discovery

```js
import * as byokit from 'byokit/catalog';

// Discover models matching criteria
const models = byokit.getModels({
  providerIds: [byokit.ProviderId.DeepSeek],
  local: false,
});

const model = models[0];
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

### Production Optimization: Build-Time Precompilation

For production apps with a fixed query, avoid loading the 20 MB catalog at runtime by precompiling at build time:

1. Create `byok.config.json` (or click **Save config.json** in the explorer/playground, or call `byokit.getConfigJson(...)`):

```json
{
  "providerIds": ["anthropic", "google", "openai", "deepseek"],
  "local": false,
  "filters": {
    "includeTags": ["model:flash"]
  }
}
```

2. Run `npx byokit build byok.config.json --out src/generated/models.js`

3. Import without the 20 MB catalog:

```ts
import { getModels, OfferingId } from './generated/models.js';
import { OpenAI } from 'byokit/client';

const models = getModels(); // ~15 KB static module, zero runtime parsing
const model = models.find((m) => m.id === OfferingId['google/gemini-3.8-flash']);
```

### 2. DOM Key Picker & Settings UI

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

### 3. React Component

```jsx
import { ByokSettings } from 'byokit/react';
import 'byokit/dom/styles.css';

function Settings() {
  return (
    <ByokSettings
      options={{
        catalog,
        onSave: (selection) => console.log(selection),
      }}
    />
  );
}
```

### 4. CLI

```bash
npx byokit check config.json --strict
```

## Exports

- `byokit`: Core APIs (`Catalog`, `createByokClient`, `callModel`, validation)
- `byokit/catalog`: Bundled model catalog, SDK client wrappers (`OpenAI`, `Anthropic`, `GoogleGenAI`), `getModels()`
- `byokit/enums`: Type-safe enums (`ProviderId`, `Modality`, `Role`, etc.)
- `byokit/dom`: Vanilla DOM modal / picker interface (`mountByok`, `discoverLocal`)
- `byokit/dom/styles.css`: CSS styling for modal and picker
- `byokit/react`: React wrapper component (`ByokSettings`)
- `byokit/assets/*`: Provider SVGs and metadata

## License

MIT © [staff-000](https://github.com/staff-000)

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
