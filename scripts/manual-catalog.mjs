import { readFile } from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';
import { validateCatalog } from '../packages/byokit/index.js';
const schema = JSON.parse(
  await readFile(new URL('../catalog/catalog.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);
export function mergeManualCatalog(catalog, manual) {
  if (
    !manual ||
    typeof manual !== 'object' ||
    Array.isArray(manual) ||
    Object.keys(manual).some(
      (k) =>
        ![
          'schemaVersion',
          'providers',
          'models',
          'families',
          'offerings',
          'assets',
          'presets',
        ].includes(k),
    ) ||
    manual.schemaVersion !== 1
  )
    throw new Error('Invalid manual catalog fields');
  const result = structuredClone(catalog);
  for (const key of ['providers', 'models', 'families', 'offerings', 'assets']) {
    if (manual[key] !== undefined && !Array.isArray(manual[key]))
      throw new Error('Invalid manual collection');
    const ids = new Set((result[key] || []).map((x) => x.id));
    for (const entry of manual[key] || []) {
      if (!entry || typeof entry.id !== 'string' || ids.has(entry.id))
        throw new Error('Duplicate or missing manual ID');
      if (
        ['providers', 'models', 'offerings'].includes(key) &&
        (!entry.provenance?.source ||
          !/^https:\/\//.test(entry.provenance.source) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(entry.provenance.reviewedAt || ''))
      )
        throw new Error('Manual entries need dated HTTPS evidence');
      (result[key] ??= []).push(structuredClone(entry));
      ids.add(entry.id);
    }
  }
  // Manual presets extend existing shortlists explicitly. No silent replacement.
  for (const preset of manual.presets || []) {
    if (!preset || typeof preset.id !== 'string' || !Array.isArray(preset.providerIds))
      throw new Error('Invalid manual preset');
    const existing = result.presets.find((p) => p.id === preset.id);
    if (existing)
      existing.providerIds = [...new Set([...existing.providerIds, ...preset.providerIds])];
    else result.presets.push(structuredClone(preset));
  }
  const global = result.presets.find((p) => p.id === 'global');
  if (global)
    global.providerIds = [
      ...new Set([...global.providerIds, ...(manual.providers || []).map((p) => p.id)]),
    ];
  const errors = validateCatalog(result);
  if (errors.length || !validate(result))
    throw new Error(
      'Invalid manual catalog: ' + (errors.join('; ') || JSON.stringify(validate.errors)),
    );
  return result;
}
