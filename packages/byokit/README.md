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
