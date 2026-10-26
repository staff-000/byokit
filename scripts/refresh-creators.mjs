// Refresh attribution only; preserve the pinned upstream snapshot and provider configuration.
import { readFile, writeFile } from 'node:fs/promises';
import { enrichCatalogCreators } from './creator-attribution.mjs';
const root = new URL('../', import.meta.url);
const data = JSON.parse(await readFile(new URL('catalog/catalog.json', root), 'utf8'));
const report = enrichCatalogCreators(data);
await writeFile(new URL('catalog/catalog.json', root), JSON.stringify(data, null, 2) + '\n');
await writeFile(
  new URL('catalog/creator-coverage.json', root),
  JSON.stringify(report, null, 2) + '\n',
);
const js = new URL('packages/byokit/catalog.js', root);
let source = await readFile(js, 'utf8');
const start = source.indexOf('const data = ') + 'const data = '.length;
const end = source.indexOf('\n', start);
if (start < 13 || end < start) throw new Error('Unexpected bundled catalog format');
await writeFile(js, source.slice(0, start) + JSON.stringify(data) + ';' + source.slice(end));
await writeFile(
  new URL('packages/python/src/byokit/data/catalog.json', root),
  JSON.stringify(data) + '\n',
);
console.log(
  `${report.attributedModels}/${report.totalModels} models attributed; ${report.unresolvedOpenRouterOfferingIds.length} OpenRouter offerings unresolved.`,
);
