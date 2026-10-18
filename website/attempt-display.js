import { classifyVerificationError, validAssessment } from '../packages/byokit/verification.js';
const labels = {
  invalid_credentials: 'This provider rejected the API key',
  quota_exhausted: 'Your account or model quota is exhausted',
  rate_limited: 'The provider is limiting requests',
  access_denied: 'Access restricted for this account or model',
  region_restricted: 'The provider reported a location restriction',
  policy_restricted: 'Provider policy prevented this request',
  model_not_found_or_inaccessible: 'Model ID not found or inaccessible to this account',
  invalid_request: 'The request settings need correction',
  unsupported_operation: 'This operation is unsupported',
  provider_unavailable: 'The provider is temporarily unavailable',
  network_error: 'Network prevented verification; browser CORS restrictions may also be involved',
  timeout: 'The request timed out',
  invalid_response: 'The response could not complete this check',
  empty_response: 'The response contained no visible text',
  unknown: 'The attempt was inconclusive',
};
const actions = {
  check_credentials: 'Check or replace this provider’s key.',
  check_billing: 'Check credits, billing, and quota reset.',
  retry_later: 'Retry manually later.',
  check_limits: 'Check both quota and request limits before retrying.',
  check_model_access: 'Check account permissions and model entitlement.',
  check_supported_locations: 'Check the provider’s supported locations.',
  review_policy: 'Review the provider’s account and request policy.',
  check_model_id_and_access: 'Check the model ID and account access.',
  check_operation: 'Choose a supported operation.',
  check_settings: 'Correct the request settings.',
  check_network: 'Check connectivity or copy the SDK example to try locally.',
  review_response: 'Review response compatibility and retry manually.',
  review_diagnostics: 'Review the safe status details before retrying.',
  none: '',
};
export function assessmentForError(error) {
  if (validAssessment(error.assessment)) return error.assessment;
  const attempt = classifyVerificationError(error);
  return {
    attempt,
    checks: {
      textGeneration:
        attempt.outcome === 'blocked'
          ? 'blocked'
          : attempt.outcome === 'canceled'
            ? 'not_run'
            : 'inconclusive',
      speed: 'not_run',
    },
  };
}
export function attemptText(assessment) {
  const a = assessment.attempt;
  if (a.outcome === 'succeeded') return 'Call succeeded';
  if (a.outcome === 'canceled') return 'Verification canceled';
  if (a.outcome === 'skipped') return `Not attempted${a.reason ? `: ${labels[a.reason]}` : ''}`;
  const prefix = a.outcome === 'partial' ? 'Text generation verified; speed not measured. ' : '';
  const label =
    a.httpStatus === 429 && a.reason === 'unknown'
      ? 'Rate or quota limit reported'
      : labels[a.reason] || labels.unknown;
  return `${prefix}${label}${a.httpStatus ? ` (HTTP ${a.httpStatus})` : ''}. ${actions[a.retry.action] || ''}`;
}
export function retryCountdown(element, attempt) {
  clearInterval(element._retryTimer);
  element.hidden = attempt?.retry.afterSeconds == null || attempt.retry.action === 'none';
  if (element.hidden) return;
  const deadline = Date.now() + attempt.retry.afterSeconds * 1000;
  const tick = () => {
    if (!element.isConnected) {
      clearInterval(element._retryTimer);
      return;
    }
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    element.textContent = remaining
      ? `Provider retry guidance: wait ${remaining}s. Retry manually; no request will be sent automatically.`
      : 'The suggested wait has elapsed. You can retry manually.';
    if (!remaining) clearInterval(element._retryTimer);
  };
  tick();
  element._retryTimer = setInterval(tick, 1000);
}
