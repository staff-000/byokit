import { creatorFor } from './creator-attribution.mjs';
/** Explicit local snapshot import. Does not download or change a trusted endpoint. */
import { callSupportFor } from '../packages/byokit/connection.js';
import { mergeManualCatalog } from './manual-catalog.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  validateCatalog,
  deriveTags,
  getModelSpeciality,
  getModelTier,
  getReleaseChannel,
} from '../packages/byokit/index.js';
const [source, ...args] = process.argv.slice(2);
if (!source)
  throw new Error(
    'Usage: node scripts/import-catalog.mjs snapshot.json [--out directory] [--verifications file]',
  );
const i = args.indexOf('--out'),
  out = resolve(i >= 0 ? args[i + 1] : 'catalog');
const observedIndex = args.indexOf('--observed-at');
let observedAt = observedIndex >= 0 ? args[observedIndex + 1] : undefined;
if (
  observedAt !== undefined &&
  (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(observedAt) || !Number.isFinite(Date.parse(observedAt)))
)
  throw new Error('Invalid snapshot observation timestamp');
const raw = await readFile(resolve(source)),
  snapshot = JSON.parse(raw),
  upstream = snapshot.providers,
  metadata = snapshot.models,
  overlay = JSON.parse(await readFile(new URL('../catalog/overlays.json', import.meta.url)));
if (!upstream || !metadata)
  throw new Error('Expected combined models.dev catalog with providers and models');
let previous;
try {
  previous = JSON.parse(await readFile(resolve(out, 'catalog.json'), 'utf8'));
} catch {}
if (!observedAt) {
  try {
    const previous = JSON.parse(await readFile(resolve(out, 'catalog.lock.json'), 'utf8'));
    if (previous.sha256 === createHash('sha256').update(raw).digest('hex'))
      observedAt = previous.observedAt;
  } catch {}
}
let catalog = {
  schemaVersion: 1,
  provenance: {
    source: 'https://models.dev/catalog.json?type=all',
    reviewedAt: (observedAt || new Date().toISOString()).slice(0, 10),
  },
  providers: [],
  families: [],
  models: [],
  offerings: [],
  presets: [
    { id: 'default', providerIds: [], offeringIds: [] },
    { id: 'global', providerIds: [] },
    { id: 'china', providerIds: [] },
    { id: 'official-flagship', providerIds: [], offeringIds: [] },
    { id: 'official', providerIds: [], offeringIds: [] },
    { id: 'text-process', providerIds: [] },
  ],
  assets: [],
};
const known = new Set(),
  families = new Set();
const feature = (value) => ({
  status: value === true ? 'supported' : value === false ? 'unsupported' : 'unknown',
  source: 'models.dev',
});
const number = (n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);
for (const [id, p] of Object.entries(upstream).sort(([a], [b]) => a.localeCompare(b))) {
  const curation = overlay.providers[id] || { presets: [] };
  if (['local', 'ollama'].includes(id)) continue;
  catalog.providers.push({
    id,
    name: p.name,
    docsUrl: p.doc,
    origin: curation.origin,
    auth: 'required',
    deployment: 'hosted',
    logoId: `provider:${id}`,
    tags: [
      ...(curation.origin ? [`origin:${curation.origin}`] : []),
      ...(curation.presets.includes('official') ? ['provider:official'] : []),
    ],
    provenance: { source: 'models.dev', reviewedAt: catalog.provenance.reviewedAt },
  });
  catalog.assets.push({
    id: `provider:${id}`,
    light: `https://models.dev/logos/${id}.svg`,
    source: 'https://github.com/anomalyco/models.dev',
    licenseNotice: 'Models.dev MIT; brand trademarks belong to their owners.',
  });
  for (const preset of curation.presets)
    catalog.presets.find((x) => x.id === preset).providerIds.push(id);
  if (['anthropic', 'google', 'openai', 'deepseek'].includes(id))
    catalog.presets.find((x) => x.id === 'text-process')?.providerIds.push(id);
  const entries = Object.values(p.models || {}).sort(
    (a, b) =>
      (b.release_date || '').localeCompare(a.release_date || '') || a.id.localeCompare(b.id),
  );
  // Discovery includes every operation; execution support is reviewed separately.
  for (const [rank, m] of entries.entries()) {
    const modelId = m.canonical_model_id || `${id}/${m.id}`,
      base = m.canonical_model_id ? metadata[m.canonical_model_id] : m,
      familyId = base?.family || modelId;
    if (!families.has(familyId)) {
      families.add(familyId);
      catalog.families.push({ id: familyId, name: familyId });
    }
    if (!known.has(modelId)) {
      known.add(modelId);
      catalog.models.push({
        id: modelId,
        creatorId: creatorFor(modelId),
        name: base?.name || modelId,
        familyId,
        type: base?.type,
        releaseDate: base?.release_date || null,
        lastUpdated: base?.last_updated || null,
        openWeights: typeof base?.open_weights === 'boolean' ? base.open_weights : null,
        commercialUse: 'unknown',
        license: base?.license || null,
        speciality: getModelSpeciality(base, base),
        tier: getModelTier(base, base),
        size: { totalParameters: null, activeParameters: null, architecture: 'unknown' },
        tags: base?.open_weights === true ? ['weights:open'] : [],
        provenance: { source: 'models.dev', reviewedAt: catalog.provenance.reviewedAt },
      });
    }
    const features = {
      functionCalling: feature(m.tool_call),
      parallelTools: feature(),
      forcedToolChoice: feature(),
      strictToolSchema: feature(),
      promptCaching: feature(),
      jsonMode: feature(),
      jsonSchema: feature(m.structured_output),
      strictJsonSchema: feature(),
      systemMessages: feature(),
      developerMessages: feature(),
      thinking: feature(m.reasoning),
      thinkingDisable: feature(),
      thinkingBudget: feature(),
      thinkingEffort: feature(),
    };
    if (Array.isArray(m.reasoning_options)) {
      for (const [name, type] of [
        ['thinkingDisable', 'toggle'],
        ['thinkingBudget', 'budget_tokens'],
        ['thinkingEffort', 'effort'],
      ]) {
        const opt = m.reasoning_options.find((o) => o.type === type);
        if (opt) features[name] = { ...feature(true), details: opt };
      }
    }
    // A cache price does not prove user-controllable caching or TTL support.
    const tags = Object.entries(features)
      .filter(([, f]) => f.status === 'supported')
      .map(([k]) => `cap:${k}`);
    if (typeof m.cost?.input === 'number' && typeof m.cost?.output === 'number') {
      const cost = (1000 * m.cost.input + 1000 * m.cost.output) / 1e6;
      tags.push(
        `price:${cost === 0 ? 'zero-token-rate' : cost <= 0.002 ? 'budget' : cost <= 0.02 ? 'mid' : 'premium'}`,
      );
    }
    if (m.limit?.context > 0)
      tags.push(
        `context:${m.limit.context >= 1000000 ? '1m+' : m.limit.context >= 128000 ? '128k+' : m.limit.context >= 32000 ? '32k+' : 'under-32k'}`,
      );
    tags.push(
      ...(m.modalities?.input || []).map((x) => `input:${x}`),
      ...(m.modalities?.output || []).map((x) => `output:${x}`),
      'deployment:hosted',
    );
    catalog.offerings.push({
      id: `${id}/${m.id}`,
      providerId: id,
      modelId,
      apiModelId: m.id,
      name: m.name,
      releaseDate: m.release_date || null,
      lastUpdated: m.last_updated || null,
      type: m.type,
      speciality: getModelSpeciality(m, base),
      tier: getModelTier(m, base),
      providerShape: m.provider?.shape,
      requiresProviderOverride: Boolean(
        m.provider && Object.keys(m.provider).some((key) => key !== 'shape'),
      ),
      callSupport: callSupportFor({
        providerId: id,
        apiModelId: m.id,
        modalities: m.modalities,
        type: m.type,
        providerShape: m.provider?.shape,
      }),
      deployment: 'hosted',
      hosting: { region: null, eligibility: 'unknown' },
      speed: { timeToFirstTokenMs: null, tokensPerSecond: null, source: null },
      rank,
      ...(observedAt
        ? { listingEvidence: { source: catalog.provenance.source, checkedAt: observedAt } }
        : {}),
      status: m.status || 'unknown',
      releaseChannel: getReleaseChannel({ apiModelId: m.id, status: m.status }),
      fileFormats: (m.modalities?.input || []).filter(
        (x) => !['text', 'image', 'audio', 'video', 'embedding'].includes(x),
      ),
      modalities: {
        input:
          m.modalities?.input?.filter((x) =>
            ['text', 'image', 'audio', 'video', 'embedding', 'pdf'].includes(x),
          ) || null,
        output:
          m.modalities?.output?.filter((x) =>
            ['text', 'image', 'audio', 'video', 'embedding', 'pdf'].includes(x),
          ) || null,
      },
      limits: {
        context: number(m.limit?.context) || null,
        input: number(m.limit?.input) || null,
        output: number(m.limit?.output) || null,
        contextAccounting: 'unknown',
      },
      features,
      price: {
        currency: 'USD',
        unit: 'per-million-tokens',
        reasoning: number(m.cost?.reasoning),
        inputAudio: number(m.cost?.input_audio),
        outputAudio: number(m.cost?.output_audio),
        input: number(m.cost?.input),
        output: number(m.cost?.output),
        cacheRead: number(m.cost?.cache_read),
        cacheWrite: number(m.cost?.cache_write),
        tiers: m.cost?.tiers || [],
      },
      tags,
      provenance: { source: 'models.dev', reviewedAt: catalog.provenance.reviewedAt },
    });
  }
}
for (const preset of catalog.presets)
  preset.providerIds.sort(
    (a, b) => Object.keys(overlay.providers).indexOf(a) - Object.keys(overlay.providers).indexOf(b),
  );
for (const id of ['ollama', 'local']) {
  catalog.providers.push({
    id,
    name: id === 'ollama' ? 'Ollama (local)' : 'Local OpenAI-compatible',
    auth: 'optional',
    deployment: 'local',
    tags: ['deployment:local'],
  });
  // No fabricated model capabilities: the UI supports installed discovery and custom IDs.
  const modelId = `${id}/custom`;
  catalog.models.push({
    id: modelId,
    name: 'Custom local model',
    openWeights: null,
    commercialUse: 'unknown',
    license: null,
    speciality: 'unknown',
    tier: 'unknown',
    tags: [],
  });
  catalog.offerings.push({
    id: modelId,
    providerId: id,
    modelId,
    apiModelId: '',
    name: 'Enter an installed model ID',
    deployment: 'local',
    speciality: 'unknown',
    tier: 'unknown',
    modalities: { input: null, output: null },
    limits: { context: null, input: null, output: null, contextAccounting: 'unknown' },
    features: {},
    price: { currency: 'USD', input: null, output: null },
    tags: ['deployment:local'],
  });
  for (const p of catalog.presets)
    if (p.id !== 'text-process' && (id === 'local' || p.id !== 'default')) p.providerIds.push(id);
}
const manualIndex = args.indexOf('--manual');
const manual =
  manualIndex >= 0
    ? JSON.parse(await readFile(resolve(args[manualIndex + 1]), 'utf8'))
    : i >= 0
      ? {
          schemaVersion: 1,
          providers: [],
          models: [],
          families: [],
          offerings: [],
          assets: [],
          presets: [],
        }
      : JSON.parse(await readFile(new URL('../catalog/manual.json', import.meta.url), 'utf8'));
// Carry explicit evidence forward without refreshing its timestamp.
for (const old of previous?.offerings || []) {
  if (manual.offerings?.some((o) => o.id === old.id)) continue;
  const current = catalog.offerings.find((o) => o.id === old.id);
  const explicit =
    old.status === 'deprecated' ||
    old.lifecycleEvidence?.basis === 'provider' ||
    old.lifecycleEvidence?.status === 'OUTDATED';
  if (current && explicit && old.lifecycleEvidence)
    current.lifecycleEvidence = old.lifecycleEvidence;
  if (
    !current &&
    explicit &&
    (old.status === 'deprecated' || old.lifecycleEvidence?.status === 'OUTDATED')
  ) {
    catalog.offerings.push(old);
    for (const [collection, id] of [
      ['providers', old.providerId],
      ['models', old.modelId],
    ]) {
      if (
        !catalog[collection].some((x) => x.id === id) &&
        !manual[collection]?.some((x) => x.id === id)
      )
        catalog[collection].push(previous[collection].find((x) => x.id === id));
    }
    const model = previous.models.find((x) => x.id === old.modelId);
    if (model?.familyId && !catalog.families.some((x) => x.id === model.familyId))
      catalog.families.push(previous.families.find((x) => x.id === model.familyId));
  }
}
catalog = mergeManualCatalog(catalog, manual);
// Explicit evidence-backed overlays; identities/endpoints/auth cannot be overridden.
for (const [collection, allowed] of [
  [
    'models',
    ['origin', 'openWeights', 'commercialUse', 'license', 'size', 'tags', 'speciality', 'tier'],
  ],
  [
    'offerings',
    [
      'modalities',
      'fileFormats',
      'limits',
      'features',
      'price',
      'tags',
      'speed',
      'hosting',
      'rank',
      'status',
      'releaseChannel',
      'speciality',
      'tier',
      'releaseDate',
      'lifecycleEvidence',
      'popularityEvidence',
    ],
  ],
]) {
  for (const [id, override] of Object.entries(overlay[collection] || {})) {
    const record = catalog[collection].find((x) => x.id === id);
    if (!record) throw new Error(`Overlay target missing: ${id}`);
    if (
      typeof override.source !== 'string' ||
      typeof override.reviewedAt !== 'string' ||
      !override.fields
    )
      throw new Error('Overlay evidence required');
    for (const [key, value] of Object.entries(override.fields)) {
      if (!allowed.includes(key)) throw new Error(`Unapproved overlay field: ${key}`);
      record[key] =
        value && typeof value === 'object' && !Array.isArray(value)
          ? { ...(record[key] || {}), ...value }
          : value;
    }
    record.provenance = { source: override.source, reviewedAt: override.reviewedAt };
  }
}
for (const o of catalog.offerings) {
  // A reviewed canonical correction applies unless this offering has an explicit correction.
  for (const field of ['speciality', 'tier']) {
    const canonical = overlay.models?.[o.modelId]?.fields?.[field];
    if (
      canonical &&
      !overlay.offerings?.[o.id]?.fields?.[field] &&
      !manual.offerings?.some((m) => m.id === o.id && m[field])
    )
      o[field] = canonical;
  }
  o.callSupport = callSupportFor(o);
}
const recommendations = JSON.parse(
  await readFile(new URL('../catalog/recommendations.json', import.meta.url), 'utf8'),
);
catalog.recommendations = recommendations;
const defaults = catalog.presets.find((p) => p.id === 'default');
const defaultRecommendedIds = recommendations
  .filter((r) => r.default === true)
  .map((r) => r.offeringId);
for (const id of defaultRecommendedIds) {
  const o = catalog.offerings.find((o) => o.id === id);
  if (
    !o ||
    o.status === 'deprecated' ||
    ['preview', 'experimental'].includes(getReleaseChannel(o)) ||
    !o.callSupport?.textGeneration
  )
    continue;
  defaults.offeringIds.push(o.id);
  if (!defaults.providerIds.includes(o.providerId)) defaults.providerIds.push(o.providerId);
}
const flagships = [
  'openai/gpt-6.1-sol',
  'anthropic/claude-opus-5-5',
  'google/gemini-4-argon',
  'mistral/mistral-large-4',
  'deepseek/deepseek-v4-pro',
  'zhipuai/glm-5.3',
];
for (const pid of ['official-flagship', 'official']) {
  const p = catalog.presets.find((x) => x.id === pid);
  if (p) {
    p.offeringIds = [];
    for (const id of flagships) {
      const o = catalog.offerings.find((o) => o.id === id);
      if (!o || o.status === 'deprecated' || !o.callSupport?.textGeneration) continue;
      p.offeringIds.push(o.id);
      if (!p.providerIds.includes(o.providerId)) p.providerIds.push(o.providerId);
    }
  }
}
for (const m of catalog.models) {
  m.tags = (m.tags || []).filter((t) => !t.startsWith('speciality:') && !t.startsWith('tier:'));
  m.tags.push(`speciality:${m.speciality}`, `tier:${m.tier}`);
}
for (const o of catalog.offerings)
  o.tags = deriveTags(
    o,
    catalog.models.find((m) => m.id === o.modelId),
  );
const verificationIndex = args.indexOf('--verifications');
const verificationFile =
  verificationIndex >= 0
    ? resolve(args[verificationIndex + 1])
    : new URL('../catalog/verifications.json', import.meta.url);
catalog.verifications = JSON.parse(await readFile(verificationFile, 'utf8'));
const errors = validateCatalog(catalog);
if (errors.length) throw new Error(errors.join('; '));
await mkdir(out, { recursive: true });
const destination = resolve(out, 'catalog.json');
const semantic = ({ listingEvidence: _listing, provenance: _provenance, ...record }) => record;
if (previous) {
  const old = new Map(previous.offerings.map((o) => [o.id, o])),
    next = new Map(catalog.offerings.map((o) => [o.id, o]));
  const diff = {
    providersAdded: catalog.providers
      .map((p) => p.id)
      .filter((id) => !previous.providers.some((p) => p.id === id)),
    providersRemoved: previous.providers
      .map((p) => p.id)
      .filter((id) => !catalog.providers.some((p) => p.id === id)),
    modelsChanged: catalog.models
      .filter((m) =>
        previous.models.some(
          (old) => old.id === m.id && JSON.stringify(semantic(old)) !== JSON.stringify(semantic(m)),
        ),
      )
      .map((m) => m.id),
    recommendationsChanged:
      JSON.stringify(previous.recommendations) !== JSON.stringify(catalog.recommendations),
    added: [...next.keys()].filter((id) => !old.has(id)),
    removed: [...old.keys()].filter((id) => !next.has(id)),
    changed: [...next]
      .filter(
        ([id, o]) =>
          old.has(id) && JSON.stringify(semantic(o)) !== JSON.stringify(semantic(old.get(id))),
      )
      .map(([id]) => id),
    details: [...next]
      .filter(([id]) => old.has(id))
      .flatMap(([id, o]) => {
        const fields = Array.from(
          new Set([...Object.keys(semantic(o)), ...Object.keys(semantic(old.get(id)))]),
        ).filter((key) => JSON.stringify(o[key]) !== JSON.stringify(old.get(id)[key]));
        return fields.length ? [{ id, fields }] : [];
      }),
  };
  await writeFile(resolve(out, 'changes.json'), JSON.stringify(diff, null, 2) + '\n');
}
const unresolvedCreators = catalog.offerings
  .filter(
    (o) =>
      o.providerId === 'openrouter' && !catalog.models.find((m) => m.id === o.modelId)?.creatorId,
  )
  .map((o) => o.id);
await writeFile(
  resolve(out, 'creator-coverage.json'),
  JSON.stringify({ unresolvedOpenRouterOfferingIds: unresolvedCreators }, null, 2) + '\n',
);
if (unresolvedCreators.length)
  console.warn(
    `Creator attribution unresolved for ${unresolvedCreators.length} OpenRouter offerings; see creator-coverage.json`,
  );
await writeFile(destination, JSON.stringify(catalog, null, 2) + '\n');
await writeFile(
  resolve(out, 'catalog.lock.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      source: 'https://models.dev/catalog.json?type=all',
      sha256: createHash('sha256').update(raw).digest('hex'),
      overlaySha256: createHash('sha256').update(JSON.stringify(overlay)).digest('hex'),
      manualSha256: createHash('sha256').update(JSON.stringify(manual)).digest('hex'),
      verificationsSha256: createHash('sha256')
        .update(JSON.stringify(catalog.verifications))
        .digest('hex'),
      recommendationsSha256: createHash('sha256')
        .update(JSON.stringify(recommendations))
        .digest('hex'),
      observedAt: observedAt || null,
      generatedAt: catalog.provenance.reviewedAt,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Imported ${catalog.providers.length} providers and ${catalog.offerings.length} offerings`,
);

if (i < 0) {
  const byokitPkg = new URL('../packages/byokit/', import.meta.url),
    python = new URL('../packages/python/src/byokit/data/', import.meta.url);
  await mkdir(python, { recursive: true });
  await writeFile(
    new URL('catalog.js', byokitPkg),
    'import { Catalog } from "./core.js";\nconst data = ' +
      JSON.stringify(catalog) +
      ';\nexport default data;\nexport * from "./core.js";\nlet defaultCatalog;\n' +
      'export const catalog = new Catalog(data, { trusted: true });\n' +
      'export function getModels(input = {}, options) {\n' +
      '  if (!defaultCatalog) defaultCatalog = new Catalog(data, { trusted: true });\n' +
      '  return defaultCatalog.getModels(input, options);\n' +
      '}\n' +
      'export function getEquivalentModels(seeds, config = {}) {\n' +
      '  if (!defaultCatalog) defaultCatalog = new Catalog(data, { trusted: true });\n' +
      '  return defaultCatalog.getEquivalentModels(seeds, config);\n' +
      '}\n' +
      'export function getModelsByProvider(input = {}, options) {\n' +
      '  if (!defaultCatalog) defaultCatalog = new Catalog(data, { trusted: true });\n' +
      '  return defaultCatalog.getModelsByProvider(input, options);\n' +
      '}\n' +
      'export function addVerifications(records) {\n' +
      '  if (!defaultCatalog) defaultCatalog = new Catalog(data, { trusted: true });\n' +
      '  return defaultCatalog.addVerifications(records);\n' +
      '}\n' +
      'export function getConfig(input = {}, options) {\n' +
      '  if (!defaultCatalog) defaultCatalog = new Catalog(data, { trusted: true });\n' +
      '  return defaultCatalog.getConfig(input, options);\n' +
      '}\n' +
      'export function getConfigJson(input = {}, options, indent = 2) {\n' +
      '  if (!defaultCatalog) defaultCatalog = new Catalog(data, { trusted: true });\n' +
      '  return defaultCatalog.getConfigJson(input, options, indent);\n' +
      '}\n' +
      'export const toConfig = getConfig;\n' +
      'export const toConfigJson = getConfigJson;\n',
  );
  await writeFile(new URL('catalog.json', python), JSON.stringify(catalog) + '\n');
}
