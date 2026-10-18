import { createHash } from 'node:crypto';
import { buildPlaygroundWorker } from './build-playground.mjs';
import { mkdir, cp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateVerifications } from '../packages/byokit/index.js';
import catalog from '../packages/byokit/catalog.js';
import { contributorBadges, contributorBadgeSvg } from '../website/contributor-badges.js';
const root = resolve(new URL('..', import.meta.url).pathname),
  out = resolve(root, 'dist/site');
await mkdir(out, { recursive: true });
await cp(resolve(root, 'website'), out, { recursive: true });
for (const file of [
  'inference.js',
  'verification-filters.js',
  'verification.js',
  'batch-verification.js',
  'verification-report.js',
  'contributor-badges.js',
  'attempt-display.js',
  'playground.js',
])
  await writeFile(
    resolve(out, file),
    (await readFile(resolve(root, 'website', file), 'utf8')).replaceAll(
      '../packages/byokit/',
      './lib/core/',
    ),
  );
await writeFile(
  resolve(out, 'playground-runtime.js'),
  'export const workerSource=' + JSON.stringify(await buildPlaygroundWorker()) + ';\n',
);
for (const file of ['verification-config.json', 'github-verification.js'])
  await rm(resolve(out, file), { force: true });
await mkdir(resolve(out, 'lib/core'), { recursive: true });
for (const file of [
  'index.js',
  'core.js',
  'enums.js',
  'catalog.js',
  'verification.js',
  'call.js',
  'connection.js',
  'sdk.js',
  'custom-model.js',
  'client.js',
])
  await cp(resolve(root, 'packages/byokit', file), resolve(out, 'lib/core', file));
await mkdir(resolve(out, 'assets'), { recursive: true });
for (const provider of catalog.providers) {
  try {
    await cp(
      resolve(root, 'assets', 'provider_' + provider.id + '.svg'),
      resolve(out, 'assets', provider.id + '.svg'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // New catalog providers need a local icon even before branded assets are reviewed.
    await writeFile(
      resolve(out, 'assets', provider.id + '.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="8" fill="#687582"/><path d="M10 11h12M10 16h12M10 21h8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>',
    );
  }
}
const reports = catalog.verifications || [],
  errors = validateVerifications(reports, catalog);
if (errors.length) throw new Error('Invalid contributor verification records');
await writeFile(resolve(out, 'verification.json'), JSON.stringify({ reports }, null, 2) + '\n');
const badges = contributorBadges(reports);
await rm(resolve(out, 'badges'), { recursive: true, force: true });
await mkdir(resolve(out, 'badges'), { recursive: true });
for (const badge of badges)
  await writeFile(resolve(out, badge.badgePath), contributorBadgeSvg(badge));
await writeFile(
  resolve(out, 'contributors.json'),
  JSON.stringify({ schemaVersion: 1, badges }, null, 2) + '\n',
);
let staging = [];
try {
  for (const file of await readdir(resolve(root, 'docs/verification-staging')))
    if (/^issue-\d+\.json$/.test(file))
      staging.push(
        JSON.parse(await readFile(resolve(root, 'docs/verification-staging', file), 'utf8')),
      );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await writeFile(
  resolve(out, 'verification-staging.json'),
  JSON.stringify({ receipts: staging }) + '\n',
);
await cp(resolve(root, 'THIRD_PARTY_NOTICES.md'), resolve(out, 'THIRD_PARTY_NOTICES.txt'));
await writeFile(resolve(out, '.nojekyll'), '');
console.log('Built static website: dist/site (GitHub Pages /byokit/ compatible)');

// A deployment must not mix cached app code with a different catalog/enum build.
// Keep static paths for Pages, but version entry assets and every relative ESM
// dependency together; inference and verification feeds remain unchanged.
async function sourceAssets(dir) {
  const result = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceAssets(file)));
    else if (/\.(js|css|html)$/.test(entry.name)) result.push(file);
  }
  return result;
}
const assetFiles = await sourceAssets(out),
  digest = createHash('sha256');
for (const file of assetFiles) {
  digest.update(file.slice(out.length));
  digest.update(await readFile(file));
}
const assetVersion = digest.digest('hex').slice(0, 16);
for (const file of assetFiles) {
  let source = await readFile(file, 'utf8');
  if (file.endsWith('.html'))
    source = source.replace(
      /((?:src|href)=["'])(\.\/[^"']+\.(?:js|css))(["'])/g,
      (_all, start, path, end) => start + path + '?v=' + assetVersion + end,
    );
  if (file.endsWith('.js'))
    source = source.replace(
      /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'\s]+\.js)\2/g,
      (_all, start, quote, path) => start + quote + path + '?v=' + assetVersion + quote,
    );
  await writeFile(file, source);
}
console.log('Versioned first-party website assets: ' + assetVersion);
