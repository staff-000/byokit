import * as byokit from '../packages/byokit/catalog.js';

export const OFFICIAL_PROVIDER_PREFIXES = [
  'openai',
  'anthropic',
  'google',
  'mistral',
  'deepseek',
  'zhipuai',
  'moonshotai',
  'kimi',
  'sakana',
  'minimax',
  'xiaomi',
  'xai',
  'tencent',
  'alibaba',
  'stepfun',
  'perplexity',
  'llama',
  'meta',
  'cohere',
  'volcengine',
  'sensenova',
  'upstage',
  'ai21',
  'bailing',
  'zai',
];

export function isOfficialProvider(providerId, provider) {
  if (!providerId) return false;
  if (provider?.tags?.includes(byokit.Tag.ProviderOfficial)) return true;
  return OFFICIAL_PROVIDER_PREFIXES.some(
    (prefix) => providerId === prefix || providerId.startsWith(prefix + '-'),
  );
}

export function filterModels(state = {}) {
  let providerIds = byokit
    .getModels(byokit.COMPLETE, {
      local: false,
      sort: byokit.ModelSort.ProviderOrder,
      filters: {
        lifecycle: byokit.any(...Object.values(byokit.Lifecycle)),
        includeDeprecated: true,
      },
    })
    .map((m) => m.providerId);
  providerIds = [...new Set(providerIds)];
  if (state.officialOnly) {
    if (!state.provider || isOfficialProvider(state.provider)) {
      providerIds = providerIds.filter((id) => isOfficialProvider(id));
    }
  }
  if (state.provider) providerIds = providerIds.filter((id) => id === state.provider);
  const filters = {
    ...(state.callableOnly !== false ? { callable: true } : {}),
    lifecycle: state.includeOutdated
      ? byokit.any(...Object.values(byokit.Lifecycle))
      : byokit.any(byokit.Lifecycle.Live, byokit.Lifecycle.Uncertain),
    includeDeprecated: !!state.includeOutdated,
  };
  if (state.feature && state.feature !== 'any')
    filters.requiredFeatures = byokit.any(state.feature);
  if (state.modality && state.modality !== 'any') filters.input = byokit.any(state.modality);
  if (state.weights && state.weights !== 'any') filters.openWeights = state.weights === 'open';
  if (state.speciality && state.speciality !== 'any')
    filters.speciality = byokit.exact(state.speciality);
  if (state.tier && state.tier !== 'any') filters.tier = byokit.exact(state.tier);
  if (Number(state.context) > 0) filters.minContextTokens = Number(state.context);
  if (state.price && state.price !== 'any') filters.maxInputPricePerM = Number(state.price);
  if (state.region === 'china') filters.includeTags = byokit.any(byokit.Tag.OriginChina);
  if (state.excludeTag) filters.excludeTags = byokit.any(byokit.customTag(state.excludeTag));
  let sort = Object.values(byokit.ModelSort).includes(state.sort)
    ? state.sort
    : byokit.ModelSort.ProviderOrder;
  if (
    [
      byokit.ModelSort.Speed,
      byokit.ModelSort.SpeedAscend,
      byokit.ModelSort.SpeedDescend,
      'speed',
      'speedAscend',
      'speedDescend',
    ].includes(sort)
  ) {
    sort = byokit.ModelSort.ProviderOrder;
  }
  let models = byokit.getModels(byokit.COMPLETE, {
    providerIds: byokit.any(...providerIds),
    local: false,
    filters,
    sort,
  });

  if (state.verification && state.verification !== 'any') {
    const vData = state.verifications ? { verifications: state.verifications } : undefined;
    models = models.filter((m) => {
      const summary = vData ? byokit.verificationSummary(vData, m.id) : m.verification;
      if (['failed', 'verified to be failure'].includes(state.verification))
        return summary?.records?.some(
          (r) =>
            (r.assessment
              ? r.assessment.checks.textGeneration !== 'passed'
              : r.result === 'failed') &&
            Date.parse(r.checkedAt) <= Date.now() &&
            Date.parse(r.checkedAt) >= Date.now() - 90 * 86400000,
        );
      return (
        summary?.communityStatus === state.verification || summary?.status === state.verification
      );
    });
  }
  const search = (state.search || '').trim().toLowerCase();
  if (search)
    models = models.filter((m) =>
      [m.name, m.apiModelId, m.provider.name, ...m.tags, ...m.model.tags]
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  if (state.sort === 'release')
    models.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));

  return models;
}
