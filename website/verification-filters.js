import * as byokit from '../packages/byokit/catalog.js';
export function filterModels(state = {}) {
  let providerIds = byokit
    .getModels(byokit.COMPLETE, {
      local: false,
      sort: byokit.ModelSort.ProviderOrder,
      filters: { lifecycle: Object.values(byokit.Lifecycle), includeDeprecated: true },
    })
    .map((m) => m.providerId);
  providerIds = [...new Set(providerIds)];
  if (state.provider) providerIds = providerIds.filter((id) => id === state.provider);
  const filters = {
    lifecycle: state.includeOutdated
      ? Object.values(byokit.Lifecycle)
      : [byokit.Lifecycle.Live, byokit.Lifecycle.Uncertain],
    includeDeprecated: !!state.includeOutdated,
  };
  if (state.feature && state.feature !== 'any') filters.requiredFeatures = [state.feature];
  if (state.modality && state.modality !== 'any') filters.input = [state.modality];
  if (state.weights && state.weights !== 'any') filters.openWeights = state.weights === 'open';
  if (Number(state.context) > 0) filters.minContextTokens = Number(state.context);
  if (state.price && state.price !== 'any') filters.maxInputPricePerM = Number(state.price);
  if (state.region === 'china') filters.includeTags = [byokit.Tag.OriginChina];
  if (state.excludeTag) filters.excludeTags = [byokit.customTag(state.excludeTag)];
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
    providerIds,
    local: false,
    filters,
    sort,
  });

  if (!state.provider || state.provider === byokit.ProviderId.Local) {
    models.push(...byokit.getModels().filter((m) => m.local));
  }
  if (state.verification && state.verification !== 'any') {
    const vData = state.verifications ? { verifications: state.verifications } : undefined;
    models = models.filter((m) => {
      const summary = vData ? byokit.verificationSummary(vData, m.id) : m.verification;
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
