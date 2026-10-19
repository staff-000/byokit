// Official execution projection. No catalog queries, credentials, logos, or evidence payloads.
export function compactModels(models) {
  if (!Array.isArray(models)) throw new Error('Provide a list of model offerings.');
  const fields = [
    'id',
    'providerId',
    'modelId',
    'apiModelId',
    'name',
    'deployment',
    'connection',
    'callSupport',
    'limits',
    'modalities',
    'local',
    'status',
    'providerShape',
    'requiresProviderOverride',
    'speciality',
    'tier',
  ];
  return models.map((model) => {
    if (!model || typeof model !== 'object' || typeof model.apiModelId !== 'string')
      throw new Error('Provide model offerings with API model IDs.');
    const compact = Object.fromEntries(
      fields.filter((k) => model[k] !== undefined).map((k) => [k, model[k]]),
    );
    compact.features = Object.fromEntries(
      Object.entries(model.features || {}).map(([k, v]) => [k, { status: v.status }]),
    );
    if (model.provider)
      compact.provider = Object.fromEntries(
        ['id', 'name', 'auth', 'deployment']
          .filter((k) => model.provider[k] !== undefined)
          .map((k) => [k, model.provider[k]]),
      );
    return structuredClone(compact);
  });
}
