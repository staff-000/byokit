# @byokit/dom

Part of byokit: curated BYOK interfaces and compatibility checks.

See the project README for setup, examples, metadata semantics, and credential ownership.

```js
import { mountByok } from '@byokit/dom';
import '@byokit/dom/styles.css';
mountByok(element, { catalog, onSave: selection => save(selection) });
```

Provide application-owned credentialStore, onCheck and discoverLocal callbacks as needed.
