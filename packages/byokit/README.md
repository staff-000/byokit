# @staff-000/byokit

Bring-Your-Own-Key model catalog, routing, inference, and UI components for web and Node.js.

## Installation

```bash
npm install @staff-000/byokit
```

## Quick Start

### 1. Catalog & Client Discovery

```js
import * as byokit from '@staff-000/byokit/catalog';

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
import { mountByok } from '@staff-000/byokit/dom';
import '@staff-000/byokit/dom/styles.css';

const ui = mountByok(document.getElementById('picker'), {
  catalog: (await import('@staff-000/byokit/catalog')).default,
  onSave: (selection) => {
    console.log('Selected model:', selection);
  },
});
```

### 3. React Component

```jsx
import { ByokSettings } from '@staff-000/byokit/react';
import '@staff-000/byokit/dom/styles.css';

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
npx @staff-000/byokit check config.json --strict
```

## Exports

- `@staff-000/byokit`: Core APIs (`Catalog`, `createByokClient`, `callModel`, validation)
- `@staff-000/byokit/catalog`: Bundled model catalog, SDK client wrappers (`OpenAI`, `Anthropic`, `GoogleGenAI`), `getModels()`
- `@staff-000/byokit/enums`: Type-safe enums (`ProviderId`, `Modality`, `Role`, etc.)
- `@staff-000/byokit/dom`: Vanilla DOM modal / picker interface (`mountByok`, `discoverLocal`)
- `@staff-000/byokit/dom/styles.css`: CSS styling for modal and picker
- `@staff-000/byokit/react`: React wrapper component (`ByokSettings`)
- `@staff-000/byokit/assets/*`: Provider SVGs and metadata

## License

MIT © [staff-000](https://github.com/staff-000)
