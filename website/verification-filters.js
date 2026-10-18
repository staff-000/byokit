import * as byokit from '../packages/byokit/catalog.js';
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
  if (state.provider) providerIds = providerIds.filter((id) => id === state.provider);
  const filters = {
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

  if (!state.provider || state.provider === byokit.ProviderId.Local) {
    let locals = byokit.getModels().filter((m) => m.local);
    if (state.feature && state.feature !== 'any') locals = [];
    if (state.modality && state.modality !== 'any') locals = [];
    if (state.speciality && state.speciality !== 'any')
      locals = locals.filter((m) => m.speciality === state.speciality);
    if (state.tier && state.tier !== 'any') locals = locals.filter((m) => m.tier === state.tier);
    models.push(...locals);
  }
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
  if (state.callableOnly) models = models.filter((m) => m.local || m.callSupport?.textGeneration);
  if (state.sort === 'release')
    models.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));

  return models;
}
