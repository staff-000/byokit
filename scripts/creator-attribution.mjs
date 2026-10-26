import { readFileSync } from 'node:fs';
const attribution = JSON.parse(
  readFileSync(new URL('../catalog/creators.json', import.meta.url), 'utf8'),
);
export function creatorFor(modelId) {
  return attribution.models[modelId] ?? attribution.namespaces[modelId.split('/')[0]] ?? null;
}
