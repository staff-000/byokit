import {
  SPEED_BENCHMARK,
  SPEED_MAX_TOKENS,
  isStandardSpeedSettings,
} from './speed-measurements.js';
// Shared browser/Actions report format. No credentials, prompts, or generated text.
export const REPORT_MARKER = '<!-- byokit-verification:v1 -->';
const fields = [
  'schemaVersion',
  'operationId',
  'offeringId',
  'modelId',
  'protocol',
  'checkedAt',
  'latencyMs',
  'maxTokens',
  'timeToFirstTokenMs',
  'tokensPerSecond',
  'outputTokens',
  'staging',
  'benchmark',
];
export function reportFields(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !fields.includes(k)) ||
    value.schemaVersion !== 1
  )
    throw new Error('Invalid verification report fields.');
  if (
    typeof value.operationId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.operationId)
  )
    throw new Error('Invalid report ID.');
  for (const key of ['offeringId', 'modelId'])
    if (
      typeof value[key] !== 'string' ||
      !value[key] ||
      value[key].length > 200 ||
      /[\x00-\x1f]/.test(value[key])
    )
      throw new Error('Invalid model identifier.');
  if (!['chat', 'anthropic', 'gemini'].includes(value.protocol))
    throw new Error('Unsupported report protocol.');
  if (
    typeof value.checkedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value.checkedAt) ||
    !Number.isFinite(Date.parse(value.checkedAt))
  )
    throw new Error('Invalid check time.');
  if (
    !Number.isInteger(value.latencyMs) ||
    value.latencyMs < 0 ||
    value.latencyMs > 180000 ||
    !Number.isInteger(value.maxTokens) ||
    value.maxTokens < 16 ||
    value.maxTokens > 8192
  )
    throw new Error('Invalid call settings.');
  if (
    value.timeToFirstTokenMs !== undefined &&
    (!Number.isInteger(value.timeToFirstTokenMs) ||
      value.timeToFirstTokenMs < 0 ||
      value.timeToFirstTokenMs > 180000)
  )
    throw new Error('Invalid TTFT setting.');
  if (
    value.tokensPerSecond !== undefined &&
    (!Number.isFinite(value.tokensPerSecond) ||
      value.tokensPerSecond <= 0 ||
      value.tokensPerSecond > 10000)
  )
    throw new Error('Invalid speed setting.');
  if (
    value.outputTokens !== undefined &&
    (!Number.isInteger(value.outputTokens) || value.outputTokens < 0 || value.outputTokens > 8192)
  )
    throw new Error('Invalid output token count.');
  if (
    value.benchmark !== undefined &&
    (value.benchmark !== SPEED_BENCHMARK ||
      value.maxTokens !== SPEED_MAX_TOKENS ||
      value.tokensPerSecond == null ||
      !Number.isInteger(value.outputTokens) ||
      value.outputTokens <= 0)
  )
    throw new Error('Invalid speed benchmark.');
  if (value.staging !== undefined && value.staging !== true)
    throw new Error('Invalid staging flag.');
  return value;
}
export function createReport(settings, result, operationId, secret = '') {
  const report = {
    schemaVersion: 1,
    operationId,
    offeringId: settings.offeringId,
    modelId: settings.modelId,
    protocol: settings.protocol,
    checkedAt: result.checkedAt,
    latencyMs: result.latencyMs,
    maxTokens: settings.maxTokens,
    ...(result.benchmark === SPEED_BENCHMARK && isStandardSpeedSettings(settings)
      ? { benchmark: SPEED_BENCHMARK }
      : {}),
    ...(result.timeToFirstTokenMs != null ? { timeToFirstTokenMs: result.timeToFirstTokenMs } : {}),
    ...(result.tokensPerSecond != null ? { tokensPerSecond: result.tokensPerSecond } : {}),
    ...(result.usage?.outputTokens != null ? { outputTokens: result.usage.outputTokens } : {}),
  };
  reportFields(report);
  if (secret.trim() && JSON.stringify(report).includes(secret.trim()))
    throw new Error('Report contains private data and cannot be shared.');
  return report;
}
export function issueBody(report) {
  reportFields(report);
  return `${REPORT_MARKER}\n${report.staging ? 'Staging pipeline fixture. No real inference occurred. This must never enter the model catalog.' : 'Community report: this model returned text using my provider account and the settings below.'}\n\nNo API key, prompt, or generated text is included.\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`;
}
export function issueUrl(report) {
  const url = new URL('https://github.com/staff-000/byokit/issues/new');
  url.searchParams.set('template', 'model-verification.md');
  url.searchParams.set(
    'title',
    `[byokit ${report.staging ? 'staging ' : ''}verification] ${report.offeringId}`,
  );
  url.searchParams.set('body', issueBody(report));
  return url.href;
}
export function parseIssueReport(body) {
  if (typeof body !== 'string' || !body.includes(REPORT_MARKER)) return null;
  if (body.length > 6000 || body.split(REPORT_MARKER).length !== 2)
    throw new Error('Verification report is too large or ambiguous.');
  const blocks = [...body.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 1 || blocks[0][1].length > 2000)
    throw new Error('Include exactly one bounded JSON report.');
  return reportFields(JSON.parse(blocks[0][1]));
}
export class PublicationTracker {
  constructor(onFeed, fetcher = (...args) => fetch(...args)) {
    this.onFeed = onFeed;
    this.fetcher = fetcher;
    this.revision = 0;
    this.timer = null;
    this.deadline = 0;
    this.operationId = '';
  }
  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.revision++;
  }
  async check(operationId = this.operationId, offeringId = this.offeringId) {
    const revision = ++this.revision;
    const response = await this.fetcher('./verification.json', {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Publication feed is unavailable. Check again later.');
    const feed = await response.json();
    if (!Array.isArray(feed.reports)) throw new Error('Invalid publication feed.');
    if (revision !== this.revision) return null;
    this.onFeed(feed.reports);
    return (
      feed.reports.find(
        (r) => r.id.endsWith(':' + operationId) && (!offeringId || r.offeringId === offeringId),
      ) || null
    );
  }
  start(operationId, onStatus, offeringId) {
    this.stop();
    this.operationId = operationId;
    this.offeringId = offeringId;
    this.deadline = Date.now() + 300000;
    const tick = async () => {
      const generation = this.revision;
      try {
        const report = await this.check(operationId);
        if (generation + 1 !== this.revision) return;
        if (report) {
          onStatus('published', report);
          return;
        }
        onStatus('waiting');
      } catch {
        if (generation + 1 !== this.revision) return;
        onStatus('unavailable');
      }
      if (Date.now() < this.deadline) this.timer = setTimeout(tick, 15000);
      else onStatus('pending');
    };
    void tick();
  }
}
