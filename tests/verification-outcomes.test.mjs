import Ajv from 'ajv';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  classifyVerificationError,
  communityAssessment,
  validAssessment,
  shouldStopProvider,
  successAttempt,
} from '../packages/byokit/verification.js';
import { verificationSummary, validateVerifications } from '../packages/byokit/index.js';
import { verifyInference, successRecord } from '../website/inference.js';
import { createReport, issueBody, parseIssueReport } from '../website/verification-report.js';
import { canonicalReport } from '../scripts/verification-report.mjs';
import { runBatch } from '../website/batch-verification.js';
const fixtures = JSON.parse(readFileSync('spec/fixtures/verification-outcomes.json'));
const settings = {
  offeringId: 'deepseek/test',
  providerId: 'deepseek',
  modelId: 'test',
  protocol: 'chat',
  prompt: 'test',
  maxTokens: 128,
};
const now = Date.parse('2026-10-18T12:00:00Z');
const failure = (input) => {
  const attempt = classifyVerificationError(input);
  return {
    attempt,
    checks: {
      textGeneration: attempt.outcome === 'blocked' ? 'blocked' : 'inconclusive',
      speed: 'not_run',
    },
  };
};
const report = (id, assessment, extra = {}) => ({
  id,
  offeringId: 'deepseek/test',
  contributor: 'github:someone',
  checkedAt: '2026-10-18T10:00:00Z',
  checks: ['textGeneration'],
  result: assessment.attempt.outcome === 'succeeded' ? 'passed' : 'failed',
  assessment,
  adapter: 'test',
  evidence: 'https://github.com/staff-000/byokit/issues/1',
  ...extra,
});
test('reviewed classifications use structured details and preserve uncertainty', () => {
  for (const f of fixtures) {
    const actual = classifyVerificationError(f.error, f.options);
    for (const [k, v] of Object.entries(f.expected))
      assert.deepEqual(actual[k], v, f.name + ' ' + k);
    assert.ok(!JSON.stringify(actual).includes('private'), f.name);
    assert.ok(!JSON.stringify(actual).includes('secret-name'), f.name);
  }
  assert.equal(
    classifyVerificationError({ status: 429 }, { retryAfter: '12' }).retry.afterSeconds,
    12,
  );
  assert.equal(
    classifyVerificationError({ status: 429 }, { retryAfter: 'Sun, 18 Oct 2026 12:01:00 GMT', now })
      .retry.afterSeconds,
    60,
  );
});
test('JavaScript and Python produce identical classifications and community assessments', () => {
  const records = [
    report('success', {
      attempt: successAttempt(),
      checks: { textGeneration: 'passed', speed: 'not_run' },
    }),
    report('quota', failure({ status: 402 })),
  ];
  // Private browser observations do not identify a community contributor.
  const anonymous = { ...records[0], id: 'browser-observation' };
  delete anonymous.contributor;
  records.push(anonymous);
  const emptyContributor = { ...anonymous, id: 'empty-contributor', contributor: '' };
  records.push(emptyContributor);
  const input = { fixtures, records, now };
  const py = spawnSync(
    'python3',
    [
      '-c',
      `import sys,json\nsys.path.insert(0,'packages/python/src')\nfrom byokit.verification import classify_verification_error,community_assessment\nv=json.load(sys.stdin)\nprint(json.dumps({'attempts':[classify_verification_error(f['error'],body=f['options'].get('body'),retry_after=f['options'].get('retryAfter'),now=f['options']['now']) for f in v['fixtures']],'community':community_assessment(v['records'],now=v['now']/1000)}))`,
    ],
    { input: JSON.stringify(input), encoding: 'utf8' },
  );
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(JSON.parse(py.stdout), {
    attempts: fixtures.map((f) => classifyVerificationError(f.error, f.options)),
    community: communityAssessment(records, { now }),
  });
  assert.equal(
    communityAssessment([anonymous, emptyContributor], { now }).successfulContributors,
    0,
  );
  assert.equal(communityAssessment(records, { now }).successfulContributors, 1);
  const filtered = verificationSummary({ verifications: records }, 'deepseek/test', {
    asOf: new Date(now).toISOString(),
    contributor: 'GITHUB:SOMEONE',
  });
  assert.equal(filtered.records.length, 2);
});
test('fresh successes survive issues; stale and future observations stay separate', () => {
  const records = [
    report('old-success', {
      attempt: successAttempt(),
      checks: { textGeneration: 'passed', speed: 'not_run' },
    }),
    report('quota', failure({ status: 402 }), { checkedAt: '2026-10-18T11:00:00Z' }),
  ];
  const summary = verificationSummary({ verifications: records }, 'deepseek/test', {
    asOf: new Date(now).toISOString(),
  });
  assert.equal(summary.community.status, 'verified');
  assert.equal(summary.community.recentIssues.quota_exhausted, 1);
  assert.equal(summary.latest.id, 'old-success');
  assert.equal(communityAssessment([records[1]], { now }).status, 'issues_reported');
  assert.equal(communityAssessment([records[0]], { now: now + 91 * 86400000 }).status, 'stale');
  assert.equal(communityAssessment(records, { now: now - 86400000 }).status, 'unverified');
  assert.equal(
    communityAssessment([{ ...records[1], assessment: undefined }], { now }).recentIssues.unknown,
    1,
  );
});
test('baseline success is preserved when generation is quota blocked, with no speed value', async () => {
  let calls = 0;
  const result = await verifyInference(settings, 'private-key', {
    benchmarkSpeed: true,
    fetch: async () => {
      calls++;
      return calls === 1
        ? new Response(
            JSON.stringify({
              choices: [{ message: { content: 'OK' } }],
              usage: { completion_tokens: 1 },
            }),
          )
        : new Response(
            JSON.stringify({ error: { type: 'insufficient_quota', message: 'private-key' } }),
            { status: 429, headers: { 'Retry-After': '30' } },
          );
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.assessment.attempt.outcome, 'partial');
  assert.equal(result.assessment.checks.textGeneration, 'passed');
  assert.equal(result.assessment.checks.speed, 'blocked');
  assert.equal(result.tokensPerSecond, undefined);
  assert.equal(result.assessment.phases.length, 2);
  assert.ok(validAssessment(result.assessment));
  const record = successRecord(settings, result, 'private-key');
  const shared = parseIssueReport(
    issueBody(createReport(settings, result, record.id, 'private-key')),
  );
  const canonical = canonicalReport({
    report: shared,
    user: { id: 1, login: 'someone' },
    evidence: 'https://github.com/staff-000/byokit/issues/1',
    createdAt: result.checkedAt,
  });
  const schema = JSON.parse(readFileSync('catalog/catalog.schema.json'));
  const validate = new Ajv({ strict: false }).compile(schema.properties.verifications);
  assert.equal(validate([canonical]), true, JSON.stringify(validate.errors));
  assert.equal(validate([{ ...canonical, tokensPerSecond: 0 }]), false);
  assert.equal(canonical.result, 'failed');
  assert.equal(canonical.assessment.checks.textGeneration, 'passed');
  assert.ok(!JSON.stringify(canonical).includes('private-key'));
  assert.equal(communityAssessment([canonical]).status, 'verified');
});
test('provider failure categories and retry delays survive calls without retaining raw data', async () => {
  await assert.rejects(
    verifyInference(settings, 'private-key', {
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: { type: 'rate_limit_error', message: 'private-key account-ID' },
          }),
          { status: 429, headers: { 'Retry-After': '5' } },
        ),
    }),
    (e) =>
      e.status === 429 &&
      e.attempt.reason === 'rate_limited' &&
      e.attempt.retry.afterSeconds === 5 &&
      !JSON.stringify(e).includes('private-key'),
  );
  await assert.rejects(
    verifyInference(settings, 'key', {
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'content_filter', message: { content: null } }],
          }),
        ),
    }),
    (e) => e.attempt.reason === 'policy_restricted',
  );
});
test('model scoped blocks do not stop sibling models, while shared limits skip unsent requests', async () => {
  const jobs = [0, 1].map((n) => ({ ...settings, offeringId: 'deepseek/test-' + n }));
  for (const scope of ['model', 'account']) {
    let calls = 0;
    const entries = await runBatch(jobs, 'key', {
      verify: async () => {
        calls++;
        const e = new Error('safe');
        e.attempt = { ...classifyVerificationError({ status: 403 }), scope };
        throw e;
      },
    });
    assert.equal(calls, scope === 'model' ? 2 : 1);
    if (scope === 'account') assert.equal(entries[1].assessment.attempt.outcome, 'skipped');
  }
  assert.equal(shouldStopProvider(classifyVerificationError({ status: 429 })), true);
});
test('unsafe metadata and speed values attached to incomplete checks are rejected', () => {
  const r = report('bad', failure({ status: 402 }), { tokensPerSecond: 0 });
  assert.ok(validateVerifications([r], { offerings: [{ id: 'deepseek/test' }] }).length);
  const unsafe = structuredClone(r.assessment);
  unsafe.attempt.rawBody = 'private-key';
  assert.equal(validAssessment(unsafe), false);
});

test('canceled phases do not become community failures and explicit provider details override fallbacks', () => {
  const canceled = classifyVerificationError({ code: 'CANCELED' });
  const observation = report('partial-canceled', {
    attempt: { ...canceled, outcome: 'partial' },
    checks: { textGeneration: 'passed', speed: 'not_run' },
    phases: [
      { phase: 'baseline', attempt: successAttempt() },
      { phase: 'generation', attempt: canceled },
    ],
  });
  const summary = communityAssessment([observation], { now });
  assert.equal(summary.status, 'verified');
  assert.deepEqual(summary.recentIssues, {});
  const generic = classifyVerificationError({ status: 429 });
  assert.equal(
    classifyVerificationError(
      { status: 429, attempt: generic },
      { body: { error: { type: 'insufficient_quota' } } },
    ).reason,
    'quota_exhausted',
  );
});
