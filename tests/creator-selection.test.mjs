import { pythonModels } from './python-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Catalog, compactModels } from '../packages/byokit/index.js';
const data = JSON.parse(
  readFileSync(new URL('../spec/fixtures/creator-selection.json', import.meta.url)),
);
test('creator selection retains newest canonical models on every provider', () => {
  const c = new Catalog(data);
  const config = {
    providerIds: ['openai', 'openrouter'],
    creatorIds: ['openai'],
    dedupe: 2,
    local: false,
  };
  const rows = c.getModels(config);
  assert.equal(rows.length, 4);
  assert.deepEqual([...new Set(rows.map((x) => x.modelId))].sort(), [
    'openai/test-1',
    'openai/test-2',
  ]);
  assert.ok(rows.every((x) => x.creatorId === 'openai' && x.model.creatorId === x.creatorId));
  assert.ok(compactModels(rows).every((x) => x.creatorId === 'openai'));
  assert.equal(c.getModels({ ...config, creatorIds: ['missing'] }).length, 0);
  assert.equal(c.getModels({ ...config, creatorIds: { exclude: ['openai'] } }).length, 0);
  assert.equal(c.getModels({ ...config, dedupe: false, filters: { dedupe: 1 } }).length, 6);
  assert.deepEqual(
    c
      .getModels({ ...config, providerIds: ['openrouter', 'openai'] })
      .map((x) => x.id)
      .sort(),
    rows.map((x) => x.id).sort(),
  );
});

test('unknown creators, dates, exclusions and Python parity', () => {
  const d = structuredClone(data);
  d.models[0].creatorId = null;
  d.models[1].releaseDate = null;
  d.models[2].releaseDate = null;
  const queries = [
    { providerIds: ['openai', 'openrouter'], dedupe: 1, local: false },
    {
      providerIds: ['openai', 'openrouter'],
      creatorIds: { exclude: ['other'] },
      dedupe: 1,
      local: false,
    },
    { providerIds: ['openai'], creatorIds: ['openai'], dedupe: true, local: false },
    {
      providerIds: ['local'],
      creatorIds: ['openai'],
      local: [{ endpoint: 'http://localhost:11434', modelId: 'test', creatorId: 'openai' }],
    },
  ];
  d.providers.push({ id: 'local', name: 'Local', deployment: 'local', auth: 'optional' });
  const c = new Catalog(d);
  const rows = queries.map((q) => c.getModels(q));
  assert.equal(rows[0].length, 4);
  assert.equal(rows[1].length, 2);
  assert.equal(rows[2][0].modelId, 'openai/test-1');
  assert.equal(rows[3][0].creatorId, 'openai');
  const py = pythonModels({ data: d, queries });
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(JSON.parse(py.stdout), rows);
});
