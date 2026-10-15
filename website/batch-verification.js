import { verifyInference, requestFor } from './inference.js';
export const MAX_BATCH_REQUESTS = 10;
export function validateBatch(jobs, key) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('Enter this provider’s API key.');
  if (!Array.isArray(jobs) || !jobs.length || jobs.length > MAX_BATCH_REQUESTS)
    throw new Error('Choose between 1 and 10 models for a batch.');
  const provider = jobs[0].providerId,
    ids = new Set();
  for (const job of jobs) {
    if (job.providerId === 'local' || job.providerId !== provider)
      throw new Error('A batch must use one hosted provider and its own API key.');
    if (ids.has(job.offeringId)) throw new Error('Duplicate batch model.');
    ids.add(job.offeringId);
    requestFor(job, key);
  }
}
export async function runBatch(
  jobs,
  key,
  { signal, onResult = () => {}, verify = verifyInference } = {},
) {
  validateBatch(jobs, key);
  const entries = [];
  let stopped = false;
  for (const job of jobs) {
    let entry;
    if (stopped || signal?.aborted)
      entry = {
        offeringId: job.offeringId,
        status: 'skipped',
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
          : { offeringId: job.offeringId, status: 'passed', result };
      } catch (error) {
        const safe = String(error.message || 'Call failed.')
          .split(key)
          .join('[redacted]');
        entry = {
          offeringId: job.offeringId,
          status: signal?.aborted ? 'canceled' : 'failed',
          error: safe,
        };
        stopped =
          ['NETWORK_ERROR', 'TIMEOUT'].includes(error.code) || /HTTP (401|402|403|429)/.test(safe);
      }
    }
    entries.push(entry);
    onResult(entry);
  }
  return entries;
}
