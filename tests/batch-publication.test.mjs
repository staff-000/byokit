import { successAttempt, classifyVerificationError } from '../packages/byokit/verification.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createBatchReport,
  issueBody,
  issueUrl,
  parseIssueReport,
  PublicationTracker,
} from '../website/verification-report.js';
import { issueSubmission, canonicalReport } from '../scripts/verification-report.mjs';
import { addReport } from '../scripts/publish-verification.mjs';
import { contributorBadges } from '../website/contributor-badges.js';
const time = '2026-10-14T12:00:00.000Z',
  user = { id: 123, login: 'contributor' };
const catalog = JSON.parse(readFileSync('spec/fixtures/catalog.json'));
catalog.providers.push({
  id: 'deepseek',
  name: 'DeepSeek',
  auth: 'required',
  deployment: 'hosted',
});
for (let i = 0; i < 10; i++)
  catalog.offerings.push({
    ...catalog.offerings[0],
    id: `deepseek/test-${i}`,
    providerId: 'deepseek',
    apiModelId: `test-${i}`,
    deployment: 'hosted',
  });
const reports = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    schemaVersion: 1,
    operationId: `71e4f6ef-c19e-4d28-bdf6-${String(i).padStart(12, '0')}`,
    offeringId: `deepseek/test-${i}`,
    modelId: `test-${i}`,
    protocol: 'chat',
    checkedAt: time,
    latencyMs: 200,
    maxTokens: 128,
  }));
const event = (batch) => ({
  action: 'opened',
  repository: { full_name: 'staff-000/byokit' },
  issue: { number: 42, user, created_at: time, body: issueBody(batch) },
});
test('one compact batch issue roundtrips 10 reports and uses trusted GitHub identity', () => {
  const batch = createBatchReport(reports(10));
  assert.deepEqual(parseIssueReport(issueBody(batch)), batch);
  assert.ok(issueUrl(batch).length < 7800);
  const submission = issueSubmission(event(batch), catalog);
  assert.equal(submission.reports.length, 10);
  assert.equal(submission.user.id, user.id);
  const published = addReport(catalog, [], submission);
  assert.equal(published.reports.length, 10);
  assert.equal(new Set(published.reports.map((r) => r.evidence)).size, 1);
  assert.equal(contributorBadges(published.reports)[0].verificationCount, 10);
  assert.equal(addReport(published.data, published.reports, submission).changed, false);
});
test('batch publication accepts same-day contributions beyond ten and deduplicates individual reports', () => {
  const batch = createBatchReport(reports(3)),
    submission = issueSubmission(event(batch), catalog);
  const individual = canonicalReport({
    ...submission,
    report: submission.reports[0],
    evidence: 'https://github.com/staff-000/byokit/issues/41',
  });
  const published = addReport(catalog, [individual], submission);
  assert.equal(published.reports.length, 3);
  assert.equal(published.reports.find((r) => r.id === individual.id).evidence, individual.evidence);
  const existing = Array.from({ length: 8 }, (_, i) => ({
    ...individual,
    id: `website:123:prior-${i}`,
  }));
  const snapshot = JSON.stringify(catalog),
    previous = JSON.stringify(existing);
  const next = addReport(catalog, existing, submission);
  assert.equal(next.changed, true);
  assert.equal(next.reports.length, 11);
  assert.equal(addReport(next.data, next.reports, submission).changed, false);
  assert.equal(JSON.stringify(existing), previous);
  assert.equal(JSON.stringify(catalog), snapshot);
});
test('batch payloads reject duplicate IDs, duplicate offerings, unknown/private fields, stale and unsupported targets', () => {
  const entries = reports();
  assert.throws(() => createBatchReport([]));
  assert.throws(() => createBatchReport(reports(11)));
  assert.throws(() => createBatchReport([entries[0], entries[0]]));
  assert.throws(() =>
    createBatchReport([entries[0], { ...entries[1], offeringId: entries[0].offeringId }]),
  );
  assert.throws(() => createBatchReport([{ ...entries[0], apiKey: 'private' }]));
  const raw = issueBody(createBatchReport(entries));
  assert.throws(() => parseIssueReport(raw.replace('"common":{', '"common":{"apiKey":"private",')));
  assert.throws(() => parseIssueReport(raw.replace(/"batchId":"[^"]+",/, '')));
  assert.throws(() => parseIssueReport(raw + raw));
  assert.throws(() =>
    issueSubmission(
      event(createBatchReport([entries[0], { ...entries[1], offeringId: 'unknown/model' }])),
      catalog,
    ),
  );
  assert.throws(() =>
    issueSubmission(
      event(createBatchReport([entries[0], { ...entries[1], checkedAt: '2020-01-01T00:00:00Z' }])),
      catalog,
    ),
  );
});
test('publication status waits for every batch target without repeating inference', async () => {
  let records = [],
    calls = 0;
  const entries = reports(),
    targets = entries.map(({ operationId, offeringId }) => ({ operationId, offeringId }));
  const tracker = new PublicationTracker(
    () => {},
    async () => {
      calls++;
      return new Response(JSON.stringify({ reports: records }));
    },
  );
  records = [{ id: `website:123:${entries[0].operationId}`, offeringId: entries[0].offeringId }];
  assert.equal(await tracker.check(targets), null);
  records.push({ id: `website:123:${entries[1].operationId}`, offeringId: entries[1].offeringId });
  assert.equal((await tracker.check(targets)).length, 2);
  assert.equal(calls, 2);
  tracker.stop();
});

test('compact batch sharing preserves successful checks and sanitized issue categories', () => {
  const success = successAttempt(),
    quota = classifyVerificationError(
      { status: 429 },
      { body: { error: { type: 'insufficient_quota', message: 'private-account' } } },
    );
  const entries = reports(10).map((r, i) => ({
    ...r,
    assessment:
      i === 9
        ? { attempt: quota, checks: { textGeneration: 'blocked', speed: 'not_run' } }
        : {
            attempt: success,
            checks: { textGeneration: 'passed', speed: 'not_run' },
            phases: [{ phase: 'generation', attempt: success }],
          },
  }));
  const batch = createBatchReport(entries);
  assert.ok(issueUrl(batch).length < 7800);
  assert.deepEqual(parseIssueReport(issueBody(batch)), batch);
  assert.ok(!issueBody(batch).includes('private-account'));
  const published = addReport(catalog, [], issueSubmission(event(batch), catalog));
  assert.equal(published.reports.filter((r) => r.result === 'failed').length, 1);
  assert.equal(contributorBadges(published.reports)[0].verificationCount, 9);
});
