// Safe, bounded classifications. Raw provider responses never become metadata.
export const CLASSIFIER_VERSION = '1';
const outcomes = ['succeeded', 'partial', 'blocked', 'inconclusive', 'canceled', 'skipped'];
const reasons = [
  'invalid_credentials',
  'quota_exhausted',
  'rate_limited',
  'access_denied',
  'region_restricted',
  'policy_restricted',
  'model_not_found_or_inaccessible',
  'invalid_request',
  'unsupported_operation',
  'provider_unavailable',
  'network_error',
  'timeout',
  'invalid_response',
  'empty_response',
  'unknown',
];
const scopes = ['account', 'model', 'provider', 'region', 'request', 'client', 'unknown'];
export function classifyVerificationError(error = {}, { body, retryAfter, now = Date.now() } = {}) {
  if (validAttempt(error.attempt) && body === undefined && retryAfter === undefined)
    return structuredClone(error.attempt);
  const status = error.status;
  let reason = 'unknown',
    scope = 'unknown',
    certainty = 'unknown',
    source = 'client_error',
    action = 'review_diagnostics';
  const set = (r, s, a, c = 'explicit', p = 'provider_code') => {
    reason = r;
    scope = s;
    action = a;
    certainty = c;
    source = p;
  };
  const detail = body?.error || body || {};
  const codes = [
    detail.code,
    detail.type,
    detail.status,
    ...(Array.isArray(detail.details) ? detail.details.map((d) => d?.reason) : []),
  ]
    .filter((v) => typeof v === 'string')
    .map((v) => v.toLowerCase());
  const has = (...values) => codes.some((v) => values.includes(v));
  const message =
    typeof detail.message === 'string' ? detail.message.slice(0, 4096).toLowerCase() : '';
  const quotaItems = (Array.isArray(detail.details) ? detail.details : []).flatMap((d) =>
    d && typeof d === 'object'
      ? [
          ...(Array.isArray(d.quotaViolations) ? d.quotaViolations : []),
          ...(Array.isArray(d.violations) ? d.violations : []),
        ]
      : [],
  );
  const quotaTerms = quotaItems
    .map(
      (v) =>
        `${v?.quotaId || ''} ${v?.quotaMetric || ''} ${typeof v?.description === 'string' ? v.description.slice(0, 4096) : ''}`,
    )
    .join(' ')
    .toLowerCase();
  const quotaScope = quotaItems.some((v) => v?.quotaDimensions?.model) ? 'model' : 'account';
  const minuteQuota = /per.?minute|per.?second/.test(quotaTerms);
  const dailyQuota = /per.?day|per.?month/.test(quotaTerms);
  if (
    has('unsupported_country_region_territory', 'region_restricted', 'unsupported_location') ||
    /(?:country|region|location).{0,45}(?:not supported|unsupported|restricted)|(?:unsupported|not supported).{0,45}(?:country|region|location)/.test(
      message,
    )
  )
    set('region_restricted', 'region', 'check_supported_locations');
  else if (minuteQuota) set('rate_limited', quotaScope, 'retry_later');
  else if (dailyQuota) set('quota_exhausted', quotaScope, 'check_billing');
  else if (
    has(
      'insufficient_quota',
      'quota_exceeded',
      'billing_hard_limit_reached',
      'credit_balance_too_low',
      'organization_usage_limit_exceeded',
    ) ||
    /(?:credit balance.{0,25}(?:low|insufficient)|insufficient (?:credits|funds)|(?:daily |monthly )quota.{0,25}(?:exceeded|exhausted))/.test(
      message,
    )
  )
    set('quota_exhausted', 'account', 'check_billing');
  else if (
    has('rate_limit_exceeded', 'rate_limit_error', 'rate_limited', 'slow_down') ||
    /rate limit|too many requests/.test(message)
  )
    set('rate_limited', 'unknown', 'retry_later');
  else if (
    has('invalid_api_key', 'api_key_invalid', 'authentication_error', 'unauthenticated') ||
    /api key (?:not valid|is invalid|is not valid)|invalid api key/.test(message)
  )
    set('invalid_credentials', 'account', 'check_credentials');
  else if (has('model_access_denied')) set('access_denied', 'model', 'check_model_access');
  else if (
    /only.{0,30}(?:existing|legacy|old) (?:users|customers|accounts)|(?:existing|legacy) (?:users|customers|accounts) only/.test(
      message,
    )
  )
    set('access_denied', 'account', 'check_model_access');
  else if (has('permission_denied', 'access_denied', 'permission_error'))
    set('access_denied', 'unknown', 'check_model_access');
  else if (has('content_policy_violation', 'safety', 'blocked_reason', 'policy_violation'))
    set('policy_restricted', 'request', 'review_policy');
  else if (has('model_not_found', 'not_found'))
    set('model_not_found_or_inaccessible', 'unknown', 'check_model_id_and_access');
  else if (has('unsupported_operation', 'not_supported'))
    set('unsupported_operation', 'request', 'check_operation');
  else if (has('invalid_argument', 'invalid_request_error'))
    set('invalid_request', 'request', 'check_settings');
  else if (has('overloaded_error', 'unavailable', 'api_error', 'internal'))
    set('provider_unavailable', 'provider', 'retry_later');
  else if (Number.isInteger(status)) {
    source = 'http_status';
    certainty = 'inferred';
    if (status === 401)
      set('invalid_credentials', 'account', 'check_credentials', 'inferred', 'http_status');
    else if (status === 402)
      set('quota_exhausted', 'account', 'check_billing', 'inferred', 'http_status');
    else if (status === 403)
      set('access_denied', 'unknown', 'check_model_access', 'inferred', 'http_status');
    else if (status === 404)
      set(
        'model_not_found_or_inaccessible',
        'unknown',
        'check_model_id_and_access',
        'inferred',
        'http_status',
      );
    else if (status === 429) {
      action = 'check_limits';
      certainty = 'unknown';
    } else if (status >= 500)
      set('provider_unavailable', 'provider', 'retry_later', 'inferred', 'http_status');
    else if (status === 400 || status === 422)
      set('invalid_request', 'request', 'check_settings', 'inferred', 'http_status');
  } else {
    const map = {
      CREDENTIAL_ERROR: ['invalid_credentials', 'account', 'check_credentials'],
      INVALID_REQUEST: ['invalid_request', 'request', 'check_settings'],
      UNSUPPORTED_OPERATION: ['unsupported_operation', 'request', 'check_operation'],
      NETWORK_ERROR: ['network_error', 'client', 'check_network'],
      TIMEOUT: ['timeout', 'unknown', 'retry_later'],
      INVALID_RESPONSE: ['invalid_response', 'unknown', 'review_response'],
      EMPTY_RESPONSE: ['empty_response', 'unknown', 'review_response'],
      POLICY_RESTRICTED: ['policy_restricted', 'request', 'review_policy'],
    };
    if (Object.hasOwn(map, error.code)) set(...map[error.code], 'explicit', 'client_error');
  }
  let delay = null;
  if (typeof retryAfter === 'string' && retryAfter.trim()) {
    const n = /^\d+(\.\d+)?$/.test(retryAfter.trim())
      ? Number(retryAfter)
      : (Date.parse(retryAfter) - now) / 1000;
    if (Number.isFinite(n) && n >= 0 && n <= 604800) delay = Math.ceil(n);
  }
  if (delay == null && Array.isArray(detail.details)) {
    const duration = detail.details.find((d) => typeof d?.retryDelay === 'string')?.retryDelay;
    if (/^\d+(\.\d+)?s$/.test(duration || '')) {
      const n = Number(duration.slice(0, -1));
      if (n <= 604800) delay = Math.ceil(n);
    }
  }
  const outcome =
    error.code === 'CANCELED'
      ? 'canceled'
      : [
            'invalid_credentials',
            'quota_exhausted',
            'rate_limited',
            'access_denied',
            'region_restricted',
            'policy_restricted',
            'model_not_found_or_inaccessible',
            'invalid_request',
            'unsupported_operation',
          ].includes(reason) || status === 429
        ? 'blocked'
        : 'inconclusive';
  return {
    outcome,
    reason,
    scope,
    certainty,
    source,
    classifierVersion: CLASSIFIER_VERSION,
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { httpStatus: status } : {}),
    retry: { action: outcome === 'canceled' ? 'none' : action, afterSeconds: delay },
  };
}
export function validAttempt(a) {
  return (
    !!a &&
    typeof a === 'object' &&
    !Array.isArray(a) &&
    outcomes.includes(a.outcome) &&
    (a.reason === null || reasons.includes(a.reason)) &&
    scopes.includes(a.scope) &&
    ['explicit', 'inferred', 'unknown'].includes(a.certainty) &&
    ['provider_code', 'http_status', 'client_error'].includes(a.source) &&
    a.classifierVersion === CLASSIFIER_VERSION &&
    (!('httpStatus' in a) ||
      (Number.isInteger(a.httpStatus) && a.httpStatus >= 100 && a.httpStatus <= 599)) &&
    !!a.retry &&
    [
      'none',
      'check_credentials',
      'check_billing',
      'retry_later',
      'check_limits',
      'check_model_access',
      'check_supported_locations',
      'review_policy',
      'check_model_id_and_access',
      'check_operation',
      'check_settings',
      'check_network',
      'review_response',
      'review_diagnostics',
    ].includes(a.retry.action) &&
    (a.retry.afterSeconds === null ||
      (Number.isInteger(a.retry.afterSeconds) &&
        a.retry.afterSeconds >= 0 &&
        a.retry.afterSeconds <= 604800)) &&
    Object.keys(a.retry).every((k) => ['action', 'afterSeconds'].includes(k)) &&
    Object.keys(a).every((k) =>
      [
        'outcome',
        'reason',
        'scope',
        'certainty',
        'source',
        'classifierVersion',
        'httpStatus',
        'retry',
      ].includes(k),
    )
  );
}
export function successAttempt() {
  return {
    outcome: 'succeeded',
    reason: null,
    scope: 'request',
    certainty: 'explicit',
    source: 'client_error',
    classifierVersion: CLASSIFIER_VERSION,
    retry: { action: 'none', afterSeconds: null },
  };
}
export function validAssessment(a) {
  const states = ['passed', 'blocked', 'inconclusive', 'not_run'];
  if (
    !a ||
    !validAttempt(a.attempt) ||
    !a.checks ||
    Object.keys(a).some((k) => !['attempt', 'checks', 'phases'].includes(k)) ||
    Object.keys(a.checks).some((k) => !['textGeneration', 'speed'].includes(k)) ||
    !states.includes(a.checks.textGeneration) ||
    !states.includes(a.checks.speed)
  )
    return false;
  if (
    (a.attempt.outcome === 'succeeded' &&
      (a.checks.textGeneration !== 'passed' || !['passed', 'not_run'].includes(a.checks.speed))) ||
    (a.attempt.outcome === 'partial' &&
      (a.checks.textGeneration !== 'passed' || a.checks.speed === 'passed'))
  )
    return false;
  if (
    ['blocked', 'inconclusive', 'canceled', 'skipped'].includes(a.attempt.outcome) &&
    a.checks.textGeneration === 'passed'
  )
    return false;
  return (
    a.phases === undefined ||
    (Array.isArray(a.phases) &&
      a.phases.length <= 2 &&
      a.phases.every(
        (p) =>
          p &&
          ['baseline', 'generation'].includes(p.phase) &&
          validAttempt(p.attempt) &&
          Object.keys(p).every((k) => ['phase', 'attempt'].includes(k)),
      ))
  );
}
export const textWasVerified = (r) =>
  r.assessment ? r.assessment.checks?.textGeneration === 'passed' : r.result === 'passed';
export function communityAssessment(records, { now = Date.now(), maxAgeDays = 90 } = {}) {
  const calls = records
    .filter(
      (r) =>
        r.checks.includes('textGeneration') &&
        Date.parse(r.checkedAt) <= now &&
        !['canceled', 'skipped'].includes(r.assessment?.attempt.outcome),
    )
    .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt) || a.id.localeCompare(b.id));
  const fresh = calls.filter((r) => now - Date.parse(r.checkedAt) <= maxAgeDays * 86400000);
  const successes = fresh.filter(textWasVerified);
  const issues = calls.filter(
    (r) =>
      r.assessment?.phases?.at(-1)?.attempt.outcome !== 'canceled' &&
      (r.assessment?.attempt.reason || !textWasVerified(r)) &&
      now - Date.parse(r.checkedAt) <= 7 * 86400000,
  );
  const counts = {};
  for (const r of issues) {
    const reason = r.assessment?.attempt.reason || 'unknown';
    counts[reason] = (counts[reason] || 0) + 1;
  }
  const identities = new Set(
    successes.map((r) => r.id.match(/^website:([1-9]\d*):/)?.[1] || r.contributor.toLowerCase()),
  );
  return {
    status: successes.length
      ? 'verified'
      : fresh.length
        ? 'issues_reported'
        : calls.length
          ? 'stale'
          : 'unverified',
    lastSuccessAt: calls.find(textWasVerified)?.checkedAt || null,
    successfulContributors: identities.size,
    recentIssues: counts,
    issueWindowDays: 7,
    latest: calls[0] || null,
    latestSuccess: successes[0] || null,
  };
}
export function shouldStopProvider(attempt) {
  if (
    !attempt ||
    attempt.scope === 'model' ||
    attempt.scope === 'request' ||
    attempt.outcome === 'canceled'
  )
    return false;
  return (
    [
      'invalid_credentials',
      'quota_exhausted',
      'rate_limited',
      'access_denied',
      'region_restricted',
      'provider_unavailable',
      'network_error',
      'timeout',
    ].includes(attempt.reason) || attempt.httpStatus === 429
  );
}

export async function readProviderError(response) {
  try {
    if (!response.body?.getReader) return await response.json();
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16384) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}
