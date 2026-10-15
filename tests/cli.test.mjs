import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
test('CLI passes a valid budget and fails an excessive budget before requests', async () => {
  const good = spawnSync(
    'node',
    ['packages/byokit/bin.mjs', 'check', 'examples/task.config.json', '--strict'],
    { encoding: 'utf8' },
  );
  assert.equal(good.status, 0, good.stdout + good.stderr);
  const dir = mkdtempSync(join(tmpdir(), 'byokit-'));
  const file = join(dir, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      catalog: resolve('spec/fixtures/catalog.json'),
      tasks: [
        { offeringIds: ['test/small'], budget: { maxInputTokens: 9000, maxOutputTokens: 1000 } },
      ],
    }),
  );
  const bad = spawnSync('node', ['packages/byokit/bin.mjs', 'check', file], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /CONTEXT_BUDGET_EXCEEDED/);
  const built = spawnSync(
    'node',
    [
      'packages/byokit/bin.mjs',
      'build',
      'examples/byok.config.json',
      '--out',
      join(dir, 'catalog.json'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(built.status, 0, built.stderr);
  assert.ok(JSON.parse(readFileSync(join(dir, 'catalog.json'))).providers.length <= 8);
  assert.match(
    readFileSync(join(dir, 'catalog.json.ids.d.ts'), 'utf8'),
    /export declare enum OfferingId/,
  );
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  const runtime = await import(pathToFileURL(join(dir, 'catalog.json.ids.js')).href);
  const id = Object.values(runtime.OfferingId)[0];
  assert.ok(id);
  writeFileSync(
    join(dir, 'enum-types.ts'),
    `import {OfferingId} from './catalog.json.ids.js';\nconst good:OfferingId=OfferingId[${JSON.stringify(id)}];\n// @ts-expect-error raw model strings must be rejected\nconst bad:OfferingId=${JSON.stringify(id)};\n// @ts-expect-error missing catalog member\nOfferingId['missing/model'];\n`,
  );
  const checked = spawnSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      join(dir, 'enum-types.ts'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
});

test('undeclared budgets warn; strict validation fails without performing inference', () => {
  const dir = mkdtempSync(join(tmpdir(), 'byokit-budget-')),
    file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ catalog: resolve('spec/fixtures/catalog.json') }));
  const warning = spawnSync('node', ['packages/byokit/bin.mjs', 'check', file], {
    encoding: 'utf8',
  });
  assert.equal(warning.status, 0);
  assert.match(warning.stdout, /BUDGET_UNDECLARED/);
  const strict = spawnSync('node', ['packages/byokit/bin.mjs', 'check', file, '--strict'], {
    encoding: 'utf8',
  });
  assert.equal(strict.status, 1);
});
