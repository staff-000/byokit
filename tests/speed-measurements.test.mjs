import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measurementSummary,
  speedAdapter,
  SPEED_BENCHMARK,
  SPEED_PROMPT,
  SPEED_MAX_TOKENS,
} from '../website/speed-measurements.js';
import { verifyInference, successRecord } from '../website/inference.js';
import { createReport, parseIssueReport, issueBody } from '../website/verification-report.js';
import { canonicalReport } from '../scripts/verification-report.mjs';
const now = Date.parse('2026-10-18T12:00:00Z');
const sample = (id, speed, extra = {}) => ({
  id: `website:123:${id}`,
  offeringId: 'deepseek/test',
  contributor: 'github:someone',
  checkedAt: '2026-10-17T12:00:00Z',
  result: 'passed',
  checks: ['textGeneration'],
  adapter: speedAdapter('chat'),
  tokensPerSecond: speed,
  ...extra,
});
test('speed summaries use only comparable recent successful offering/protocol measurements', () => {
  const first = sample('one', 20);
  const reports = [
    first,
    first,
    sample('two', 40),
    sample('three', 60),
    sample('legacy', 900, { adapter: 'byokit-website@1' }),
    sample('old', 900, { checkedAt: '2026-08-01T00:00:00Z' }),
    sample('other', 900, { offeringId: 'reseller/test' }),
    sample('protocol', 900, { adapter: speedAdapter('anthropic') }),
    sample('failed', 900, { result: 'failed' }),
    sample('local', 900, { scope: 'this-browser' }),
    sample('future', 900, { checkedAt: '2026-10-19T00:00:00Z' }),
    sample('staging', 900, { staging: true }),
    sample('nan', NaN),
  ];
  const summary = measurementSummary(reports, 'deepseek/test', 'chat', now);
  assert.equal(summary.samples, 3);
  assert.equal(summary.median, 40);
  assert.equal(summary.p25, 30);
  assert.equal(summary.p75, 50);
  assert.equal(summary.contributors, 1);
  assert.equal(summary.speedContributors, 1);
  assert.ok(summary.checks > summary.samples);
});
test('coverage recognizes identities without inflating counts for renamed or anonymous users', () => {
  const summary = measurementSummary(
    [
      sample('one', 20),
      sample('two', 40, { contributor: 'github:renamed' }),
      sample('three', 60, { id: 'website:456:three', contributor: 'github:second' }),
      sample('unknown', 70, { id: 'external:unknown', contributor: undefined }),
    ],
    'deepseek/test',
    'chat',
    now,
  );
  assert.equal(summary.contributors, 2);
  assert.equal(summary.samples, 4);
});
test('coverage asks for fresh, larger, and more consistent speed samples', () => {
  assert.match(measurementSummary([], 'deepseek/test', 'chat', now).nudge, /Be the first/);
  assert.match(
    measurementSummary([sample('one', 20)], 'deepseek/test', 'chat', now).nudge,
    /Only 1/,
  );
  assert.match(
    measurementSummary(
      [10, 20, 100, 200, 300].map((n, i) => sample(String(i), n)),
      'deepseek/test',
      'chat',
      now,
    ).nudge,
    /Results vary/,
  );
  assert.match(
    measurementSummary(
      [1, 2, 3, 4, 5].map((n) => sample(String(n), 50, { checkedAt: '2026-10-09T00:00:00Z' })),
      'deepseek/test',
      'chat',
      now,
    ).nudge,
    /this week/,
  );
});
test('standard benchmark roundtrips through safe local records and published evidence', async (t) => {
  let clock = 1000,
    requests = 0;
  t.mock.method(Date, 'now', () => clock);
  const settings = {
    offeringId: 'deepseek/test',
    modelId: 'test',
    providerId: 'deepseek',
    protocol: 'chat',
    prompt: SPEED_PROMPT,
    maxTokens: SPEED_MAX_TOKENS,
  };
  const result = await verifyInference(settings, 'private-key', {
    benchmarkSpeed: true,
    fetch: async () => {
      requests++;
      clock += requests === 1 ? 100 : 1000;
      return {
        ok: true,
        json: async () => ({
          model: 'test',
          choices: [{ message: { content: '1 2 3' } }],
          usage: { completion_tokens: requests === 1 ? 1 : 51 },
        }),
      };
    },
  });
  assert.equal(requests, 2);
  assert.equal(result.benchmark, SPEED_BENCHMARK);
  assert.equal(result.tokensPerSecond, 55.6);
  assert.equal(
    result.timeToFirstTokenMs,
    undefined,
    'baseline overhead is not actual streaming TTFT',
  );
  const record = successRecord(settings, result, 'private-key');
  assert.equal(record.adapter, speedAdapter('chat'));
  const report = createReport(settings, result, record.id, 'private-key');
  assert.equal(parseIssueReport(issueBody(report)).benchmark, SPEED_BENCHMARK);
  const published = canonicalReport({
    report,
    user: { id: 123, login: 'someone' },
    evidence: 'https://github.com/staff-000/byokit/issues/1',
    createdAt: result.checkedAt,
  });
  assert.equal(published.adapter, speedAdapter('chat'));
  assert.ok(!JSON.stringify(published).includes(SPEED_PROMPT));
  assert.ok(!JSON.stringify(published).includes('private-key'));
  assert.equal(
    createReport({ ...settings, prompt: 'custom' }, result, record.id).benchmark,
    undefined,
  );
  assert.throws(() => parseIssueReport(issueBody({ ...report, benchmark: 'unknown-version' })));
});
test('estimated token counts never enter the standard benchmark cohort', async (t) => {
  let clock = 1000;
  t.mock.method(Date, 'now', () => clock);
  const result = await verifyInference(
    {
      offeringId: 'deepseek/test',
      modelId: 'test',
      providerId: 'deepseek',
      protocol: 'chat',
      prompt: SPEED_PROMPT,
      maxTokens: 128,
    },
    'private-key',
    {
      benchmarkSpeed: true,
      fetch: async () => {
        clock += 100;
        return { ok: true, json: async () => ({ choices: [{ message: { content: '1 2 3' } }] }) };
      },
    },
  );
  assert.equal(result.benchmark, undefined);
});
