import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PublicationError,
  publicationFailureCode,
  publicationFailureNotice,
} from '../scripts/publication-errors.mjs';
import { issueSubmission } from '../scripts/verification-report.mjs';
import { issueBody } from '../website/verification-report.js';

test('publication diagnostics expose only reviewed categories, never raw exception details', () => {
  const secret = 'private-key-and-provider-error';
  for (const error of [new Error(secret), { code: secret }, new PublicationError(secret)]) {
    const code = publicationFailureCode(error);
    assert.equal(code, 'unknown');
    assert.ok(!publicationFailureNotice(code).includes(secret));
  }
  assert.equal(
    publicationFailureCode(new PublicationError('catalog_mismatch')),
    'catalog_mismatch',
  );
  const notice = publicationFailureNotice('catalog_mismatch');
  assert.match(notice, /protocol does not match/);
  assert.match(notice, /not a failed provider call/);
});

test('report validation distinguishes format, freshness, and catalog mismatch', () => {
  const catalog = JSON.parse(readFileSync('spec/fixtures/catalog.json'));
  const report = {
    schemaVersion: 1,
    operationId: '71e4f6ef-c19e-4d28-bdf6-10cb85fcaa08',
    offeringId: 'missing/model',
    modelId: 'model',
    protocol: 'chat',
    checkedAt: '2026-10-19T10:00:00.000Z',
    latencyMs: 200,
    maxTokens: 128,
  };
  const event = {
    action: 'opened',
    repository: { full_name: 'staff-000/byokit' },
    issue: {
      number: 1,
      user: { id: 123, login: 'contributor' },
      created_at: report.checkedAt,
      body: issueBody(report),
    },
  };
  assert.throws(() => issueSubmission(event, catalog), { code: 'catalog_mismatch' });
  assert.throws(
    () =>
      issueSubmission(
        {
          ...event,
          issue: { ...event.issue, body: '<!-- byokit-verification:v1 -->\n```json\ninvalid\n```' },
        },
        catalog,
      ),
    { code: 'report_format' },
  );
  assert.throws(
    () =>
      issueSubmission(
        { ...event, issue: { ...event.issue, created_at: '2026-10-21T10:00:00Z' } },
        catalog,
      ),
    { code: 'report_freshness' },
  );
});

test('failure notification uses the workflow category without fetching the public feed or provider', () => {
  const dir = mkdtempSync(join(tmpdir(), 'byokit-publication-'));
  try {
    const eventPath = join(dir, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({
        repository: { full_name: 'staff-000/byokit' },
        issue: { number: 42, body: '<!-- byokit-verification:v1 -->' },
      }),
    );
    const script = `
      import assert from 'node:assert/strict';
      let calls = 0;
      globalThis.fetch = async (url, options) => {
        calls++;
        assert.equal(url, 'https://api.github.com/repos/staff-000/byokit/issues/42/comments');
        assert.equal(options.method, 'POST');
        const {body} = JSON.parse(options.body);
        assert.match(body, /protocol does not match/);
        assert.match(body, /submit a corrected report/);
        assert.ok(!body.includes('dummy-private-key'));
        return new Response('{}');
      };
      await import('./scripts/finish-verification.mjs');
      assert.equal(calls, 1);
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_RUN_ID: '123',
        RECORD_RESULT: 'failure',
        PUBLICATION_FAILURE: 'catalog_mismatch',
        GH_TOKEN: 'dummy-private-key',
      },
    });
    const workflow = readFileSync('.github/workflows/verification.yml', 'utf8');
    assert.match(workflow, /failure: \$\{\{ steps\.record\.outputs\.failure \}\}/);
    assert.match(workflow, /PUBLICATION_FAILURE: \$\{\{ needs\.record\.outputs\.failure \}\}/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
