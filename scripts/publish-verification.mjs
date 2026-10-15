import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { issueSubmission, canonicalReport } from './verification-report.mjs';
import { validateCatalog, validateVerifications } from '../packages/core/index.js';
export function addReport(data, reports, submission) {
  const record = canonicalReport(submission);
  if (reports.some((r) => r.id === record.id || r.evidence === record.evidence))
    return { changed: false, data, reports, record };
  const userPrefix = `website:${submission.user.id}:`,
    submitted = Date.parse(submission.createdAt);
  if (
    reports.filter(
      (r) =>
        r.id.startsWith(userPrefix) &&
        Math.abs(submitted - Date.parse(r.notes?.match(/submitted ([^;]+);/)?.[1] || r.checkedAt)) <
          86400000,
    ).length >= 10
  )
    throw new Error('Daily publication limit reached.');
  const next = [...reports, record].sort(
      (a, b) => a.checkedAt.localeCompare(b.checkedAt) || a.id.localeCompare(b.id),
    ),
    catalog = { ...data, verifications: next };
  if (validateVerifications(next, catalog).length || validateCatalog(catalog).length)
    throw new Error('Invalid resulting catalog.');
  return { changed: true, data: catalog, reports: next, record };
}
const git = (args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('Repository operation failed.');
  return r.stdout.trim();
};
async function output(values) {
  await writeFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(''),
    { flag: 'a' },
  );
}
async function run() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  for (let attempt = 0; attempt < 4; attempt++) {
    // Reset only the isolated Actions checkout. Never run this entry point in a developer worktree.
    if (process.env.GITHUB_ACTIONS !== 'true')
      throw new Error('Publication entry point requires GitHub Actions.');
    git(['fetch', 'origin', 'main']);
    git(['reset', '--hard', 'origin/main']);
    const data = JSON.parse(await readFile('catalog/catalog.json', 'utf8')),
      reports = JSON.parse(await readFile('catalog/verifications.json', 'utf8')),
      submission = issueSubmission(event, data);
    if (!submission) {
      await output({ recognized: false, changed: false });
      return;
    }
    await output({
      recognized: true,
      issue: submission.issueNumber,
      operation: submission.report.operationId,
      staging: !!submission.report.staging,
    });
    let paths;
    if (submission.report.staging) {
      const path = `docs/verification-staging/issue-${submission.issueNumber}.json`;
      let exists = false;
      try {
        await readFile(path);
        exists = true;
      } catch {}
      if (exists) {
        await output({ changed: false, ref: git(['rev-parse', 'HEAD']) });
        return;
      }
      await mkdir('docs/verification-staging', { recursive: true });
      await writeFile(
        path,
        JSON.stringify(
          {
            schemaVersion: 1,
            status: 'pipeline-fixture',
            operationId: submission.report.operationId,
            issue: submission.evidence,
            contributor: `github:${submission.user.login}`,
            checkedAt: submission.report.checkedAt,
          },
          null,
          2,
        ) + '\n',
      );
      paths = [path];
    } else {
      const next = addReport(data, reports, submission);
      if (!next.changed) {
        await output({ changed: false, ref: git(['rev-parse', 'HEAD']) });
        return;
      }
      await writeFile('catalog/verifications.json', JSON.stringify(next.reports, null, 2) + '\n');
      await writeFile('catalog/catalog.json', JSON.stringify(next.data, null, 2) + '\n');
      await writeFile(
        'packages/python/src/byokit/data/catalog.json',
        JSON.stringify(next.data) + '\n',
      );
      await writeFile(
        'packages/core/catalog.js',
        'import {Catalog} from "./index.js";\nconst data=' +
          JSON.stringify(next.data) +
          ';\nexport default data;\nexport * from "./index.js";\nexport function getModels(input={},options){return new Catalog(data).getModels(input,options)}\n',
      );
      const lock = JSON.parse(await readFile('catalog/catalog.lock.json', 'utf8'));
      lock.verificationsSha256 = createHash('sha256')
        .update(JSON.stringify(next.reports))
        .digest('hex');
      await writeFile('catalog/catalog.lock.json', JSON.stringify(lock, null, 2) + '\n');
      paths = [
        'catalog/verifications.json',
        'catalog/catalog.json',
        'catalog/catalog.lock.json',
        'packages/core/catalog.js',
        'packages/python/src/byokit/data/catalog.json',
      ];
    }
    git(['config', 'user.name', 'byokit verification bot']);
    git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    git(['add', ...paths]);
    git([
      'commit',
      '-m',
      submission.report.staging
        ? 'Record verification pipeline staging receipt'
        : 'Record GitHub community model verification',
    ]);
    const push = spawnSync('git', ['push', 'origin', 'HEAD:main'], { encoding: 'utf8' });
    if (push.status === 0) {
      await output({ changed: true, ref: git(['rev-parse', 'HEAD']) });
      return;
    }
  }
  throw new Error(
    'Publication could not push after concurrent-update retries. Rerun this workflow.',
  );
}
if (process.argv[1]?.endsWith('publish-verification.mjs'))
  run().catch(async (_error) => {
    await output({ failed: true });
    console.error(
      'Verification publication failed. Check report fields, catalog match, 24-hour freshness, daily limit, and repository permissions. No report payload is logged.',
    );
    process.exitCode = 1;
  });
