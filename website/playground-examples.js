export const playgroundExamples = {
  shortlist: {
    label: 'Default shortlist',
    code: `const models = byokit.getModels();
console.log(models.map(model => ({
  provider: model.provider.name,
  model: model.apiModelId || '(configure local server)',
})));`,
  },
  providers: {
    label: 'Select from certain providers',
    code: `const models = byokit.getModels({
  providerIds: [
    byokit.ProviderId.Anthropic,
    byokit.ProviderId.Google,
    byokit.ProviderId.OpenAI,
  ],
  filters: {
    // Bare array for output defaults to exact match (only text output models)
    output: [byokit.Modality.Text],
  },
  local: false,
});
console.log(models.map(model => ({
  provider: model.provider.name,
  model: model.apiModelId,
  context: model.limits.context,
})));`,
  },
  image: {
    label: 'Select image models',
    code: `// Use byokit.Contain to match models that output images (pure image or text+image)
// Or use [byokit.Modality.Image] to match strictly image-only output models.
const models = byokit.getModels(byokit.COMPLETE, {
  filters: {
    output: byokit.Contain([byokit.Modality.Image]),
  },
  limit: 5,
  local: false,
});
console.log(models.map(model => ({
  provider: model.provider.name,
  model: model.apiModelId,
  output: model.modalities?.output,
})));`,
  },
  price: {
    label: 'Sort by price',
    code: `const models = byokit.getModels({
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
  speed: {
    label: 'Sort by speed',
    code: `try {
  byokit.getModels({
    sort: byokit.ModelSort.SpeedDescend,
    limit: 5,
    local: false,
  });
} catch (error) {
  console.log('Speed sorting is not implemented:', error.name);
}`,
  },
  filter: {
    label: 'Complete list with filters',
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
  apiModels: {
    label: 'All models under an API (verify all in result)',
    code: `// Query all models under OpenAI-compatible chat API
const models = byokit.getModels(byokit.COMPLETE, {
  filters: { callable: true },
  local: false,
}).filter(m => m.connection?.protocol === byokit.ApiProtocol.OpenAI);

console.log(\`Found \${models.length} models using OpenAI-compatible API protocol:\`);
console.log(models.slice(0, 10).map(m => ({ provider: m.provider.name, model: m.name, apiModelId: m.apiModelId })));

// Return models to test their availability in the test drawer below
return models;`,
  },
};
