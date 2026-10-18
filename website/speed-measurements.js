// Versioned, fixed settings keep community speed estimates comparable.
export const SPEED_BENCHMARK = 'count-128-delta-v1';
export const SPEED_PROMPT = 'Count from 1 to 50 separated by spaces: 1 2 3...';
export const SPEED_MAX_TOKENS = 128;
export const SPEED_WINDOW_DAYS = 30;
export const speedAdapter = (protocol) => `byokit-website@${SPEED_BENCHMARK}:${protocol}`;
export function isStandardSpeedSettings(settings) {
  return settings.prompt === SPEED_PROMPT && settings.maxTokens === SPEED_MAX_TOKENS;
}
function quantile(values, fraction) {
  const index = (values.length - 1) * fraction,
    lower = Math.floor(index);
  return values[lower] + (values[Math.ceil(index)] - values[lower]) * (index - lower);
}
export function measurementSummary(reports, offeringId, protocol, now = Date.now()) {
  const day = 86400000;
  const valid = [
    ...new Map(
      reports
        .filter(
          (r) =>
            r.id &&
            r.offeringId === offeringId &&
            !r.staging &&
            r.scope !== 'this-browser' &&
            ['passed', 'failed'].includes(r.result) &&
            r.checks?.includes('textGeneration') &&
            Number.isFinite(Date.parse(r.checkedAt)) &&
            Date.parse(r.checkedAt) <= now,
        )
        .map((r) => [r.id, r]),
    ).values(),
  ];
  const identity = (r) => {
    const login = r.contributor?.match(/^github:([-a-z0-9]{1,39})$/i)?.[1];
    return login ? r.id.match(/^website:([1-9]\d*):/)?.[1] || login.toLowerCase() : null;
  };
  const contributors = new Set(valid.map(identity).filter(Boolean));
  const samples = valid.filter(
    (r) =>
      r.result === 'passed' &&
      r.adapter === speedAdapter(protocol) &&
      Date.parse(r.checkedAt) >= now - SPEED_WINDOW_DAYS * day &&
      Number.isFinite(r.tokensPerSecond) &&
      r.tokensPerSecond > 0 &&
      r.tokensPerSecond <= 10000,
  );
  const speedContributors = new Set(samples.map(identity).filter(Boolean)).size;
  const values = samples.map((r) => r.tokensPerSecond).sort((a, b) => a - b);
  const median = values.length ? quantile(values, 0.5) : null;
  const p25 = values.length ? quantile(values, 0.25) : null;
  const p75 = values.length ? quantile(values, 0.75) : null;
  const latestAt = valid.length ? Math.max(...valid.map((r) => Date.parse(r.checkedAt))) : null;
  const latestSpeedAt = samples.length
    ? Math.max(...samples.map((r) => Date.parse(r.checkedAt)))
    : null;
  const nudge = !samples.length
    ? 'No recent standard speed measurements. Be the first.'
    : samples.length < 5
      ? `Only ${samples.length} recent speed ${samples.length === 1 ? 'measurement' : 'measurements'}. Add yours.`
      : (p75 - p25) / median > 0.35
        ? 'Results vary. Another contributor helps.'
        : latestSpeedAt < now - 7 * day
          ? 'No speed measurements this week. Add yours.'
          : 'Add your result to strengthen the speed estimate.';
  return {
    checks: valid.length,
    contributors: contributors.size,
    samples: samples.length,
    speedContributors,
    median,
    p25,
    p75,
    latestAt,
    latestSpeedAt,
    latestSpeedEvidence:
      [...samples].sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0]?.evidence ||
      null,
    nudge,
  };
}
export function relativeMeasurementTime(timestamp, now = Date.now()) {
  if (timestamp == null) return 'Never tested';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hours ago` : `${Math.floor(hours / 24)} days ago`;
}
