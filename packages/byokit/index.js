export { Byokit, openAI, claude, OpenAI, Anthropic } from './sdk.js';
export { getModels } from './catalog.js';
import { validateConnection } from './custom-model.js';
import { connectionFor, callSupportFor } from './connection.js';
export { appendModel } from './custom-model.js';
export { call, callClaude, prepareCall, CallError } from './call.js';
import {
  FeatureStatus,
  ContextAccounting,
  Currency,
  Modality,
  FeatureName,
  Deployment,
  CommercialUse,
  VerificationCheck,
  Lifecycle,
  Popularity,
  PopularityMetric,
  ModelList,
  LocalApi,
  LifecycleBasis,
  ModelSort,
} from './enums.js';
export * from './enums.js';
/** Framework-independent catalog, selection and preflight rules. No network or storage. */
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const positive = (n) => finite(n) && n > 0;
const diag = (code, message, severity = 'warning', offeringId) => ({
  code,
  message,
  severity,
  ...(offeringId ? { offeringId } : {}),
});
export function validateCatalog(data) {
  const errors = [];
  if (data?.schemaVersion !== 1) errors.push('Unsupported schemaVersion');
  for (const key of ['providers', 'models', 'families', 'offerings', 'presets'])
    if (!Array.isArray(data?.[key])) errors.push(`${key} must be an array`);
  if (errors.length) return errors;
  for (const key of ['providers', 'models', 'families', 'offerings', 'presets']) {
    const seen = new Set();
    for (const item of data[key]) {
      if (typeof item.id !== 'string' || !item.id || seen.has(item.id))
        errors.push(`${key}: invalid or duplicate id`);
      seen.add(item.id);
    }
  }
  const providers = new Set(data.providers.map((x) => x.id)),
    models = new Set(data.models.map((x) => x.id));
  for (const o of data.offerings) {
    if (o.connection !== undefined)
      try {
        validateConnection(o.connection);
      } catch {
        errors.push(`${o.id}: invalid connection`);
      }
    errors.push(...validateSignals(o));
    if (
      o.callSupport !== undefined &&
      (typeof o.callSupport?.textGeneration !== 'boolean' ||
        (o.callSupport.reason !== null && typeof o.callSupport.reason !== 'string'))
    )
      errors.push(`${o.id}: invalid callSupport`);
    if (
      o.releaseDate !== undefined &&
      o.releaseDate !== null &&
      !(
        typeof o.releaseDate === 'string' &&
        /^\d{4}-\d{2}(-\d{2})?$/.test(o.releaseDate) &&
        Number(o.releaseDate.slice(0, 4)) >= 1 &&
        Number.isFinite(Date.parse(o.releaseDate)) &&
        new Date(o.releaseDate).toISOString().slice(0, o.releaseDate.length) === o.releaseDate
      )
    )
      errors.push(`${o.id}: invalid releaseDate`);
    if (!providers.has(o.providerId) || !models.has(o.modelId))
      errors.push(`${o.id}: unresolved reference`);
    if (!['hosted', 'local', 'self-hosted'].includes(o.deployment))
      errors.push(`${o.id}: invalid deployment`);
    for (const [key, val] of Object.entries(o.limits || {}))
      if (key !== 'contextAccounting' && val !== null && !positive(val))
        errors.push(`${o.id}: invalid ${key}`);
    for (const val of Object.values(o.features || {}))
      if (!['supported', 'unsupported', 'conditional', 'unknown'].includes(val?.status))
        errors.push(`${o.id}: invalid feature status`);
    for (const val of Object.values(o.price || {}))
      if (typeof val === 'number' && !finite(val)) errors.push(`${o.id}: invalid price`);
  }
  for (const p of data.presets)
    if (!Array.isArray(p.providerIds) || p.providerIds.some((id) => !providers.has(id)))
      errors.push(`${p.id}: unresolved provider`);
  for (const preset of data.presets) {
    if (
      preset.offeringIds !== undefined &&
      (!Array.isArray(preset.offeringIds) ||
        preset.offeringIds.some(
          (id) =>
            !data.offerings.some((o) => o.id === id && preset.providerIds.includes(o.providerId)),
        ))
    )
      errors.push(`${preset.id}: unresolved recommended offering`);
  }
  const recommended = new Set();
  for (const r of data.recommendations || []) {
    if (
      !r ||
      typeof r.offeringId !== 'string' ||
      recommended.has(r.offeringId) ||
      !signalSource(r.source) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedAt) ||
      typeof r.rationale !== 'string' ||
      !r.rationale.trim()
    )
      errors.push('Invalid recommendation evidence');
    recommended.add(r?.offeringId);
  }
  errors.push(...validateVerifications(data.verifications || [], data));
  return errors;
}
export function validateConfig(c = {}) {
  const errors = [];
  if (c.sort !== undefined && !Object.values(ModelSort).includes(c.sort))
    errors.push('Unknown model sort');
  if (c.list !== undefined && !Object.values(ModelList).includes(c.list))
    errors.push('Unknown model list');
  if (c.local !== undefined && c.local !== false) {
    if (!Array.isArray(c.local)) errors.push('local must be false or an array');
    else
      for (const entry of c.local)
        try {
          validateLocal(entry);
        } catch (e) {
          errors.push(e.message);
        }
  }
  const allowed = {
    root: [
      'sort',
      'list',
      'local',
      'limit',
      'asOf',
      'unknownPolicy',
      'schemaVersion',
      'catalog',
      'preset',
      'providerIds',
      'filters',
      'prefer',
      'ui',
      'budget',
      'tasks',
    ],
    filters: [
      'deployment',
      'origin',
      'openWeights',
      'commercialUse',
      'input',
      'output',
      'requiredFeatures',
      'minContextTokens',
      'maxInputPricePerM',
      'maxOutputPricePerM',
      'maxParameters',
      'maxTimeToFirstTokenMs',
      'minTokensPerSecond',
      'fileFormats',
      'includeTags',
      'excludeTags',
      'lifecycle',
      'popularity',
      'includeDeprecated',
      'callable',
      'verified',
      'verifiedBy',
      'verifiedWithinDays',
      'official',
    ],
    prefer: ['features', 'lowerCost'],
    ui: ['maxProviders', 'maxModelsPerProvider', 'allowCustomModel'],
    budget: ['maxInputTokens', 'maxOutputTokens', 'overheadTokens'],
  };
  for (const [group, keys] of Object.entries(allowed))
    for (const key of Object.keys(group === 'root' ? c : c[group] || {}))
      if (!keys.includes(key)) errors.push(`Unknown ${group}.${key}`);
  for (const key of [
    'deployment',
    'origin',
    'input',
    'output',
    'requiredFeatures',
    'fileFormats',
    'includeTags',
    'excludeTags',
    'lifecycle',
    'popularity',
  ])
    if (
      c.filters?.[key] !== undefined &&
      (!Array.isArray(c.filters[key]) || c.filters[key].some((v) => typeof v !== 'string'))
    )
      errors.push(`filters.${key} must be a string array`);
  for (const key of [
    'minContextTokens',
    'maxInputPricePerM',
    'maxOutputPricePerM',
    'maxParameters',
    'maxTimeToFirstTokenMs',
    'minTokensPerSecond',
  ])
    if (c.filters?.[key] !== undefined && !finite(c.filters[key]))
      errors.push(`filters.${key} must be a nonnegative finite number`);
  for (const key of ['maxProviders', 'maxModelsPerProvider'])
    if (
      c.ui?.[key] !== undefined &&
      (!Number.isInteger(c.ui[key]) || c.ui[key] < 1 || c.ui[key] > 100)
    )
      errors.push(`ui.${key} must be an integer from 1 to 100`);
  if (c.limit !== undefined && (!Number.isInteger(c.limit) || c.limit < 1 || c.limit > 1000))
    errors.push('limit must be an integer from 1 to 1000');
  if (
    c.asOf !== undefined &&
    (typeof c.asOf !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(c.asOf) ||
      !Number.isFinite(Date.parse(c.asOf)))
  )
    errors.push('asOf must be an ISO timestamp');
  for (const key of ['callable', 'includeDeprecated', 'official'])
    if (c.filters?.[key] !== undefined && typeof c.filters[key] !== 'boolean')
      errors.push(`filters.${key} must be boolean`);
  if (c.filters?.verified !== undefined && typeof c.filters.verified !== 'boolean')
    errors.push('filters.verified must be boolean');
  if (c.filters?.verifiedBy !== undefined && !/^github:[a-z0-9-]+$/i.test(c.filters.verifiedBy))
    errors.push('verifiedBy must identify a GitHub contributor');
  if (
    c.filters?.verifiedWithinDays !== undefined &&
    (!finite(c.filters.verifiedWithinDays) || c.filters.verifiedWithinDays < 1)
  )
    errors.push('verifiedWithinDays must be positive');
  const vocab = {
    input: Modality,
    output: Modality,
    requiredFeatures: FeatureName,
    deployment: Deployment,
    lifecycle: Lifecycle,
    popularity: Popularity,
  };
  for (const [key, values] of Object.entries(vocab))
    if (
      Array.isArray(c.filters?.[key]) &&
      c.filters[key].some((v) => !Object.values(values).includes(v))
    )
      errors.push(`Unknown filters.${key} value`);
  if (
    c.prefer?.features !== undefined &&
    (!Array.isArray(c.prefer.features) ||
      c.prefer.features.some((v) => !Object.values(FeatureName).includes(v)))
  )
    errors.push('Unknown preferred feature');
  if (
    c.filters?.commercialUse !== undefined &&
    !Object.values(CommercialUse).includes(c.filters.commercialUse)
  )
    errors.push('Unknown commercialUse value');
  if (c.unknownPolicy && !['include', 'exclude'].includes(c.unknownPolicy))
    errors.push('Invalid unknownPolicy');
  for (const key of ['maxInputTokens', 'maxOutputTokens', 'overheadTokens'])
    if (c.budget?.[key] !== undefined && !finite(c.budget[key]))
      errors.push(`budget.${key} must be a nonnegative finite number`);
  return errors;
}
function unknown(c) {
  return c.unknownPolicy === 'include';
}
function matches(o, m, c, providerTags = []) {
  const f = c.filters || {};
  if (f.deployment && !f.deployment.includes(o.deployment)) return false;
  if (f.origin && (!m.origin || !f.origin.includes(m.origin))) return false;
  if (
    f.openWeights !== undefined &&
    (m.openWeights === null ? !unknown(c) : m.openWeights !== f.openWeights)
  )
    return false;
  if (
    f.commercialUse &&
    (m.commercialUse === 'unknown' ? !unknown(c) : m.commercialUse !== f.commercialUse)
  )
    return false;
  for (const [required, direction] of [
    [f.input, 'input'],
    [f.output, 'output'],
  ]) {
    if (
      required?.length &&
      (o.modalities?.[direction] == null
        ? !unknown(c)
        : !required.every((x) => o.modalities[direction].includes(x)))
    )
      return false;
  }
  if (
    f.fileFormats?.length &&
    (o.fileFormats == null ? !unknown(c) : !f.fileFormats.every((x) => o.fileFormats.includes(x)))
  )
    return false;
  for (const feature of f.requiredFeatures || []) {
    const s = o.features?.[feature]?.status || FeatureStatus.Unknown;
    if (s !== FeatureStatus.Supported && !(s === FeatureStatus.Unknown && unknown(c))) return false;
  }
  const constraints = [
    [f.minContextTokens, o.limits?.context, 'min'],
    [f.maxInputPricePerM, o.price?.input, 'max'],
    [f.maxOutputPricePerM, o.price?.output, 'max'],
    [f.maxParameters, m.size?.totalParameters, 'max'],
    [f.maxTimeToFirstTokenMs, o.speed?.timeToFirstTokenMs, 'max'],
    [f.minTokensPerSecond, o.speed?.tokensPerSecond, 'min'],
  ];
  for (const [bound, value, op] of constraints)
    if (
      bound !== undefined &&
      (!finite(value) ? !unknown(c) : op === 'min' ? value < bound : value > bound)
    )
      return false;
  if (
    f.callable !== undefined &&
    (o.callSupport?.textGeneration ?? callSupportFor(o).textGeneration) !== f.callable
  )
    return false;
  const lifecycle =
    f.lifecycle ||
    (f.includeDeprecated === true ||
    (c.list === ModelList.Complete && f.includeDeprecated !== false)
      ? Object.values(Lifecycle)
      : [Lifecycle.Live, Lifecycle.Uncertain]);
  if (!lifecycle.includes(o.lifecycle.status)) return false;
  if (f.popularity && !f.popularity.includes(o.popularity.status)) return false;
  const tags = new Set([
    ...[...(m.tags || []), ...providerTags].filter(
      (t) => !t.startsWith('lifecycle:') && !t.startsWith('popularity:'),
    ),
    ...(o.tags || []),
  ]);
  if (
    (f.includeTags || []).some((t) => !tags.has(t)) ||
    (f.excludeTags || []).some((t) => tags.has(t))
  )
    return false;
  if (f.official !== undefined && isOfficialOffering(o, m, providerTags) !== f.official)
    return false;

  return true;
}

export function isOfficialOffering(o, m, providerTags = []) {
  if (providerTags.includes('provider:official')) {
    const creator = (m?.id || o.modelId).split('/')[0];
    return o.providerId === creator || o.providerId.startsWith(creator + '-');
  }
  const aggregators = [
    'openrouter',
    'groq',
    'siliconflow',
    '302ai',
    'aihubmix',
    'deepinfra',
    'togetherai',
    'fireworks-ai',
    'azure',
    'amazon-bedrock',
    'local',
    'ollama',
  ];
  if (aggregators.includes(o.providerId)) return false;
  const creator = (m?.id || o.modelId).split('/')[0];
  return o.providerId === creator || o.providerId.startsWith(creator + '-');
}

function compareModels(a, b, sort) {
  const text = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const numeric = (x, y, direction) => {
    const knownX = Number.isFinite(x),
      knownY = Number.isFinite(y);
    if (!knownX || !knownY) return knownX ? -1 : knownY ? 1 : 0;
    return (x < y ? -1 : x > y ? 1 : 0) * direction;
  };
  let result = 0;
  if ([ModelSort.PriceAscend, ModelSort.PriceDescend].includes(sort))
    result = numeric(
      a.price?.currency === Currency.USD ? a.price.input : null,
      b.price?.currency === Currency.USD ? b.price.input : null,
      sort === ModelSort.PriceAscend ? 1 : -1,
    );
  if ([ModelSort.SpeedAscend, ModelSort.SpeedDescend].includes(sort))
    result = numeric(
      a.speed?.tokensPerSecond,
      b.speed?.tokensPerSecond,
      sort === ModelSort.SpeedAscend ? 1 : -1,
    );
  return (
    result ||
    text(a.name.toLowerCase(), b.name.toLowerCase()) *
      (sort === ModelSort.AlphabeticalDescend ? -1 : 1) ||
    text(a.providerId, b.providerId) ||
    text(a.id, b.id)
  );
}
export class Catalog {
  constructor(data) {
    const errors = validateCatalog(data);
    if (errors.length) throw new Error(errors.join('; '));
    this.data = structuredClone(data);
    this.providers = new Map(this.data.providers.map((x) => [x.id, x]));
    this.models = new Map(this.data.models.map((x) => [x.id, x]));
    this.offerings = new Map(this.data.offerings.map((x) => [x.id, x]));
    this.families = new Map(this.data.families.map((x) => [x.id, x]));
    this.assets = new Map((this.data.assets || []).map((x) => [x.id, x]));
    this.offeringsByProvider = new Map();
    for (const o of this.data.offerings) {
      let list = this.offeringsByProvider.get(o.providerId);
      if (!list) {
        list = [];
        this.offeringsByProvider.set(o.providerId, list);
      }
      list.push(o);
    }
    this.verificationsByOffering = new Map();
    for (const v of this.data.verifications || []) {
      let list = this.verificationsByOffering.get(v.offeringId);
      if (!list) {
        list = [];
        this.verificationsByOffering.set(v.offeringId, list);
      }
      list.push(v);
    }
    this.data._verificationsByOffering = this.verificationsByOffering;
  }
  get(id) {
    return this.offerings.get(id);
  }
  getModels(input = {}, options) {
    const config = normalizeQuery(input, options);
    const groups = this._select(config, true);
    const hosted = groups
      .filter((g) => g.provider.deployment !== Deployment.Local)
      .flatMap((g) => g.offerings.map((o) => [g, o]));
    const sort =
      {
        alphabetical: ModelSort.AlphabeticalAscend,
        price: ModelSort.PriceAscend,
        speed: ModelSort.SpeedDescend,
      }[config.sort] ??
      config.sort ??
      ModelSort.AlphabeticalAscend;
    if (sort !== ModelSort.ProviderOrder)
      hosted.sort((a, b) =>
        compareModels(
          { ...a[1], providerId: a[0].provider.id },
          { ...b[1], providerId: b[0].provider.id },
          sort,
        ),
      );
    const limited = hosted.slice(0, config.limit);
    const locals = groups
      .filter((g) => g.provider.deployment === Deployment.Local)
      .flatMap((g) => g.offerings.map((o) => [g, o]));
    return structuredClone(
      [...limited, ...locals].map(([g, o]) => {
        const model = this.models.get(o.modelId) || {
            id: o.modelId,
            name: o.name,
            openWeights: null,
            commercialUse: CommercialUse.Unknown,
            license: null,
            tags: [],
          },
          family = this.families.get(model?.familyId);
        return {
          ...o,
          connection: connectionFor(o),
          callSupport: o.callSupport || callSupportFor(o),
          provider: g.provider,
          model,
          family: family || null,
          logos: {
            provider: this.assets.get(g.provider.logoId) || null,
            family: this.assets.get(family?.logoId) || null,
          },
          verification: verificationSummary(this.data, o.id, {
            asOf: config.asOf,
            maxAgeDays: config.filters?.verifiedWithinDays,
            contributor: config.filters?.verifiedBy,
          }),
        };
      }),
    );
  }
  select(input = {}, options) {
    return this._select(normalizeQuery(input, options));
  }
  _select(config = {}, uncapped = false) {
    const errors = validateConfig(config);
    if (errors.length) throw new Error(errors.join('; '));
    const preset =
      this.data.presets.find(
        (p) =>
          p.id === (config.preset || (config.list === ModelList.Default ? 'default' : 'global')),
      ) ||
      (config.list === ModelList.Default
        ? this.data.presets.find((p) => p.id === 'global')
        : undefined);
    if (!preset) throw new Error(`Unknown preset: ${config.preset}`);
    const ids =
      config.providerIds ||
      (config.list === ModelList.Complete
        ? this.data.providers.map((p) => p.id)
        : preset.providerIds);
    if (!Array.isArray(ids) || ids.some((id) => !this.providers.has(id)))
      throw new Error('Unknown provider in providerIds');
    const groups = [];
    const recommended =
      config.list === ModelList.Default && preset.offeringIds ? new Set(preset.offeringIds) : null;
    for (const id of ids) {
      if (this.providers.get(id).deployment === Deployment.Local) continue;
      const providerOfferings = this.offeringsByProvider.get(id) || [];
      let choices = providerOfferings
        .filter((o) => !recommended || recommended.has(o.id))
        .map((o) => withSignals(o, config.asOf))
        .filter(
          (o) =>
            matches(o, this.models.get(o.modelId), config, this.providers.get(id).tags) &&
            matchesVerification(this.data, o.id, config),
        );
      choices.sort((a, b) => {
        const preferred = (x) =>
          config.prefer?.features?.filter((f) => x.features?.[f]?.status === 'supported').length ||
          0;
        return (
          Number(b.lifecycle.status === Lifecycle.Live) -
            Number(a.lifecycle.status === Lifecycle.Live) ||
          preferred(b) - preferred(a) ||
          (config.prefer?.lowerCost
            ? (a.price?.input ?? Infinity) - (b.price?.input ?? Infinity)
            : 0) ||
          (a.rank ?? 100) - (b.rank ?? 100) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        );
      });
      const cap = uncapped
        ? config.list === ModelList.Complete || config.providerIds || recommended
          ? Infinity
          : (config.ui?.maxModelsPerProvider ?? 1)
        : (config.ui?.maxModelsPerProvider ?? 4);
      if (choices.length)
        groups.push({ provider: this.providers.get(id), offerings: choices.slice(0, cap) });
    }
    const locals = localGroups(config, this);
    return [
      ...(uncapped
        ? groups
        : groups.slice(0, Math.max(0, (config.ui?.maxProviders ?? 8) - locals.length))),
      ...locals,
    ];
  }
}
export function checkFit(offering, budget, options = {}) {
  const diagnostics = [];
  if (!offering)
    return {
      status: 'unknown',
      certainty: 'unknown',
      diagnostics: [
        diag('MODEL_UNVERIFIED', 'Custom model limits and capabilities are unverified.'),
      ],
    };
  const c = offering.limits || {};
  for (const key of ['inputTokens', 'outputTokens', 'overheadTokens'])
    if (budget[key] !== undefined && !finite(budget[key]))
      throw new Error(`${key} must be a nonnegative finite number`);
  const input = (budget.inputTokens ?? 0) + (budget.overheadTokens ?? 0),
    output = budget.outputTokens ?? 0;
  for (const feature of options.requiredFeatures || []) {
    const state = offering.features?.[feature]?.status || 'unknown';
    if (state !== 'supported')
      diagnostics.push(
        diag(
          state === 'unsupported' ? 'CAPABILITY_UNSUPPORTED' : 'CAPABILITY_UNVERIFIED',
          `${feature}: ${state}`,
          state === 'unsupported' ? 'error' : 'warning',
          offering.id,
        ),
      );
  }
  for (const direction of ['input', 'output'])
    for (const modality of options.modalities?.[direction] || []) {
      const values = offering.modalities?.[direction];
      if (!values?.includes(modality))
        diagnostics.push(
          diag(
            values ? 'MODALITY_UNSUPPORTED' : 'MODALITY_UNVERIFIED',
            `${direction} modality ${modality} is ${values ? 'unsupported' : 'unverified'}.`,
            values ? 'error' : 'warning',
            offering.id,
          ),
        );
    }
  if (positive(c.input) && input > c.input)
    diagnostics.push(
      diag('INPUT_BUDGET_EXCEEDED', `Input ${input} exceeds ${c.input}.`, 'error', offering.id),
    );
  if (positive(c.output) && output > c.output)
    diagnostics.push(
      diag('OUTPUT_BUDGET_EXCEEDED', `Output ${output} exceeds ${c.output}.`, 'error', offering.id),
    );
  const combined = c.contextAccounting === ContextAccounting.Combined;
  const used = combined ? input + output : input;
  let ratio;
  if (
    positive(c.context) &&
    [ContextAccounting.Combined, ContextAccounting.InputOnly].includes(c.contextAccounting)
  ) {
    ratio = used / c.context;
    if (ratio > 1)
      diagnostics.push(
        diag(
          'CONTEXT_BUDGET_EXCEEDED',
          `Required ${used} exceeds context ${c.context}.`,
          'error',
          offering.id,
        ),
      );
    else if (ratio >= 0.8)
      diagnostics.push(
        diag(
          'CONTEXT_NEAR_LIMIT',
          `Context budget uses ${Math.round(ratio * 100)}%.`,
          'warning',
          offering.id,
        ),
      );
  } else {
    if (positive(c.context) && input > c.context)
      diagnostics.push(
        diag(
          'CONTEXT_BUDGET_EXCEEDED',
          `Input ${input} exceeds context ${c.context}.`,
          'error',
          offering.id,
        ),
      );
    diagnostics.push(
      diag(
        offering.deployment === 'local' ? 'LOCAL_CONTEXT_UNKNOWN' : 'CONTEXT_UNVERIFIED',
        'Effective context or its accounting rules are unknown.',
        'warning',
        offering.id,
      ),
    );
  }
  if (output > 0 && !positive(c.output))
    diagnostics.push(
      diag('OUTPUT_LIMIT_UNKNOWN', 'Output limit is unknown.', 'warning', offering.id),
    );
  if (options.estimate)
    diagnostics.push(
      diag(
        'TOKEN_ESTIMATE',
        'Token count is estimated; this is not an exact fit guarantee.',
        'warning',
        offering.id,
      ),
    );
  if (offering.status === 'deprecated')
    diagnostics.push(
      diag('MODEL_DEPRECATED', 'Selected model is deprecated.', 'warning', offering.id),
    );
  return {
    status: diagnostics.some((d) => d.severity === 'error')
      ? 'exceeds'
      : diagnostics.some((d) =>
            [
              'CONTEXT_UNVERIFIED',
              'LOCAL_CONTEXT_UNKNOWN',
              'OUTPUT_LIMIT_UNKNOWN',
              'CAPABILITY_UNVERIFIED',
              'MODALITY_UNVERIFIED',
              'TOKEN_ESTIMATE',
            ].includes(d.code),
          )
        ? 'unknown'
        : 'fits',
    certainty: options.estimate ? 'estimated' : options.certainty || 'declared',
    inputTokens: input,
    outputTokens: output,
    ...(ratio !== undefined ? { ratio } : {}),
    diagnostics,
  };
}
export function checkTask(catalog, task) {
  const diagnostics = [];
  if (task.budget?.maxInputTokens === undefined || task.budget?.maxOutputTokens === undefined)
    diagnostics.push(
      diag('BUDGET_UNDECLARED', 'Declare input and output token budgets for build-time checks.'),
    );
  if (!Array.isArray(task.offeringIds) || !task.offeringIds.length)
    return [diag('NO_MODELS', 'Task requires at least one offering.', 'error')];
  for (const id of task.offeringIds) {
    const o = catalog.get(id);
    const r = checkFit(
      o,
      {
        inputTokens: task.budget?.maxInputTokens,
        outputTokens: task.budget?.maxOutputTokens,
        overheadTokens: task.budget?.overheadTokens,
      },
      { requiredFeatures: task.requires?.features, modalities: task.requires?.modalities },
    );
    diagnostics.push(...r.diagnostics.map((d) => ({ ...d, offeringId: id })));
  }
  return diagnostics;
}
/** Token counting is injected. Non-text content requires a provider-aware counter. */
export async function preflight(
  offering,
  messages,
  { countTokens, outputTokens = 0, overheadTokens = 0, ...options } = {},
) {
  if (!countTokens)
    return {
      status: 'unknown',
      certainty: 'unknown',
      diagnostics: [
        diag('TOKEN_COUNT_UNKNOWN', 'Supply a provider-aware token counter for actual requests.'),
      ],
    };
  const count = await countTokens(messages, offering);
  return checkFit(
    offering,
    { inputTokens: count.tokens, outputTokens, overheadTokens },
    { ...options, estimate: count.certainty !== 'measured', certainty: count.certainty },
  );
}
export function estimatePrice(offering, { inputTokens, outputTokens }) {
  if (!finite(inputTokens) || !finite(outputTokens)) throw new Error('Invalid token counts');
  const p = offering.price;
  if (p?.currency !== Currency.USD || !finite(p.input) || !finite(p.output) || p.tiers?.length)
    return { status: 'unknown' };
  return {
    status: 'estimated',
    currency: 'USD',
    amount: (inputTokens * p.input + outputTokens * p.output) / 1e6,
    excludes: ['cache pricing', 'additional reasoning charges', 'tax', 'tier changes'],
  };
}
export function createMemoryCredentialStore() {
  const keys = new Map();
  return {
    async get(ref) {
      return keys.get(ref);
    },
    async set(ref, value) {
      keys.set(ref, value);
    },
    async delete(ref) {
      keys.delete(ref);
    },
  };
}
export function resolveSelection(catalog, selection) {
  const o = catalog.get(selection.offeringId);
  return {
    selection,
    offering: o,
    diagnostics: o
      ? o.status === 'deprecated'
        ? [diag('MODEL_DEPRECATED', 'Saved selection is deprecated.')]
        : []
      : [diag('MODEL_UNVERIFIED', 'Saved selection retained; metadata unavailable.')],
  };
}
/** Pure draft state: async checks are fenced by selection identity. Never changes the model. */
export function reduceSetup(state, event) {
  if (event.type === 'edit')
    return {
      ...state,
      selection: event.selection,
      status: 'idle',
      error: undefined,
      requestId: undefined,
    };
  if (event.type === 'checking')
    return { ...state, status: 'checking', requestId: event.requestId, error: undefined };
  if (event.requestId !== state.requestId) return state;
  if (event.type === 'result')
    return { ...state, status: event.ok ? 'ready' : 'error', error: event.error };
  return state;
}

/** Derived tags are convenience views; structured fields remain authoritative. */
export function deriveTags(offering, model = {}) {
  const tags = (offering.tags || []).filter(
    (t) =>
      ![
        'cap:',
        'input:',
        'output:',
        'price:',
        'context:',
        'weights:',
        'origin:',
        'deployment:',
        'lifecycle:',
        'popularity:',
      ].some((p) => t.startsWith(p)),
  );
  for (const [name, feature] of Object.entries(offering.features || {}))
    if (feature.status === 'supported') tags.push(`cap:${name}`);
  for (const direction of ['input', 'output'])
    for (const modality of offering.modalities?.[direction] || [])
      tags.push(`${direction}:${modality}`);
  if (model.openWeights === true) tags.push('weights:open');
  if (model.origin) tags.push(`origin:${model.origin}`);
  tags.push(`deployment:${offering.deployment}`);
  const ctx = offering.limits?.context;
  if (positive(ctx))
    tags.push(
      `context:${ctx >= 1000000 ? '1m+' : ctx >= 128000 ? '128k+' : ctx >= 32000 ? '32k+' : 'under-32k'}`,
    );
  const p = offering.price;
  if (p?.currency === Currency.USD && finite(p.input) && finite(p.output) && !p.tiers?.length) {
    const cost = (p.input + p.output) / 1000;
    tags.push(
      `price:${cost === 0 ? 'zero-token-rate' : cost <= 0.002 ? 'budget' : cost <= 0.02 ? 'mid' : 'premium'}`,
    );
  }
  return [...new Set(tags)].sort();
}

/** Contributor reports describe observed calls, never account entitlements. */
export function validateVerifications(records, data) {
  if (!Array.isArray(records)) return ['verifications must be an array'];
  const errors = [],
    ids = new Set(),
    offerings = new Set(data.offerings.map((o) => o.id));
  for (const r of records) {
    if (!r || typeof r !== 'object') {
      errors.push('Invalid verification record');
      continue;
    }
    if (typeof r.id !== 'string' || !r.id || ids.has(r.id))
      errors.push('Invalid or duplicate verification ID');
    ids.add(r.id);
    if (!offerings.has(r.offeringId)) errors.push('Verification target is missing');
    if (typeof r.contributor !== 'string' || !/^github:[a-z0-9-]+$/i.test(r.contributor))
      errors.push('Invalid verification contributor');
    if (
      typeof r.checkedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(r.checkedAt) ||
      !Number.isFinite(Date.parse(r.checkedAt))
    )
      errors.push('Invalid verification timestamp');
    if (!['passed', 'failed'].includes(r.result)) errors.push('Invalid verification result');
    if (
      !Array.isArray(r.checks) ||
      !r.checks.length ||
      r.checks.some((c) => !Object.values(VerificationCheck).includes(c))
    )
      errors.push('Verification must name its checks');
    try {
      const u = new URL(r.evidence);
      if (u.protocol !== 'https:' || u.username || u.password)
        errors.push('Verification evidence must be a public HTTPS link');
    } catch {
      errors.push('Verification evidence is required');
    }
    if (typeof r.adapter !== 'string' || !r.adapter)
      errors.push('Verification adapter and version are required');
    const permitted = [
      'id',
      'offeringId',
      'contributor',
      'checkedAt',
      'result',
      'checks',
      'evidence',
      'adapter',
      'notes',
    ];
    if (Object.keys(r).some((k) => !permitted.includes(k)))
      errors.push('Unknown verification field; do not record keys or request payloads');
  }
  return errors;
}
export function verificationSummary(
  data,
  offeringId,
  { asOf = new Date().toISOString(), maxAgeDays = 90, contributor } = {},
) {
  const source =
    data?._verificationsByOffering?.get(offeringId) ||
    (data?.verifications || []).filter((r) => r.offeringId === offeringId);
  const records = contributor
    ? source.filter((r) => r.contributor.toLowerCase() === contributor.toLowerCase())
    : source;
  const now = Date.parse(asOf);
  const calls = records.filter(
    (r) => r.checks.includes('textGeneration') && Date.parse(r.checkedAt) <= now,
  );
  calls.sort(
    (a, b) =>
      Date.parse(b.checkedAt) - Date.parse(a.checkedAt) ||
      (a.result === b.result ? 0 : a.result === 'failed' ? -1 : 1) ||
      (a.id < b.id ? -1 : 1),
  );
  const latest = calls[0];
  return {
    status: !latest
      ? 'unverified'
      : now - Date.parse(latest.checkedAt) > maxAgeDays * 86400000
        ? 'stale'
        : latest.result,
    latest: latest || null,
    records,
  };
}
function matchesVerification(data, id, config) {
  const f = config.filters || {};
  if (f.verified === undefined && !f.verifiedBy && f.verifiedWithinDays === undefined) return true;
  const state = verificationSummary(data, id, {
    asOf: config.asOf,
    maxAgeDays: f.verifiedWithinDays,
    contributor: f.verifiedBy,
  }).status;
  return f.verified === false ? state !== 'passed' : state === 'passed';
}

export function customProviderId(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value))
    throw new Error('Invalid custom provider ID');
  return value;
}
export function customCountryCode(value) {
  if (typeof value !== 'string' || !/^[a-z]{2}$/.test(value))
    throw new Error('Use a two-letter country code');
  return value;
}
export function customFileFormat(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9.+-]{0,63}$/.test(value))
    throw new Error('Invalid custom file format');
  return value;
}
export function customTag(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]*:[^\s]+$/.test(value))
    throw new Error('Use a namespaced tag');
  return value;
}
export function githubContributor(handle) {
  if (typeof handle !== 'string' || !/^[a-z0-9-]{1,39}$/i.test(handle))
    throw new Error('Invalid GitHub handle');
  return `github:${handle}`;
}

// Evidence is per offering: availability and usage can differ across providers.
const signalDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) &&
  Number.isFinite(Date.parse(value));
const signalSource = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
function validateSignals(o) {
  const errors = [];
  const check = (record, keys) =>
    record &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    Object.keys(record).every((k) => keys.includes(k));
  const l = o.lifecycleEvidence,
    p = o.popularityEvidence;
  if (
    l !== undefined &&
    (!check(l, ['status', 'source', 'checkedAt', 'basis']) ||
      !Object.values(Lifecycle).includes(l.status) ||
      (l.basis !== undefined && !Object.values(LifecycleBasis).includes(l.basis)) ||
      !signalSource(l.source) ||
      !signalDate(l.checkedAt))
  )
    errors.push(`${o.id}: invalid lifecycle evidence`);
  if (
    p !== undefined &&
    (!check(p, ['metric', 'rank', 'population', 'scope', 'source', 'windowStart', 'windowEnd']) ||
      !Object.values(PopularityMetric).includes(p.metric) ||
      !Number.isInteger(p.rank) ||
      p.rank < 1 ||
      !Number.isInteger(p.population) ||
      p.population < p.rank ||
      typeof p.scope !== 'string' ||
      !p.scope.trim() ||
      !signalSource(p.source) ||
      !signalDate(p.windowStart) ||
      !signalDate(p.windowEnd) ||
      Date.parse(p.windowStart) >= Date.parse(p.windowEnd))
  )
    errors.push(`${o.id}: invalid popularity evidence`);
  return errors;
}
const dateParseCache = new Map();
const parseEpoch = (str) => {
  let val = dateParseCache.get(str);
  if (val === undefined) {
    val = Date.parse(str);
    dateParseCache.set(str, val);
  }
  return val;
};
function withSignals(o, asOf) {
  const now = asOf === undefined ? Date.now() : parseEpoch(asOf),
    l = o.lifecycleEvidence,
    p = o.popularityEvidence;
  const fresh = (date, days) => {
    if (!signalDate(date)) return false;
    const epoch = parseEpoch(date);
    return epoch <= now && now - epoch <= days * 86400000;
  };
  const lifecycle = {
    status:
      o.status === 'deprecated' || l?.status === Lifecycle.Outdated
        ? Lifecycle.Outdated
        : l && fresh(l.checkedAt, 90) && l.basis === LifecycleBasis.Provider
          ? l.status
          : Lifecycle.Uncertain,
    evidence: l || null,
  };
  const popularity = {
    status:
      p && fresh(p.windowEnd, 30)
        ? p.rank <= Math.ceil(p.population * 0.1)
          ? Popularity.Popular
          : Popularity.NotPopular
        : Popularity.Uncertain,
    evidence: p || null,
  };
  const tags = (o.tags || []).filter(
    (t) => !t.startsWith('lifecycle:') && !t.startsWith('popularity:'),
  );
  return {
    ...o,
    lifecycle,
    popularity,
    tags: [...tags, `lifecycle:${lifecycle.status}`, `popularity:${popularity.status}`],
  };
}

function normalizeQuery(input = {}, options) {
  const mode = typeof input === 'string';
  if (mode && !Object.values(ModelList).includes(input)) throw new Error('Unknown model list');
  if (
    !mode &&
    (input === null || typeof input !== 'object' || Array.isArray(input) || options !== undefined)
  )
    throw new Error('Use getModels(options) or getModels(list, options)');
  const config = mode ? { ...(options || {}), list: input } : { ...input };
  if (config.list === undefined && config.preset === undefined && config.providerIds === undefined)
    config.list = ModelList.Default;
  if (config.list === ModelList.China) config.preset = 'china';
  if (config.list === ModelList.Global) config.preset = 'global';
  if (config.list === ModelList.Official) {
    config.preset = 'official';
    config.filters = { ...config.filters, official: true };
  }
  return config;
}
function validateLocal(entry) {
  if (
    !entry ||
    typeof entry !== 'object' ||
    Array.isArray(entry) ||
    Object.keys(entry).some((k) => !['endpoint', 'api', 'modelId', 'name'].includes(k))
  )
    throw new Error('Invalid local entry');
  if (typeof entry.endpoint !== 'string') throw new Error('Local endpoint must be a URL string');
  let url;
  try {
    url = new URL(entry.endpoint);
  } catch {
    throw new Error('Local entry needs an HTTP(S) endpoint');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use a local HTTP(S) URL without credentials, query, or fragment');
  if (entry.api !== undefined && !Object.values(LocalApi).includes(entry.api))
    throw new Error('Unknown local API');
  for (const k of ['modelId', 'name'])
    if (entry[k] !== undefined && (typeof entry[k] !== 'string' || !entry[k].trim()))
      throw new Error(`Invalid local ${k}`);
}
function localGroups(config, catalog) {
  if (
    config.filters?.input?.length ||
    config.filters?.output?.length ||
    config.filters?.callable !== undefined ||
    config.filters?.official === true ||
    config.local === false ||
    (config.filters?.deployment && !config.filters.deployment.includes(Deployment.Local))
  )
    return [];
  const ids =
    config.providerIds || catalog.data.presets.find((p) => p.id === config.preset)?.providerIds;
  if (
    config.local === undefined &&
    ids &&
    !ids.some((id) => catalog.providers.get(id)?.deployment === Deployment.Local)
  )
    return [];
  const entries = config.local || [{}];
  if (!entries.length) return [];
  const provider = catalog.providers.get('local') || {
    id: 'local',
    name: 'Local',
    auth: 'optional',
    deployment: 'local',
    tags: [],
  };
  const offerings = entries.map((entry, i) => ({
    id: entries.length === 1 ? 'local/custom' : `local/endpoint-${i}`,
    providerId: 'local',
    modelId: entry.modelId || 'local/custom',
    apiModelId: entry.modelId || '',
    name: entry.name || entry.modelId || 'Local — enter your server URL',
    deployment: 'local',
    local: {
      endpoint: entry.endpoint || '',
      api: entry.api || LocalApi.OpenAI,
      configured: !!entry.endpoint,
    },
    modalities: { input: null, output: null },
    limits: { context: null, input: null, output: null, contextAccounting: 'unknown' },
    features: {},
    price: { currency: 'USD', input: null, output: null },
    tags: ['deployment:local'],
    lifecycle: { status: Lifecycle.Uncertain, evidence: null },
    popularity: { status: Popularity.Uncertain, evidence: null },
  }));
  return [{ provider: { ...provider, name: 'Local' }, offerings }];
}
