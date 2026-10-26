import { readFileSync } from 'node:fs';
const attribution = JSON.parse(
  readFileSync(new URL('../catalog/creators.json', import.meta.url), 'utf8'),
);
const rules = attribution.identifierRules.map((r) => ({ ...r, regex: new RegExp(r.pattern, 'i') }));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function namespaceCreator(identifier) {
  const parts = identifier.split('/');
  if (parts.length < 2) return null;
  return attribution.namespaces[parts[0].toLowerCase().replace(/^~/, '')] ?? null;
}
function identifierCreator(identifier) {
  const id = identifier.toLowerCase();
  // An explicit author namespace wins over family names in derivative model IDs.
  if (id.includes('/')) return namespaceCreator(id);
  return rules.find((r) => r.regex.test(id))?.creatorId ?? null;
}
export function creatorFor(modelId, offering = {}) {
  if (own(attribution.models, modelId)) return attribution.models[modelId];
  if (offering.providerId && modelId === `${offering.providerId}/${offering.apiModelId}`) {
    const identified = identifierCreator(offering.apiModelId);
    if (identified) return identified;
  }
  const canonical = namespaceCreator(modelId);
  if (canonical) return canonical;
  let identifier = offering.apiModelId;
  if (!identifier && offering.providerId && modelId.startsWith(offering.providerId + '/'))
    identifier = modelId.slice(offering.providerId.length + 1);
  if (!identifier) return null;
  const transform = attribution.providerTransforms[offering.providerId];
  if (transform) {
    const match = identifier.match(new RegExp(transform.pattern, 'i'));
    if (match)
      return transform.mode === 'namespace'
        ? (attribution.namespaces[match[1].toLowerCase()] ?? null)
        : identifierCreator(match[1]);
  }
  // Bedrock uses vendor.model IDs, optionally with an inference-region prefix.
  const bedrock = identifier.replace(/^(?:us|eu|apac|global)\./, '').match(/^([a-z0-9-]+)\.(.+)$/i);
  if (bedrock && attribution.namespaces[bedrock[1]]) return attribution.namespaces[bedrock[1]];
  return identifierCreator(identifier);
}
export function enrichCatalogCreators(catalog) {
  const byModel = new Map();
  for (const o of catalog.offerings) {
    if (!byModel.has(o.modelId)) byModel.set(o.modelId, []);
    byModel.get(o.modelId).push(o);
  }
  // Exact API identity may propagate attribution only if it has one known creator.
  const aliases = new Map();
  for (const o of catalog.offerings) {
    const creator = creatorFor(o.modelId, o);
    if (!creator) continue;
    if (!aliases.has(o.apiModelId)) aliases.set(o.apiModelId, new Set());
    aliases.get(o.apiModelId).add(creator);
  }
  for (const m of catalog.models) {
    if (own(attribution.models, m.id)) {
      m.creatorId = attribution.models[m.id];
      continue;
    }
    const hostedCandidates = new Set(
      (byModel.get(m.id) || [])
        .filter((o) => m.id === `${o.providerId}/${o.apiModelId}`)
        .map((o) => identifierCreator(o.apiModelId))
        .filter(Boolean),
    );
    if (hostedCandidates.size === 1) {
      m.creatorId = [...hostedCandidates][0];
      continue;
    }
    const canonical = creatorFor(m.id);
    if (canonical) {
      m.creatorId = canonical;
      continue;
    }
    const candidates = new Set();
    for (const o of byModel.get(m.id) || []) {
      const creator = creatorFor(m.id, o);
      if (creator) candidates.add(creator);
      const exact = aliases.get(o.apiModelId);
      if (exact?.size === 1) candidates.add([...exact][0]);
    }
    m.creatorId = candidates.size === 1 ? [...candidates][0] : (m.creatorId ?? null);
  }
  return creatorCoverage(catalog);
}
export function creatorCoverage(catalog) {
  const models = new Map(catalog.models.map((m) => [m.id, m]));
  const unresolvedModelIds = catalog.models
    .filter((m) => !m.creatorId)
    .map((m) => m.id)
    .sort();
  const unresolvedOpenRouterOfferingIds = catalog.offerings
    .filter((o) => o.providerId === 'openrouter' && !models.get(o.modelId)?.creatorId)
    .map((o) => o.id)
    .sort();
  return {
    totalModels: models.size,
    attributedModels: models.size - unresolvedModelIds.length,
    unresolvedModelIds,
    unresolvedOpenRouterOfferingIds,
  };
}
