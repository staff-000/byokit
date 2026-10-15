export const playgroundExamples = {
  price: {
    label: 'Sort by price',
    code: `const models = byokit.getModels(byokit.COMPLETE, {
  sort: byokit.ModelSort.PriceAscend,
  limit: 5,
  local: false,
});
console.log(models.map(model => ({
  provider: model.provider.name,
  model: model.apiModelId,
  inputPrice: model.price.input,
  context: model.limits.context,
})));`,
  },
  shortlist: {
    label: 'Default shortlist',
    code: `const models = byokit.getModels();
console.log(models.map(model => ({
  provider: model.provider.name,
  model: model.apiModelId || '(configure local server)',
})));`,
  },
  filter: {
    label: 'Filter and exclude tags',
    code: `const models = byokit.getModels(byokit.COMPLETE, {
  local: false,
  limit: 5,
  sort: byokit.ModelSort.AlphabeticalAscend,
  filters: {
    requiredFeatures: [byokit.FeatureName.FunctionCalling],
    minContextTokens: 32_000,
    excludeTags: [byokit.Tag.OriginChina, byokit.Tag.PricePremium],
  },
});
console.log(models.map(model => ({
  provider: model.provider.name,
  model: model.apiModelId,
  context: model.limits.context,
})));`,
  },
  speed: {
    label: 'Sort by speed',
    code: `const models = byokit.getModels(byokit.COMPLETE, {
  sort: byokit.ModelSort.SpeedDescend,
  limit: 5,
  local: false,
});
console.log(models.map(model => ({
  model: model.apiModelId,
  tokensPerSecond: model.speed?.tokensPerSecond ?? null,
})));
// Unknown measurements remain null and sort last.`,
  },
  custom: {
    label: 'Append a custom model',
    code: `const models = byokit.appendModel(byokit.getModels(), {
  providerId: byokit.customProviderId('acme'),
  providerName: 'Acme',
  modelId: 'my-model',
  baseUrl: 'https://api.example.com/v1',
  protocol: byokit.ApiProtocol.OpenAI,
});
console.log(models.at(-1));
// Appending is offline. No request is sent to this endpoint.`,
  },
  inspect: {
    label: 'Inspect full model metadata',
    code: `const [model] = byokit.getModels({
  providerIds: [byokit.ProviderId.DeepSeek],
  limit: 1,
  local: false,
});
console.log(model ?? 'No matching model');`,
  },
};
