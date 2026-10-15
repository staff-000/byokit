import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createReport,
  issueUrl,
  issueBody,
  parseIssueReport,
  PublicationTracker,
} from '../website/verification-report.js';
import { issueSubmission, canonicalReport } from '../scripts/verification-report.mjs';
import { addReport } from '../scripts/publish-verification.mjs';
import { verificationSummary } from '../packages/byokit/index.js';
const catalog = JSON.parse(readFileSync('spec/fixtures/catalog.json'));
catalog.providers.push({
  id: 'deepseek',
  name: 'DeepSeek',
  auth: 'required',
  deployment: 'hosted',
});
catalog.offerings.push({
  ...catalog.offerings[0],
  id: 'deepseek/test',
  providerId: 'deepseek',
  apiModelId: 'test',
  deployment: 'hosted',
});
const time = '2026-10-14T12:00:00.000Z',
  user = { id: 123, login: 'contributor' };
const report = () => ({
  schemaVersion: 1,
  operationId: '71e4f6ef-c19e-4d28-bdf6-10cb85fcaa08',
  offeringId: 'deepseek/test',
  modelId: 'test',
  protocol: 'chat',
  checkedAt: time,
  latencyMs: 200,
  maxTokens: 256,
});
const event = (r = report(), overrides = {}) => ({
  action: 'opened',
  repository: { full_name: 'staff-000/byokit' },
  issue: { number: 42, user, created_at: time, body: issueBody(r), ...overrides },
});
test('sharing whitelists public settings and roundtrips a prefilled GitHub issue', () => {
  const input = report(),
    r = createReport(
      { ...input, apiKey: 'dummy-key', prompt: 'private-prompt' },
      { ...input, text: 'private-output' },
      input.operationId,
      'dummy-key',
    );
  const url = new URL(issueUrl(r));
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/staff-000/byokit/issues/new');
  assert.deepEqual(parseIssueReport(url.searchParams.get('body')), input);
  for (const secret of ['dummy-key', 'private-prompt', 'private-output', 'Authorization'])
    assert.ok(!decodeURIComponent(url.href).includes(secret));
  assert.throws(() =>
    createReport({ ...input, modelId: 'dummy-key' }, input, input.operationId, 'dummy-key'),
  );
});
test('ordinary issues are ignored; unknown fields and ambiguous or oversized input are rejected', () => {
  assert.equal(issueSubmission(event(report(), { body: 'ordinary issue' }), catalog), null);
  for (const extra of ['apiKey', 'prompt', 'contributor', 'endpoint'])
    assert.throws(() =>
      issueSubmission(
        event(report(), {
          body: issueBody(report()).replace(
            '"schemaVersion": 1',
            `"${extra}": "private", "schemaVersion": 1`,
          ),
        }),
        catalog,
      ),
    );
  assert.throws(() => parseIssueReport(issueBody(report()) + issueBody(report())));
  assert.throws(() => parseIssueReport(issueBody(report()) + 'x'.repeat(6000)));
  assert.equal(
    issueSubmission({ ...event(), repository: { full_name: 'attacker/repo' } }, catalog),
    null,
  );
  assert.equal(issueSubmission(event(report(), { pull_request: {} }), catalog), null);
});
test('author identity and evidence come only from GitHub metadata; protocol and offering must match', () => {
  const submission = issueSubmission(event(), catalog),
    r = canonicalReport(submission);
  assert.equal(r.contributor, 'github:contributor');
  assert.equal(r.id, `website:123:${report().operationId}`);
  assert.equal(r.evidence, 'https://github.com/staff-000/byokit/issues/42');
  for (const changes of [
    { modelId: 'custom' },
    { offeringId: 'unknown/test' },
    { protocol: 'anthropic' },
  ])
    assert.throws(() => issueSubmission(event({ ...report(), ...changes }), catalog));
  assert.throws(() =>
    issueSubmission(event(report(), { user: { id: 1, login: '$(shell)' } }), catalog),
  );
});
test('freshness uses issue creation time, not workflow execution time', () => {
  assert.ok(issueSubmission(event(report(), { created_at: '2026-10-15T12:00:00.000Z' }), catalog));
  assert.throws(() =>
    issueSubmission(event(report(), { created_at: '2026-10-15T12:00:00.001Z' }), catalog),
  );
  assert.throws(() =>
    issueSubmission(event(report(), { created_at: '2026-10-14T11:58:00.000Z' }), catalog),
  );
});
test('deduplication, numeric contributor limits, and concurrent rereads preserve records and lifecycle', () => {
  const submission = issueSubmission(event(), catalog),
    first = addReport(catalog, [], submission);
  assert.equal(first.reports.length, 1);
  assert.equal(addReport(first.data, first.reports, submission).changed, false);
  const another = {
    ...submission,
    report: { ...submission.report, operationId: '71e4f6ef-c19e-4d28-bdf6-10cb85fcaa09' },
  };
  assert.equal(addReport(first.data, first.reports, another).changed, false);
  let state = { data: catalog, reports: [] };
  for (let n = 0; n < 10; n++) {
    const e = event(
      { ...report(), operationId: `71e4f6ef-c19e-4d28-bdf6-${String(n).padStart(12, '0')}` },
      { number: 100 + n, user: { ...user, login: n % 2 ? 'renamed-user' : 'contributor' } },
    );
    state = addReport(state.data, state.reports, issueSubmission(e, catalog));
  }
  assert.equal(state.reports.length, 10);
  assert.throws(
    () =>
      addReport(
        state.data,
        state.reports,
        issueSubmission(event(report(), { number: 999 }), catalog),
      ),
    /Daily/,
  );
  assert.deepEqual(first.data.offerings, catalog.offerings);
  assert.equal(catalog.verifications?.length ?? 0, 0);
  assert.equal(verificationSummary(first.data, 'deepseek/test', { asOf: time }).status, 'passed');
  assert.equal(
    verificationSummary(first.data, catalog.offerings[0].id, { asOf: time }).status,
    'unverified',
  );
  assert.equal(
    verificationSummary(first.data, 'deepseek/test', { asOf: '2027-02-01T00:00:00Z' }).status,
    'stale',
  );
});
test('staging fixtures require repository owner and cannot be treated as production calls', () => {
  assert.throws(() => issueSubmission(event({ ...report(), staging: true }), catalog));
  const submission = issueSubmission(
    event({ ...report(), staging: true }, { user: { id: 1, login: 'staff-000' } }),
    catalog,
  );
  assert.equal(submission.report.staging, true);
  assert.throws(() => addReport(catalog, [], submission), /fixtures/);
});
test('publication checks never repeat inference and discard late feed responses', async () => {
  let resolve,
    updates = 0;
  const tracker = new PublicationTracker(
    () => updates++,
    () => new Promise((r) => (resolve = r)),
  );
  const pending = tracker.check(report().operationId);
  tracker.stop();
  resolve(new Response('{"reports":[]}'));
  assert.equal(await pending, null);
  assert.equal(updates, 0);
  const published = canonicalReport(issueSubmission(event(), catalog));
  const ready = new PublicationTracker(
    () => updates++,
    async () => new Response(JSON.stringify({ reports: [published] })),
  );
  assert.deepEqual(await ready.check(report().operationId), published);
  assert.equal(updates, 1);
  assert.equal(await ready.check(report().operationId, 'another/provider-model'), null);
  const missing = new PublicationTracker(
    () => {},
    async () => new Response('{"reports":[]}'),
  );
  assert.equal(await missing.check(report().operationId), null);
  missing.stop();
});
