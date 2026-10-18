import {
  classifyVerificationError,
  shouldStopProvider,
  successAttempt,
} from '../packages/byokit/verification.js';
import { verifyInference, requestFor } from './inference.js';
export const MAX_BATCH_REQUESTS = 10;
function providerKey(keys, providerId) {
  return typeof keys === 'string'
    ? keys
    : Object.hasOwn(keys || {}, providerId)
      ? keys[providerId]
      : '';
}
export function validateBatch(jobs, keys) {
  if (!Array.isArray(jobs) || !jobs.length || jobs.length > MAX_BATCH_REQUESTS)
    throw new Error('Choose between 1 and 10 models for a batch.');
  const provider = jobs[0].providerId,
    ids = new Set();
  for (const job of jobs) {
    const key = providerKey(keys, job.providerId);
    if (typeof key !== 'string' || !key.trim())
      throw new Error(`Enter the API key for ${job.providerId}.`);
    if (job.providerId === 'local' || (typeof keys === 'string' && job.providerId !== provider))
      throw new Error('A batch must use one hosted provider and its own API key.');
    if (ids.has(job.offeringId)) throw new Error('Duplicate batch model.');
    ids.add(job.offeringId);
    requestFor(job, key);
  }
}
export async function runBatch(
  jobs,
  keys,
  { signal, onResult = () => {}, verify = verifyInference } = {},
) {
  jobs = jobs.map((job) => ({ ...job }));
  keys = typeof keys === 'string' ? keys : Object.fromEntries(Object.entries(keys || {}));
  validateBatch(jobs, keys);
  const entries = [];
  const stopped = new Map();
  for (const job of jobs) {
    const key = providerKey(keys, job.providerId);
    let entry;
    if (stopped.has(job.providerId) || signal?.aborted)
      entry = {
        offeringId: job.offeringId,
        status: 'skipped',
        assessment: {
          attempt: { ...(stopped.get(job.providerId) || successAttempt()), outcome: 'skipped' },
          checks: { textGeneration: 'not_run', speed: 'not_run' },
        },
        error: signal?.aborted
          ? 'Canceled before this request.'
          : 'Stopped after a provider authentication, quota, or connection failure.',
      };
    else {
      onResult({ offeringId: job.offeringId, status: 'running' });
      try {
        const result = await verify(job, key, { signal });
        entry = signal?.aborted
          ? { offeringId: job.offeringId, status: 'canceled', error: 'Call canceled.' }
          : {
              offeringId: job.offeringId,
              status: result.assessment?.attempt.outcome === 'partial' ? 'partial' : 'passed',
              result,
              ...(result.assessment ? { assessment: result.assessment } : {}),
            };
        if (shouldStopProvider(result.assessment?.attempt))
          stopped.set(job.providerId, result.assessment.attempt);
      } catch (error) {
        const safe = Object.values(typeof keys === 'string' ? { key: keys } : keys)
          .filter(Boolean)
          .reduce(
            (message, secret) => message.split(secret).join('[redacted]'),
            String(error.message || 'Call failed.'),
          );
        const attempt = classifyVerificationError(error);
        entry = {
          assessment: error.assessment || {
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
          },
          checkedAt: error.checkedAt || new Date().toISOString(),
          latencyMs: error.latencyMs || 0,
          offeringId: job.offeringId,
          status: signal?.aborted ? 'canceled' : 'failed',
          error: safe,
        };
        if (shouldStopProvider(attempt)) stopped.set(job.providerId, attempt);
      }
    }
    entries.push(entry);
    onResult(entry);
  }
  return entries;
}
