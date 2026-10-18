import { communityAssessment, textWasVerified, validAssessment } from './verification.js';
export { classifyVerificationError } from './verification.js';
export { Byokit, openAI, claude, OpenAI, Anthropic } from './sdk.js';
import { validateConnection } from './custom-model.js';
import { connectionFor, callSupportFor } from './connection.js';
export { appendModel } from './custom-model.js';
export { call, callClaude, prepareCall, CallError } from './call.js';
export class NotImplementedError extends Error {
  constructor(message = 'Not implemented') {
    super(message);
    this.name = 'NotImplementedError';
  }
}
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
  Country,
  Speciality,
  Tier,
} from './enums.js';
export * from './enums.js';

function normalizeArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0].map((v) => (v !== null && typeof v === 'object' ? v : String(v)));
  }
  return args.map((v) => (v !== null && typeof v === 'object' ? v : String(v)));
}

export function exact(...args) {
  return { mode: 'exact', values: normalizeArgs(args) };
}

export function contain(...args) {
  return { mode: 'contain', values: normalizeArgs(args) };
}

export const contains = contain;

export function any(...args) {
  return { mode: 'any', values: normalizeArgs(args) };
}

export function exclude(...args) {
  return { mode: 'exclude', values: normalizeArgs(args) };
}

export function and(...args) {
  return { op: 'and', values: normalizeArgs(args) };
}

export function or(...args) {
  return { op: 'or', values: normalizeArgs(args) };
}

export function xor(...args) {
  return { op: 'xor', values: normalizeArgs(args) };
}

export function not(...args) {
  return { op: 'not', values: normalizeArgs(args) };
}

export const Exact = exact;
export const Contain = contain;
export const Contains = contain;
export const Any = any;
export const Exclude = exclude;
export const And = and;
export const AND = and;
export const Or = or;
export const OR = or;
export const Xor = xor;
export const XOR = xor;
export const Not = not;
export const NOT = not;

function defaultFilterMode(fieldName) {
  const field = fieldName.replace(/^filters\./, '');
  if (field === 'output') return 'exact';
  return ['input', 'modality', 'requiredFeatures', 'fileFormats', 'includeTags'].includes(field)
    ? 'contain'
    : 'any';
}

export function normalizeListFilter(value, fieldName = 'filter') {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) || typeof value === 'string') {
    return {
      mode: defaultFilterMode(fieldName),
      values: Array.isArray(value) ? [...value] : [value],
    };
  }
  if (typeof value === 'object') {
    let mode;
    let op;
    let values;
    if ('op' in value) {
      op = String(value.op).toLowerCase();
      values =
        value.values !== undefined
          ? value.values
          : value.list !== undefined
            ? value.list
            : value.items;
    } else if ('and' in value) {
      op = 'and';
      values = value.and;
    } else if ('or' in value) {
      op = 'or';
      values = value.or;
    } else if ('xor' in value) {
      op = 'xor';
      values = value.xor;
    } else if ('not' in value) {
      op = 'not';
      values = value.not;
    } else if ('mode' in value) {
      mode = String(value.mode).toLowerCase();
      if (mode === 'contains') mode = 'contain';
      values =
        value.values !== undefined
          ? value.values
          : value.list !== undefined
            ? value.list
            : value.items;
    } else if ('exact' in value) {
      mode = 'exact';
      values = value.exact;
    } else if ('contain' in value) {
      mode = 'contain';
      values = value.contain;
    } else if ('contains' in value) {
      mode = 'contain';
      values = value.contains;
    } else if ('any' in value) {
      mode = 'any';
      values = value.any;
    } else if ('exclude' in value) {
      mode = 'exclude';
      values = value.exclude;
    }
    if (op) {
      const list = Array.isArray(values) ? values : [values];
      if (op === 'not' && list.length !== 1) throw new Error('not requires exactly one expression');
      return {
        op,
        values: list.map((child) =>
          typeof child === 'object' && child !== null
            ? normalizeListFilter(child, fieldName)
            : String(child),
        ),
      };
    }
    if (mode) {
      const list = Array.isArray(values) ? values : [values];
      return {
        mode,
        values: list.map((child) =>
          typeof child === 'object' && child !== null
            ? normalizeListFilter(child, fieldName)
            : String(child),
        ),
      };
    }
  }
  throw new Error(`Invalid matcher for '${fieldName}'`);
}

export function evaluateFilterNode(targetSet, node, isExactSetMatch = false) {
  if (node === null || node === undefined) return true;
  if (typeof node === 'string') {
    return targetSet.has(node);
  }
  if (typeof node !== 'object') {
    return false;
  }
  const values = node.values !== undefined ? node.values : node.items;
  if (node.op) {
    const op = String(node.op).toLowerCase();
    const list = Array.isArray(values) ? values : [values];
    if (op === 'and') {
      return list.every((child) => evaluateFilterNode(targetSet, child, isExactSetMatch));
    }
    if (op === 'or') {
      return list.some((child) => evaluateFilterNode(targetSet, child, isExactSetMatch));
    }
    if (op === 'xor') {
      return (
        list.filter((child) => evaluateFilterNode(targetSet, child, isExactSetMatch)).length === 1
      );
    }
    if (op === 'not') {
      return list.length === 1 && !evaluateFilterNode(targetSet, list[0], isExactSetMatch);
    }
    return false;
  }
  if (node.mode) {
    const mode = (node.mode === 'contains' ? 'contain' : node.mode).toLowerCase();
    const list = Array.isArray(values) ? values : [values];
    const literals = [];
    const subMatchers = [];
    for (const item of list) {
      if (typeof item === 'string') {
        literals.push(item);
      } else if (item && typeof item === 'object') {
        subMatchers.push(item);
      }
    }
    if (mode === 'any') {
      if (list.length === 0) return false;
      return (
        literals.some((lit) => targetSet.has(lit)) ||
        subMatchers.some((sub) => evaluateFilterNode(targetSet, sub, isExactSetMatch))
      );
    }
    if (mode === 'exclude') {
      return (
        literals.every((lit) => !targetSet.has(lit)) &&
        subMatchers.every((sub) => !evaluateFilterNode(targetSet, sub))
      );
    }
    for (const sub of subMatchers) {
      if (!evaluateFilterNode(targetSet, sub, isExactSetMatch)) return false;
    }
    if (mode === 'exact') {
      // Nested predicates constrain the same set; literals define its exact contents.
      if (!literals.length && subMatchers.length) return true;
      const requested = new Set(literals);
      return targetSet.size === requested.size && [...requested].every((lit) => targetSet.has(lit));
    }
    // contain
    return literals.every((lit) => targetSet.has(lit));
  }
  return false;
}

export function matchesListFilter(
  targetValues,
  filterSpec,
  allowUnknown = false,
  isExactSetMatch = false,
) {
  if (filterSpec === null || filterSpec === undefined) return true;
  if (targetValues == null) return allowUnknown;
  const targetSet =
    targetValues instanceof Set
      ? targetValues
      : new Set(Array.isArray(targetValues) ? targetValues : [targetValues]);
  return evaluateFilterNode(targetSet, filterSpec, isExactSetMatch);
}

export function normalizeModalityFilter(value, fieldName = 'modality') {
  const name = fieldName === 'contain' ? 'input' : fieldName === 'exact' ? 'output' : fieldName;
  return normalizeListFilter(value, name);
}

export function matchesModality(modelValues, filterSpec, allowUnknown = false) {
  return matchesListFilter(modelValues, filterSpec, allowUnknown);
}

export function getReleaseChannel(offering) {
  if (offering?.releaseChannel) return offering.releaseChannel;
  const id = offering?.apiModelId || offering?.id || '';
  if (/(?:^|[-_./])(experimental|exp)(?:$|[-_./])/i.test(id)) return 'experimental';
  if (/(?:^|[-_./])(preview|beta|alpha)(?:$|[-_./])/i.test(id)) return 'preview';
  const status = offering?.status;
  if (['preview', 'beta', 'alpha'].includes(status)) return 'preview';
  if (['experimental', 'exp'].includes(status)) return 'experimental';
  return status === 'stable' ? 'stable' : 'unknown';
}

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
  for (const m of data.models) {
    if (!m.speciality || !Object.values(Speciality).includes(m.speciality))
      errors.push(`${m.id}: invalid or missing speciality`);
    if (!m.tier || !Object.values(Tier).includes(m.tier))
      errors.push(`${m.id}: invalid or missing tier`);
  }
  for (const o of data.offerings) {
    if (!o.speciality || !Object.values(Speciality).includes(o.speciality))
      errors.push(`${o.id}: invalid or missing speciality`);
    if (!o.tier || !Object.values(Tier).includes(o.tier))
      errors.push(`${o.id}: invalid or missing tier`);
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
      o.releaseChannel !== undefined &&
      !['stable', 'preview', 'experimental', 'unknown'].includes(o.releaseChannel)
    )
      errors.push(`${o.id}: invalid release channel`);
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
const dateParseCache = new Map();
export const parseEpoch = (str) => {
  let val = dateParseCache.get(str);
  if (val === undefined) {
    val = Date.parse(str);
    dateParseCache.set(str, val);
  }
  return val;
};
export function parseReleasedWithinDays(val) {
  if (typeof val === 'number') {
    return val > 0 && Number.isFinite(val) ? val : undefined;
  }
  if (typeof val === 'string') {
    const s = val
      .trim()
      .toLowerCase()
      .replace(/^released?:/, '');
    if (s === '1m' || s === '1month' || s === '1-month' || s === '30d') return 30;
    if (s === '3m' || s === '3months' || s === '3-months' || s === '90d') return 90;
    if (s === '6m' || s === '6months' || s === '6-months' || s === '180d') return 180;
    if (s === '1y' || s === '1year' || s === '1-year' || s === '365d') return 365;
    if (s === '2y' || s === '2years' || s === '2-years' || s === '730d') return 730;
    const num = Number(s);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return undefined;
}
export function getReleaseTags(releaseDate, asOf) {
  if (!releaseDate || typeof releaseDate !== 'string') return [];
  const norm = /^\d{4}-\d{2}$/.test(releaseDate)
    ? releaseDate + '-01T00:00:00Z'
    : releaseDate.includes('T')
      ? releaseDate
      : releaseDate + 'T00:00:00Z';
  const epoch = parseEpoch(norm);
  if (!Number.isFinite(epoch)) return [];
  const now = asOf === undefined ? Date.now() : parseEpoch(asOf);
  const ageDays = (now - epoch) / 86400000;
  if (ageDays < -1) return [];
  const tags = [];
  if (ageDays <= 30) tags.push('release:1m', 'released:1m');
  if (ageDays <= 90) tags.push('release:3m', 'released:3m');
  if (ageDays <= 180) tags.push('release:6m', 'released:6m');
  if (ageDays <= 365) tags.push('release:1y', 'released:1y');
  if (ageDays <= 730) tags.push('release:2y', 'released:2y');
  return tags;
}
export function validateConfig(c = {}) {
  const errors = [];
  if (c.sort !== undefined && !Object.values(ModelSort).includes(c.sort))
    errors.push('Unknown model sort');
  if (c.list !== undefined && !Object.values(ModelList).includes(c.list) && c.list !== 'official')
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
      'includePreviews',
    ],
    filters: [
      'speciality',
      'tier',
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
      'includePreviews',
      'callable',
      'verified',
      'verifiedBy',
      'verifiedWithinDays',
      'official',
      'releasedWithin',
      'releaseChannel',
    ],
    prefer: ['features', 'lowerCost'],
    ui: ['maxProviders', 'maxModelsPerProvider', 'allowCustomModel'],
    budget: ['maxInputTokens', 'maxOutputTokens', 'overheadTokens'],
  };
  for (const [group, keys] of Object.entries(allowed))
    for (const key of Object.keys(group === 'root' ? c : c[group] || {}))
      if (!keys.includes(key)) errors.push(`Unknown ${group}.${key}`);

  const vocabs = {
    releaseChannel: ['stable', 'preview', 'experimental', 'unknown'],
    speciality: Object.values(Speciality),
    tier: Object.values(Tier),
    deployment: Object.values(Deployment),
    origin: Object.values(Country),
    input: Object.values(Modality),
    output: Object.values(Modality),
    requiredFeatures: Object.values(FeatureName),
    lifecycle: Object.values(Lifecycle),
    popularity: Object.values(Popularity),
  };

  const validateSelectorNode = (node, path, vocab) => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const child of node) validateSelectorNode(child, path, vocab);
      return;
    }
    if (typeof node === 'string') {
      if (vocab && !vocab.includes(node)) {
        errors.push(`Unknown ${path} value`);
      }
      return;
    }
    if (typeof node === 'object') {
      let mode;
      let op;
      let values;
      if ('op' in node) {
        op = node.op;
        values =
          node.values !== undefined
            ? node.values
            : node.list !== undefined
              ? node.list
              : node.items;
      } else if ('and' in node) {
        op = 'and';
        values = node.and;
      } else if ('or' in node) {
        op = 'or';
        values = node.or;
      } else if ('xor' in node) {
        op = 'xor';
        values = node.xor;
      } else if ('not' in node) {
        op = 'not';
        values = node.not;
      } else if ('mode' in node) {
        mode = node.mode;
        values =
          node.values !== undefined
            ? node.values
            : node.list !== undefined
              ? node.list
              : node.items;
      } else if ('exact' in node) {
        mode = 'exact';
        values = node.exact;
      } else if ('contain' in node) {
        mode = 'contain';
        values = node.contain;
      } else if ('contains' in node) {
        mode = 'contain';
        values = node.contains;
      } else if ('any' in node) {
        mode = 'any';
        values = node.any;
      } else if ('exclude' in node) {
        mode = 'exclude';
        values = node.exclude;
      } else {
        errors.push(`${path} matcher must specify mode or op`);
        return;
      }
      if (op && !['and', 'or', 'xor', 'not'].includes(String(op).toLowerCase())) {
        errors.push(`${path} operator must be and, or, xor, or not`);
      }
      if (
        mode &&
        !['exact', 'contain', 'contains', 'any', 'exclude'].includes(String(mode).toLowerCase())
      ) {
        errors.push(`${path} matcher mode must be exact, contain, any, or exclude`);
      }
      if (op === 'not' && Array.isArray(values) && values.length !== 1)
        errors.push('not requires exactly one expression');
      if (values !== undefined) {
        if (Array.isArray(values)) {
          for (const child of values) {
            validateSelectorNode(child, path, vocab);
          }
        } else {
          validateSelectorNode(values, path, vocab);
        }
      }
      return;
    }
    errors.push(`${path} must be a string or matcher`);
  };

  if (c.providerIds !== undefined && c.providerIds !== null) {
    validateSelectorNode(c.providerIds, 'providerIds');
  }

  const filterSelectors = [
    'releaseChannel',
    'speciality',
    'tier',
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
  ];
  for (const key of filterSelectors) {
    if (c.filters?.[key] !== undefined && c.filters[key] !== null) {
      validateSelectorNode(c.filters[key], `filters.${key}`, vocabs[key]);
    }
  }

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
  for (const key of ['callable', 'includeDeprecated', 'includePreviews', 'official'])
    if (c.filters?.[key] !== undefined && typeof c.filters[key] !== 'boolean')
      errors.push(`filters.${key} must be boolean`);
  if (c.includePreviews !== undefined && typeof c.includePreviews !== 'boolean')
    errors.push('includePreviews must be boolean');
  const validVerified = [
    'verified',
    'unverified',
    'verified to be failure',
    'issues_reported',
    'stale',
    'failed',
    'passed',
  ];
  if (
    c.filters?.verified !== undefined &&
    typeof c.filters.verified !== 'boolean' &&
    !validVerified.includes(c.filters.verified)
  )
    errors.push('filters.verified must be boolean or verification status');
  if (c.filters?.verifiedBy !== undefined && !/^github:[a-z0-9-]+$/i.test(c.filters.verifiedBy))
    errors.push('verifiedBy must identify a GitHub contributor');
  if (
    c.filters?.verifiedWithinDays !== undefined &&
    (!finite(c.filters.verifiedWithinDays) || c.filters.verifiedWithinDays < 1)
  )
    errors.push('verifiedWithinDays must be positive');
  if (
    c.filters?.releasedWithin !== undefined &&
    parseReleasedWithinDays(c.filters.releasedWithin) === undefined
  )
    errors.push(
      'filters.releasedWithin must be a valid duration (e.g. 1m, 3m, 6m, 1y, 2y) or positive number of days',
    );
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
function hasChannelPreviewTag(node) {
  if (!node) return false;
  if (typeof node === 'string') return node === 'channel:preview';
  if (Array.isArray(node)) return node.some(hasChannelPreviewTag);
  if (typeof node === 'object') {
    const vals = node.values ?? node.items ?? node.any ?? node.exact;
    if (Array.isArray(vals)) return vals.some(hasChannelPreviewTag);
    if (Array.isArray(node.or)) return node.or.some(hasChannelPreviewTag);
    if (Array.isArray(node.and)) return node.and.some(hasChannelPreviewTag);
  }
  return false;
}
function matches(o, m, c, providerTags = [], isCurated = false) {
  const f = c.filters || {};
  const allowUnknown = unknown(c);
  if (f.releaseChannel != null) {
    if (
      !matchesListFilter(
        getReleaseChannel(o),
        normalizeListFilter(f.releaseChannel, 'releaseChannel'),
      )
    )
      return false;
  } else {
    const channel = getReleaseChannel(o);
    const allowPreview =
      isCurated ||
      f.includePreviews === true ||
      c.includePreviews === true ||
      hasChannelPreviewTag(f.includeTags) ||
      (c.list === ModelList.Complete && f.includePreviews !== false && c.includePreviews !== false);
    if (!allowPreview && (channel === 'preview' || channel === 'experimental')) {
      return false;
    }
  }

  if (f.speciality !== undefined && f.speciality !== null) {
    const spec = normalizeListFilter(f.speciality, 'speciality');
    const actual = o.speciality || getModelSpeciality(o, m);
    if (!matchesListFilter(actual, spec, allowUnknown)) return false;
  }
  if (f.tier !== undefined && f.tier !== null) {
    const spec = normalizeListFilter(f.tier, 'tier');
    const actual = o.tier || getModelTier(o, m);
    if (!matchesListFilter(actual, spec, allowUnknown)) return false;
  }
  if (f.deployment !== undefined && f.deployment !== null) {
    const spec = normalizeListFilter(f.deployment, 'deployment');
    if (!matchesListFilter(o.deployment, spec, allowUnknown)) return false;
  }
  if (f.origin !== undefined && f.origin !== null) {
    const spec = normalizeListFilter(f.origin, 'origin');
    if (!m.origin ? !allowUnknown : !matchesListFilter(m.origin, spec, allowUnknown)) return false;
  }
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

  if (f.input !== undefined && f.input !== null) {
    const spec = normalizeListFilter(f.input, 'input');
    if (!matchesModality(o.modalities?.input, spec, allowUnknown)) return false;
  }
  if (f.output !== undefined && f.output !== null) {
    const spec = normalizeListFilter(f.output, 'output');
    if (!matchesModality(o.modalities?.output, spec, allowUnknown)) return false;
  }
  if (f.fileFormats !== undefined && f.fileFormats !== null) {
    const spec = normalizeListFilter(f.fileFormats, 'fileFormats');
    if (
      o.fileFormats == null ? !allowUnknown : !matchesListFilter(o.fileFormats, spec, allowUnknown)
    )
      return false;
  }
  if (f.requiredFeatures !== undefined && f.requiredFeatures !== null) {
    const spec = normalizeListFilter(f.requiredFeatures, 'requiredFeatures');
    const supportedFeatures = Object.keys(o.features || {}).filter(
      (k) =>
        o.features[k]?.status === FeatureStatus.Supported ||
        (o.features[k]?.status === FeatureStatus.Unknown && allowUnknown),
    );
    if (!matchesListFilter(supportedFeatures, spec, allowUnknown)) return false;
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
  const callable =
    f.callable !== undefined ? f.callable : c.list === ModelList.Complete ? undefined : true;
  if (
    callable !== undefined &&
    (o.callSupport?.textGeneration ?? callSupportFor(o).textGeneration) !== callable
  )
    return false;

  if (f.lifecycle !== undefined && f.lifecycle !== null) {
    const spec = normalizeListFilter(f.lifecycle, 'lifecycle');
    if (!matchesListFilter(o.lifecycle.status, spec, allowUnknown)) return false;
  } else {
    const defaultLifecycle =
      f.includeDeprecated === true ||
      (c.list === ModelList.Complete && f.includeDeprecated !== false)
        ? Object.values(Lifecycle)
        : [Lifecycle.Live, Lifecycle.Uncertain];
    if (!defaultLifecycle.includes(o.lifecycle.status)) return false;
  }

  if (f.popularity !== undefined && f.popularity !== null) {
    const spec = normalizeListFilter(f.popularity, 'popularity');
    if (!matchesListFilter(o.popularity.status, spec, allowUnknown)) return false;
  }

  if (f.releasedWithin !== undefined) {
    const maxDays = parseReleasedWithinDays(f.releasedWithin);
    if (maxDays === undefined) return false;
    const rDate = o.releaseDate || m?.releaseDate;
    if (!rDate) {
      if (!unknown(c)) return false;
    } else {
      const norm = /^\d{4}-\d{2}$/.test(rDate)
        ? rDate + '-01T00:00:00Z'
        : rDate.includes('T')
          ? rDate
          : rDate + 'T00:00:00Z';
      const epoch = parseEpoch(norm);
      if (!Number.isFinite(epoch)) {
        if (!unknown(c)) return false;
      } else {
        const now = c.asOf === undefined ? Date.now() : parseEpoch(c.asOf);
        const ageDays = (now - epoch) / 86400000;
        if (ageDays < -1 || ageDays > maxDays) return false;
      }
    }
  }

  const tags = new Set([
    ...[...(m.tags || []), ...providerTags].filter(
      (t) =>
        !t.startsWith('lifecycle:') &&
        !t.startsWith('popularity:') &&
        !t.startsWith('release:') &&
        !t.startsWith('released:'),
    ),
    ...(o.tags || []),
  ]);
  const specVal = o.speciality || getModelSpeciality(o, m);
  if (specVal) tags.add(`speciality:${specVal}`);
  const tierVal = o.tier || getModelTier(o, m);
  if (tierVal) tags.add(`tier:${tierVal}`);
  if (isFlashModel(o, m)) {
    tags.add('model:flash');
  }
  const channel = getReleaseChannel(o);
  if (channel === 'preview' || channel === 'experimental') {
    tags.add('channel:preview');
  }
  if (o.releaseDate) {
    for (const t of getReleaseTags(o.releaseDate, c.asOf)) tags.add(t);
  } else if (m?.releaseDate) {
    for (const t of getReleaseTags(m.releaseDate, c.asOf)) tags.add(t);
  }

  if (f.includeTags !== undefined && f.includeTags !== null) {
    const spec = normalizeListFilter(f.includeTags, 'includeTags');
    if (!matchesListFilter(tags, spec, allowUnknown)) return false;
  }
  if (f.excludeTags !== undefined && f.excludeTags !== null) {
    const spec = normalizeListFilter(f.excludeTags, 'excludeTags');
    if (spec.mode === 'exclude' ? !evaluateFilterNode(tags, spec) : evaluateFilterNode(tags, spec))
      return false;
  }

  if (f.official !== undefined && isOfficialOffering(o, m, providerTags) !== f.official)
    return false;

  return true;
}

export function getModelSpeciality(offering, model = {}) {
  if (offering?.speciality) return offering.speciality;
  if (model?.speciality) return model.speciality;
  const id =
    `${offering?.providerId || ''}/${offering?.apiModelId || offering?.id || model?.id || ''}`.toLowerCase();
  const name = `${offering?.name || ''} ${model?.name || ''}`.toLowerCase();
  const text = `${id} ${name}`;

  if (
    text.includes('daybreak') ||
    text.includes('cybersecurity') ||
    text.includes('security') ||
    text.includes('red-team') ||
    text.includes('blue-team')
  ) {
    return Speciality.Cybersecurity;
  }
  if (
    /codex|codestral|devstral|(?:^|[-_./\s])coder(?:$|[-_./\s])|starcoder|code-llama/i.test(text)
  ) {
    return Speciality.Coding;
  }
  if (text.includes('lyria') || text.includes('music')) {
    return Speciality.Music;
  }
  if (
    text.includes('guard') ||
    text.includes('safety') ||
    text.includes('shield') ||
    text.includes('moderation')
  ) {
    return Speciality.Safety;
  }
  if (
    text.includes('customtools') ||
    text.includes('deep-research') ||
    text.includes('computer-use')
  ) {
    return Speciality.Agent;
  }
  if (text.includes('live-translate') || text.includes('translate')) {
    return Speciality.Translation;
  }
  if (text.includes('embed') || text.includes('embedding') || text.includes('bge-')) {
    return Speciality.Embedding;
  }
  const outMods = offering?.modalities?.output || [];
  if (outMods.length === 1 && outMods[0] === 'image' && !outMods.includes('text')) {
    return Speciality.Image;
  }
  if (outMods.length === 1 && outMods[0] === 'audio' && !outMods.includes('text')) {
    return Speciality.Audio;
  }
  if (outMods.length === 1 && outMods[0] === 'video' && !outMods.includes('text')) {
    return Speciality.Video;
  }
  if (
    text.includes('dall-e') ||
    text.includes('imagen') ||
    text.includes('flux') ||
    text.includes('midjourney') ||
    text.includes('image-latest')
  ) {
    return Speciality.Image;
  }
  if (text.includes('whisper') || text.includes('tts') || text.includes('speech')) {
    return Speciality.Audio;
  }
  if (
    text.includes('sora') ||
    text.includes('veo') ||
    text.includes('gen-3') ||
    text.includes('video-latest')
  ) {
    return Speciality.Video;
  }
  return /gpt|claude|gemini|deepseek|llama|qwen|mistral|gemma|glm|grok|kimi|minimax/i.test(text)
    ? Speciality.General
    : Speciality.Unknown;
}

export function getModelTier(offering, model = {}) {
  if (offering?.tier) return offering.tier;
  if (model?.tier) return model.tier;
  const id = `${offering?.apiModelId || offering?.id || model?.id || ''}`.toLowerCase();
  const name = `${offering?.name || ''} ${model?.name || ''}`.toLowerCase();
  const text = `${id} ${name}`;

  if (
    /(?:^|[-_./\s])edge(?:$|[-_./\s])/i.test(text) ||
    text.includes('on-device') ||
    text.includes('mobile') ||
    text.includes('pico') ||
    text.includes('tiny') ||
    text.includes('embedded')
  ) {
    return Tier.Edge;
  }
  if (
    text.includes('flash-lite') ||
    text.includes('flash_lite') ||
    text.includes('nano') ||
    /(?:^|[-_./\s])lite(?:$|[-_./\s])/i.test(text)
  ) {
    return Tier.Lite;
  }
  if (
    /(?:^|[-_./\s])mini(?:$|[-_./\s])/i.test(text) ||
    text.includes('gemma') ||
    text.includes('micro')
  ) {
    return Tier.Mini;
  }
  if (isFlashModel(offering, model) || text.includes('luna') || text.includes('haiku')) {
    return Tier.Flash;
  }
  if (
    text.includes('astra') ||
    text.includes('opus') ||
    text.includes('fable') ||
    text.includes('argon') ||
    /(?:^|[-_./\s])pro(?:$|[-_./\s])/i.test(text)
  ) {
    return Tier.Flagship;
  }
  return /gpt|claude|gemini|deepseek|llama|qwen|mistral|glm|grok|kimi|minimax/i.test(text)
    ? Tier.Workhorse
    : Tier.Unknown;
}

export function isFlashModel(offering, model = {}) {
  if (
    (offering?.tags || []).includes('model:flash') ||
    (model?.tags || []).includes('model:flash')
  ) {
    return true;
  }
  const flashRegex = /(?:^|[-_./\s])flashx?(?:$|[-_./\s])/i;
  return Boolean(
    (offering?.apiModelId && flashRegex.test(offering.apiModelId)) ||
    (offering?.name && flashRegex.test(offering.name)) ||
    (offering?.modelId && flashRegex.test(offering.modelId)) ||
    (model?.id && flashRegex.test(model.id)) ||
    (model?.name && flashRegex.test(model.name)),
  );
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

const lowerNameCache = new WeakMap();
const getLowerName = (o) => {
  let n = lowerNameCache.get(o);
  if (n === undefined) {
    n = o.name.toLowerCase();
    lowerNameCache.set(o, n);
  }
  return n;
};

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
    text(getLowerName(a), getLowerName(b)) * (sort === ModelSort.AlphabeticalDescend ? -1 : 1) ||
    text(a.providerId, b.providerId) ||
    text(a.id, b.id)
  );
}

export function stableKey(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableKey).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableKey(obj[k])}`).join(',')}}`;
}

export function serializeQuery(input = {}, options) {
  const config = normalizeQuery(input, options);
  return stableKey(config);
}

export function getConfig(input = {}, options) {
  return structuredClone(normalizeQuery(input, options));
}

export function getConfigJson(input = {}, options, indent = 2) {
  return JSON.stringify(getConfig(input, options), null, indent);
}

export const toConfig = getConfig;
export const toConfigJson = getConfigJson;

export class Catalog {
  constructor(data, options = {}) {
    const trusted = Boolean(options?.trusted);
    if (!trusted) {
      const errors = validateCatalog(data);
      if (errors.length) throw new Error(errors.join('; '));
    }
    this.data = trusted ? { ...data } : structuredClone(data);
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
    this._cache = new Map();
  }
  addVerifications(records) {
    if (!Array.isArray(records)) return;
    this.data.verifications = this.data.verifications || [];
    for (const v of records) {
      if (!this.data.verifications.some((existing) => existing.id === v.id)) {
        this.data.verifications.push(v);
        let list = this.verificationsByOffering.get(v.offeringId);
        if (!list) {
          list = [];
          this.verificationsByOffering.set(v.offeringId, list);
        }
        list.push(v);
      }
    }
    this._cache?.clear();
  }
  get(id) {
    return this.offerings.get(id);
  }
  serializeQuery(input = {}, options) {
    return serializeQuery(input, options);
  }
  getConfig(input = {}, options) {
    return getConfig(input, options);
  }
  getConfigJson(input = {}, options, indent = 2) {
    return getConfigJson(input, options, indent);
  }
  toConfig(input = {}, options) {
    return getConfig(input, options);
  }
  toConfigJson(input = {}, options, indent = 2) {
    return getConfigJson(input, options, indent);
  }
  hasCached(input = {}, options) {
    return this._cache.has(serializeQuery(input, options));
  }
  getCached(input = {}, options) {
    const key = serializeQuery(input, options);
    return this._cache.has(key) ? structuredClone(this._cache.get(key)) : undefined;
  }
  clearCache() {
    this._cache.clear();
  }
  getModels(input = {}, options) {
    const config = normalizeQuery(input, options);
    if (
      [
        ModelSort.Speed,
        ModelSort.SpeedAscend,
        ModelSort.SpeedDescend,
        'speed',
        'speedAscend',
        'speedDescend',
      ].includes(config.sort)
    ) {
      throw new NotImplementedError('Speed sorting is not implemented');
    }
    const cacheKey = serializeQuery(input, options);
    if (this._cache.has(cacheKey)) {
      return structuredClone(this._cache.get(cacheKey));
    }
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
    if (sort !== ModelSort.ProviderOrder) hosted.sort((a, b) => compareModels(a[1], b[1], sort));
    const limited = hosted.slice(0, config.limit);
    const locals = groups
      .filter((g) => g.provider.deployment === Deployment.Local)
      .flatMap((g) => g.offerings.map((o) => [g, o]));
    const result = structuredClone(
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
    if (this._cache.size >= 64) {
      this._cache.delete(this._cache.keys().next().value);
    }
    this._cache.set(cacheKey, result);
    return structuredClone(result);
  }
  getModelsByProvider(input = {}, options) {
    const models = this.getModels(input, options);
    const grouped = {};
    for (const model of models) {
      const key = model.provider?.id || model.providerId || (model.local ? 'local' : 'unknown');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(model);
    }
    return grouped;
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
      (config.preset === 'official' || config.preset === 'official-flagship'
        ? this.data.presets.find((p) => p.id === 'official-flagship' || p.id === 'official')
        : undefined) ||
      (config.list === ModelList.Default
        ? this.data.presets.find((p) => p.id === 'global')
        : undefined);
    if (!preset) throw new Error(`Unknown preset: ${config.preset}`);
    let ids;
    if (config.providerIds !== undefined && config.providerIds !== null) {
      const spec = normalizeListFilter(config.providerIds, 'providerIds');
      const collectLiterals = (node) => {
        if (!node) return [];
        if (typeof node === 'string') return [node];
        const val = node.values !== undefined ? node.values : node.items;
        return (Array.isArray(val) ? val : [val]).flatMap(collectLiterals);
      };
      const requested = collectLiterals(spec);
      if (requested.some((id) => !this.providers.has(id))) {
        throw new Error('Unknown provider in providerIds');
      }
      ids = Array.isArray(config.providerIds)
        ? [...new Set(config.providerIds)]
        : this.data.providers
            .map((p) => p.id)
            .filter((id) => evaluateFilterNode(new Set([id]), spec));
    } else {
      ids =
        config.list === ModelList.Complete
          ? this.data.providers.map((p) => p.id)
          : preset.providerIds;
    }
    const groups = [];
    const recommended = preset.offeringIds ? new Set(preset.offeringIds) : null;
    for (const id of ids) {
      if (this.providers.get(id).deployment === Deployment.Local) continue;
      const providerOfferings = this.offeringsByProvider.get(id) || [];
      let choices = providerOfferings
        .filter((o) => !recommended || recommended.has(o.id))
        .map((o) => withSignals(o, config.asOf))
        .filter(
          (o) =>
            matches(
              o,
              this.models.get(o.modelId),
              config,
              this.providers.get(id).tags,
              Boolean(recommended?.has(o.id)),
            ) && matchesVerification(this.data, o.id, config),
        );
      choices.sort((a, b) => {
        const preferred = (x) =>
          config.prefer?.features?.filter((f) => x.features?.[f]?.status === 'supported').length ||
          0;
        const flagshipOrder =
          config.preset === 'official-flagship' || config.preset === 'official'
            ? Number(isFlashModel(a, this.models.get(a.modelId))) -
                Number(isFlashModel(b, this.models.get(b.modelId))) ||
              (b.price?.input ?? 0) - (a.price?.input ?? 0)
            : 0;
        return (
          Number(b.lifecycle.status === Lifecycle.Live) -
            Number(a.lifecycle.status === Lifecycle.Live) ||
          preferred(b) - preferred(a) ||
          (config.prefer?.lowerCost
            ? (a.price?.input ?? Infinity) - (b.price?.input ?? Infinity)
            : 0) ||
          flagshipOrder ||
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
  for (const direction of ['input', 'output']) {
    const rawMod = options.modalities?.[direction];
    const req = Array.isArray(rawMod)
      ? rawMod
      : rawMod?.values || rawMod?.exact || rawMod?.contain || rawMod?.contains || rawMod?.any || [];
    for (const modality of req) {
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
        'model:',
        'speciality:',
        'tier:',
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
  const specVal = offering.speciality || getModelSpeciality(offering, model);
  if (specVal) tags.push(`speciality:${specVal}`);
  const tierVal = offering.tier || getModelTier(offering, model);
  if (tierVal) tags.push(`tier:${tierVal}`);
  const ctx = offering.limits?.context;
  if (positive(ctx))
    tags.push(
      `context:${ctx >= 1000000 ? '1m+' : ctx >= 128000 ? '128k+' : ctx >= 32000 ? '32k+' : 'under-32k'}`,
    );
  const p = offering.price;
  if (p?.currency === Currency.USD && finite(p.input) && finite(p.output)) {
    const cost = (p.input + p.output) / 1000;
    tags.push(
      `price:${cost === 0 ? 'zero-token-rate' : cost <= 0.002 ? 'budget' : cost <= 0.02 ? 'mid' : 'premium'}`,
    );
  }
  if (isFlashModel(offering, model)) {
    tags.push('model:flash');
  }
  const channel = getReleaseChannel(offering);
  if (channel === 'preview' || channel === 'experimental') {
    tags.push('channel:preview');
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
      'assessment',
      'tokensPerSecond',
      'timeToFirstTokenMs',
    ];
    if (
      r.tokensPerSecond !== undefined &&
      (!Number.isFinite(r.tokensPerSecond) || r.tokensPerSecond <= 0)
    )
      errors.push('tokensPerSecond must be a positive number');
    if (
      r.timeToFirstTokenMs !== undefined &&
      (!Number.isFinite(r.timeToFirstTokenMs) || r.timeToFirstTokenMs < 0)
    )
      errors.push('timeToFirstTokenMs must be a non-negative number');
    if (
      r.assessment !== undefined &&
      (!validAssessment(r.assessment) ||
        ['canceled', 'skipped'].includes(r.assessment.attempt.outcome) ||
        (r.result === 'passed') !== (r.assessment.attempt.outcome === 'succeeded'))
    )
      errors.push('Invalid structured verification assessment');
    if (
      validAssessment(r.assessment) &&
      r.assessment.checks.speed !== 'passed' &&
      r.tokensPerSecond !== undefined
    )
      errors.push('Incomplete speed checks cannot carry speed metrics');
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
    ? source.filter(
        (r) =>
          typeof r.contributor === 'string' &&
          r.contributor.toLowerCase() === contributor.toLowerCase(),
      )
    : source;
  const community = communityAssessment(records, { now: Date.parse(asOf), maxAgeDays });
  return {
    status:
      community.status === 'verified'
        ? 'passed'
        : community.status === 'stale'
          ? 'stale'
          : 'unverified',
    communityStatus: community.status,
    latest: community.latestSuccess || community.latest,
    community,
    records,
  };
}
function matchesVerification(data, id, config) {
  const f = config.filters || {};
  if (f.verified === undefined && !f.verifiedBy && f.verifiedWithinDays === undefined) return true;
  const summary = verificationSummary(data, id, {
    asOf: config.asOf,
    maxAgeDays: f.verifiedWithinDays,
    contributor: f.verifiedBy,
  });
  if (typeof f.verified === 'string') {
    if (['failed', 'verified to be failure'].includes(f.verified))
      return summary.records.some(
        (r) =>
          !textWasVerified(r) &&
          Date.parse(r.checkedAt) <= Date.parse(config.asOf || new Date().toISOString()) &&
          Date.parse(r.checkedAt) >=
            Date.parse(config.asOf || new Date().toISOString()) -
              (f.verifiedWithinDays ?? 90) * 86400000,
      );
    return summary.communityStatus === f.verified || summary.status === f.verified;
  }
  return f.verified === false ? summary.status !== 'passed' : summary.status === 'passed';
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
    (t) =>
      !t.startsWith('lifecycle:') &&
      !t.startsWith('popularity:') &&
      !t.startsWith('release:') &&
      !t.startsWith('released:'),
  );
  const releaseTags = getReleaseTags(o.releaseDate, asOf);
  const channel = getReleaseChannel(o);
  const channelTags =
    channel === 'preview' || channel === 'experimental' ? ['channel:preview'] : [];
  return {
    ...o,
    lifecycle,
    popularity,
    tags: [
      ...new Set([
        ...tags,
        ...channelTags,
        `lifecycle:${lifecycle.status}`,
        `popularity:${popularity.status}`,
        ...releaseTags,
      ]),
    ],
  };
}

function normalizeQuery(input = {}, options) {
  const mode = typeof input === 'string';
  if (mode && !Object.values(ModelList).includes(input) && input !== 'official')
    throw new Error('Unknown model list');
  if (
    !mode &&
    (input === null || typeof input !== 'object' || Array.isArray(input) || options !== undefined)
  )
    throw new Error('Use getModels(options) or getModels(list, options)');
  const config = mode ? { ...(options || {}), list: input } : { ...input };
  if (config.list === undefined && config.preset === undefined && config.providerIds === undefined)
    config.list = ModelList.Default;
  if (config.list === ModelList.Live) config.list = ModelList.Default;
  if (config.list === ModelList.China) config.preset = 'china';
  if (config.list === ModelList.Global) config.preset = 'global';
  if (
    config.list === ModelList.OfficialFlagship ||
    config.list === ModelList.Official ||
    config.list === 'official-flagship' ||
    config.list === 'official'
  ) {
    config.preset = 'official-flagship';
    config.filters = { ...config.filters, official: true };
  }
  if (config.preset === 'official') {
    config.preset = 'official-flagship';
  }
  if (config.list !== ModelList.Complete && config.list !== 'complete') {
    const f = { ...(config.filters || {}) };
    if (f.callable === undefined) {
      f.callable = true;
    }
    config.filters = f;
  }
  if (config.filters) {
    const f = { ...config.filters };
    if (f.input !== undefined && f.input !== null) {
      const norm = normalizeModalityFilter(f.input, 'input');
      f.input = norm;
    }
    if (f.output !== undefined && f.output !== null) {
      f.output = normalizeModalityFilter(f.output, 'output');
    }
    config.filters = f;
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
function hasModalityFilter(spec) {
  if (!spec) return false;
  if (Array.isArray(spec)) return spec.length > 0;
  if (typeof spec === 'object') {
    if (spec.mode || spec.op) return true;
    const vals = spec.values || spec.exact || spec.contain || spec.contains || spec.any;
    return Array.isArray(vals) ? vals.length > 0 : Boolean(vals);
  }
  return true;
}
function localGroups(config, catalog) {
  for (const field of ['speciality', 'tier', 'releaseChannel']) {
    if (
      config.filters?.[field] != null &&
      !matchesListFilter('unknown', normalizeListFilter(config.filters[field], field))
    )
      return [];
  }
  if (
    hasModalityFilter(config.filters?.input) ||
    hasModalityFilter(config.filters?.output) ||
    config.filters?.callable === false ||
    config.filters?.official === true ||
    config.preset === 'official-flagship' ||
    config.preset === 'official' ||
    config.local === false ||
    (config.filters?.deployment &&
      !evaluateFilterNode(
        new Set([Deployment.Local]),
        normalizeListFilter(config.filters.deployment, 'deployment'),
        true,
      ))
  )
    return [];
  const ids =
    config.providerIds !== undefined && config.providerIds !== null
      ? catalog.data.providers
          .map((p) => p.id)
          .filter((id) =>
            evaluateFilterNode(
              new Set([id]),
              normalizeListFilter(config.providerIds, 'providerIds'),
              true,
            ),
          )
      : catalog.data.presets.find((p) => p.id === config.preset)?.providerIds;
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
    speciality: Speciality.Unknown,
    tier: Tier.Unknown,
    releaseChannel: 'unknown',
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
