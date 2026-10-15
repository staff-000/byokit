import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Catalog, COMPLETE } from '../packages/core/index.js';
test('import preserves snapshot observation dates, has no per-provider cap, and cannot freshen an unobserved changed file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'byokit-observation-')),
    file = join(dir, 'upstream.json'),
    out = join(dir, 'out'),
    reports = join(dir, 'verifications.json');
  writeFileSync(reports, '[]');
  const ids = Object.keys(JSON.parse(readFileSync('catalog/overlays.json')).providers);
  const upstream = Object.fromEntries(ids.map((id) => [id, { name: id, models: {} }]));
  for (let i = 0; i < 30; i++)
    upstream.openai.models['model-' + i] = {
      id: 'model-' + i,
      name: 'Model ' + i,
      release_date: '2025-12-01',
      modalities: { input: ['text'], output: ['text'] },
      limit: { context: 8192, output: 1024 },
    };
  writeFileSync(file, JSON.stringify(upstream));
  const imported = (args = []) => {
    const run = spawnSync(
      'node',
      ['scripts/import-catalog.mjs', file, '--out', out, '--verifications', reports, ...args],
      { encoding: 'utf8' },
    );
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(readFileSync(join(out, 'catalog.json')));
  };
  const stamp = '2026-10-13T00:00:00Z';
  let data = imported(['--observed-at', stamp]);
  assert.equal(data.offerings[0].releaseDate, '2025-12-01');
  assert.equal(
    new Catalog(data).getModels(COMPLETE, { asOf: '2026-10-13T01:00:00Z', local: false }).length,
    30,
  );
  assert.ok(
    data.offerings
      .filter((o) => o.deployment === 'hosted')
      .every((o) => o.lifecycleEvidence.checkedAt === stamp),
  );
  data = imported();
  assert.equal(data.offerings[0].lifecycleEvidence.checkedAt, stamp);
  upstream.openai.models['model-0'].name = 'Changed';
  writeFileSync(file, JSON.stringify(upstream));
  data = imported();
  assert.ok(data.offerings.every((o) => !o.lifecycleEvidence));
  assert.deepEqual(new Catalog(data).getModels(COMPLETE, { local: false }), []);
});
