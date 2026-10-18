import { SPEED_BENCHMARK, speedAdapter } from '../website/speed-measurements.js';
import { parseIssueReport } from '../website/verification-report.js';
export const REPOSITORY = 'staff-000/byokit';
export function issueSubmission(event, catalog) {
  if (
    event.action !== 'opened' ||
    event.repository?.full_name !== REPOSITORY ||
    event.issue?.pull_request
  )
    return null;
  const report = parseIssueReport(event.issue?.body);
  if (!report) return null;
  const issue = event.issue,
    user = issue.user;
  if (
    !Number.isSafeInteger(issue.number) ||
    issue.number < 1 ||
    !Number.isSafeInteger(user?.id) ||
    user.id < 1 ||
    !/^[-a-z0-9]{1,39}$/i.test(user.login || '')
  )
    throw new Error('Invalid GitHub issue identity.');
  const createdAt = Date.parse(issue.created_at),
    checkedAt = Date.parse(report.checkedAt);
  if (
    !Number.isFinite(createdAt) ||
    checkedAt > createdAt + 60000 ||
    createdAt - checkedAt > 86400000
  )
    throw new Error('The check must be within 24 hours before issue submission.');
  const offering = catalog.offerings.find((o) => o.id === report.offeringId),
    expected =
      offering?.providerId === 'anthropic'
        ? 'anthropic'
        : offering?.providerId === 'google'
          ? 'gemini'
          : 'chat';
  if (
    !offering ||
    offering.deployment !== 'hosted' ||
    offering.apiModelId !== report.modelId ||
    report.protocol !== expected
  )
    throw new Error('Report does not match a supported catalog-hosted offering.');
  if (report.staging && user.login.toLowerCase() !== 'staff-000')
    throw new Error('Only the repository owner may submit pipeline staging fixtures.');
  const evidence = `https://github.com/${REPOSITORY}/issues/${issue.number}`;
  return {
    report,
    user: { id: user.id, login: user.login },
    issueNumber: issue.number,
    createdAt: issue.created_at,
    evidence,
  };
}
export function canonicalReport(submission) {
  const { report, user, evidence, createdAt } = submission;
  if (report.staging) throw new Error('Pipeline fixtures are not model verification records.');
  const speedNote = report.tokensPerSecond ? `; speed ${report.tokensPerSecond} tokens/sec` : '';
  const ttftNote = report.timeToFirstTokenMs ? `; TTFT ${report.timeToFirstTokenMs} ms` : '';
  return {
    id: `website:${user.id}:${report.operationId}`,
    offeringId: report.offeringId,
    contributor: `github:${user.login}`,
    checkedAt: report.checkedAt,
    result: 'passed',
    checks: ['textGeneration'],
    ...(report.tokensPerSecond ? { tokensPerSecond: report.tokensPerSecond } : {}),
    ...(report.timeToFirstTokenMs ? { timeToFirstTokenMs: report.timeToFirstTokenMs } : {}),
    adapter:
      report.benchmark === SPEED_BENCHMARK ? speedAdapter(report.protocol) : 'byokit-website@1',
    evidence,
    notes: `Community-reported successful ${report.protocol} call. Output budget ${report.maxTokens}; latency ${report.latencyMs} ms${ttftNote}${speedNote}. GitHub author ID ${user.id}; submitted ${createdAt}; Provider call ran in the contributor’s browser.`,
  };
}
