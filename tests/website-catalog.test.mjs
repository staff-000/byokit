import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as byokit from '../packages/byokit/catalog.js';
import { filterModels } from '../website/verification-filters.js';
test('verification table defaults to callable models and can show the full hosted catalog', () => {
  const expected = byokit.getModels(byokit.COMPLETE, {
    local: false,
    sort: byokit.ModelSort.ProviderOrder,
    filters: { callable: true },
  });
  const actual = filterModels({ includeOutdated: true }).filter((m) => !m.local);
  assert.ok(actual.length > 0);
  assert.ok(filterModels().every((m) => !m.local && m.callSupport.textGeneration));
  assert.deepEqual(filterModels({ provider: '302ai', includeOutdated: true }), []);
  const all = filterModels({ callableOnly: false, includeOutdated: true });
  assert.deepEqual(
    all.map((m) => m.id),
    byokit
      .getModels(byokit.COMPLETE, { local: false, sort: byokit.ModelSort.ProviderOrder })
      .map((m) => m.id),
  );
  assert.ok(all.some((m) => m.callSupport.textGeneration));
  assert.ok(all.some((m) => !m.callSupport.textGeneration));
  assert.ok(filterModels({ provider: '302ai', callableOnly: false }).length > 0);
  assert.ok(
    byokit.getModels(byokit.COMPLETE, { local: false }).some((m) => m.providerId === '302ai'),
  );
  assert.deepEqual(
    actual.map((m) => m.id),
    expected.map((m) => m.id),
  );
  for (const model of actual) {
    assert.deepEqual(model.verification, expected.find((m) => m.id === model.id).verification);
  }
});
test('filterModels filters accurately by speciality and tier', () => {
  const codingModels = filterModels({ speciality: 'coding', includeOutdated: true });
  assert.ok(codingModels.length > 0);
  assert.ok(codingModels.every((m) => m.speciality === 'coding'));

  const flashModels = filterModels({ tier: 'flash', includeOutdated: true });
  assert.ok(flashModels.length > 0);
  assert.ok(flashModels.every((m) => m.tier === 'flash'));
});
test('documented single selection is bounded, rejects empty matches and excludes Local', () => {
  const models = byokit.getModels({
    providerIds: byokit.exact(byokit.ProviderId.DeepSeek),
    limit: 1,
    local: false,
  });
  assert.ok(models.length <= 1);
  assert.ok(models.every((m) => !m.local));
  assert.deepEqual(
    byokit.getModels({
      providerIds: byokit.exact(byokit.ProviderId.DeepSeek),
      limit: 1,
      local: false,
      filters: { minContextTokens: Number.MAX_SAFE_INTEGER },
    }),
    [],
  );
});
test('website selectors use library vocabularies and tag metadata', async () => {
  const source = await readFile(new URL('../website/verification.js', import.meta.url), 'utf8');
  assert.ok(source.includes('Object.values(byokit.FeatureName)'));
  assert.ok(source.includes('Object.values(byokit.Modality)'));
  assert.ok(source.includes('models.flatMap'));
  assert.ok(source.includes('m.provider.tags'));
  const home = await readFile(new URL('../website/app.js', import.meta.url), 'utf8');
  assert.ok(
    home.includes('byokit.getModels(modes[mode], config)') ||
      home.includes('byokit.getModels(modes[mode],config)'),
  );
  const inference = await readFile(new URL('../website/inference.js', import.meta.url), 'utf8');
  assert.ok(
    inference.includes('new OpenAI({ baseURL: model.connection.baseUrl') ||
      inference.includes('new OpenAI({baseURL:model.connection.baseUrl') ||
      inference.includes('new OpenAI({ baseURL: model.connection.baseUrl,') ||
      inference.includes('baseURL: model.connection.baseUrl'),
  );
});
