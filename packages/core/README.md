# @byokit/core

Part of byokit: curated BYOK interfaces and compatibility checks.

See the project README for setup, examples, metadata semantics, and credential ownership.

```js
import { Catalog, checkFit } from '@byokit/core';
import snapshot from '@byokit/core/catalog';
const catalog = new Catalog(snapshot);
const providers = catalog.select({ preset: 'china' });
```

The catalog export is optional; importing core alone does not load it. No runtime dependencies.
