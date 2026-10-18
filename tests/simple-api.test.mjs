import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pythonModels } from './python-fixture.mjs';
import * as byokit from 'byokit/catalog';
const asOf = '2026-10-13T13:00:00Z';
const fixture = () => JSON.parse(readFileSync('spec/fixtures/catalog.json'));
test('default list contains explicit reviewed recommendations followed by Local', () => {
  const list = byokit.getModels({ asOf });
  assert.deepEqual(
    list.map((o) => o.providerId),
    ['anthropic', 'deepseek', 'deepseek', 'google', 'openai', 'openai', 'local'],
  );
  assert.ok(list.slice(0, -1).every((o) => o.callSupport.textGeneration));
  const ids = JSON.parse(readFileSync('catalog/recommendations.json')).map((r) => r.offeringId);
  assert.ok(list.slice(0, -1).every((o) => ids.includes(o.id)));
  assert.equal(list.at(-1).local.configured, false);
  assert.equal(list.at(-1).apiModelId, '');
});
test('COMPLETE removes shortlist limits and CHINA selects China providers', () => {
  const full = byokit.getModels(byokit.COMPLETE, { asOf, local: false });
  assert.ok(full.length > 500);
  assert.ok(full.some((o) => o.lifecycle.status === byokit.Lifecycle.Uncertain));
  assert.ok(full.some((o) => o.lifecycle.status === byokit.Lifecycle.Outdated));
  assert.ok(full.filter((o) => o.providerId === 'openrouter').length > 24);
  assert.deepEqual(
    byokit
      .getModels(byokit.CHINA, { asOf, sort: byokit.ModelSort.ProviderOrder })
      .map((o) => o.providerId),
    ['deepseek', 'zhipuai', 'siliconflow', 'local'],
  );
  assert.ok(
    byokit.getModels(byokit.GLOBAL, { asOf, local: false }).some((o) => o.provider.origin === 'cn'),
  );
  assert.ok(
    byokit
      .getModels(byokit.COMPLETE, {
        asOf,
        local: false,
        filters: { excludeTags: byokit.any(byokit.Tag.OriginChina) },
      })
      .every((o) => !o.tags.includes('origin:cn') && !o.provider.tags.includes('origin:cn')),
  );
  assert.equal(byokit.getModels(byokit.COMPLETE, { asOf, limit: 2 }).length, 3);
  assert.throws(() => byokit.getModels('nonsense'));
  assert.throws(() => byokit.getModels({}, { limit: 1 }));
});
test('OFFICIAL selects only official providers and filters.official restricts to first-party endpoints', () => {
  const official = byokit.getModels(byokit.OFFICIAL, {
    asOf,
    sort: byokit.ModelSort.ProviderOrder,
  });
  assert.deepEqual(
    official.map((o) => o.providerId),
    ['openai', 'anthropic', 'google', 'mistral', 'deepseek', 'zhipuai'],
  );
  assert.deepEqual(
    official.map((o) => o.id),
    [
      'openai/gpt-6.1-sol',
      'anthropic/claude-opus-5-5',
      'google/gemini-4-argon',
      'mistral/mistral-large-4',
      'deepseek/deepseek-v4-pro',
      'zhipuai/glm-5.3',
    ],
  );
  assert.ok(official.every((o) => o.provider.tags.includes('provider:official')));

  const anthropicFlagship = byokit.getModels({
    preset: 'official-flagship',
    providerIds: byokit.exact('anthropic'),
  });
  assert.deepEqual(
    anthropicFlagship.map((o) => o.id),
    ['anthropic/claude-opus-5-5'],
  );

  const chinaOfficial = byokit.getModels(byokit.CHINA, {
    asOf,
    sort: byokit.ModelSort.ProviderOrder,
    filters: { official: true },
  });
  assert.deepEqual(
    chinaOfficial.map((o) => o.providerId),
    ['deepseek', 'zhipuai'],
  );

  const globalOfficial = byokit.getModels(byokit.GLOBAL, {
    asOf,
    sort: byokit.ModelSort.ProviderOrder,
    filters: { official: true },
  });
  assert.deepEqual(
    globalOfficial.map((o) => o.providerId),
    ['openai', 'anthropic', 'google', 'mistral', 'deepseek', 'zhipuai'],
  );

  const globalUnofficial = byokit.getModels(byokit.GLOBAL, {
    asOf,
    local: false,
    sort: byokit.ModelSort.ProviderOrder,
    filters: { official: false },
  });
  assert.deepEqual(
    globalUnofficial.map((o) => o.providerId),
    ['mistral', 'groq', 'openrouter', 'siliconflow'],
  );

  const completeOfficial = byokit.getModels(byokit.COMPLETE, {
    asOf,
    local: false,
    filters: { official: true },
  });
  assert.ok(completeOfficial.length > 100);
  assert.ok(
    completeOfficial.every((o) => !['openrouter', 'groq', 'siliconflow'].includes(o.providerId)),
  );
  assert.ok(
    completeOfficial.every((o) => {
      const creator = o.modelId.split('/')[0];
      return o.providerId === creator || o.providerId.startsWith(creator + '-');
    }),
  );
});
test('Tag.ModelFlash and Tag.Flash filter flash models and agree with isFlashModel', () => {
  const flashByTag = byokit.getModels(byokit.COMPLETE, {
    asOf,
    local: false,
    filters: { includeTags: byokit.any(byokit.Tag.ModelFlash) },
  });
  const flashByShort = byokit.getModels(byokit.COMPLETE, {
    asOf,
    local: false,
    filters: { includeTags: byokit.any(byokit.Tag.Flash) },
  });
  assert.ok(flashByTag.length > 500);
  assert.equal(flashByTag.length, flashByShort.length);
  assert.ok(
    flashByTag.every((m) => m.tags.includes('model:flash') && byokit.isFlashModel(m, m.model)),
  );
  assert.ok(flashByTag.some((m) => m.id === 'google/gemini-3.8-flash'));
  assert.ok(flashByTag.some((m) => m.id === 'deepseek/deepseek-flash'));

  const nonFlash = byokit.getModels(byokit.COMPLETE, {
    asOf,
    local: false,
    filters: { excludeTags: byokit.any(byokit.Tag.ModelFlash) },
  });
  assert.ok(nonFlash.length > 5000);
  assert.ok(!nonFlash.some((m) => m.tags.includes('model:flash')));
  assert.ok(!nonFlash.some((m) => m.id === 'google/gemini-3.8-flash'));
});
test('lifecycle is provider-specific: retired direct model stays LIVE via aggregator', () => {
  const d = fixture();
  d.providers.push({
    id: 'openrouter',
    name: 'OpenRouter',
    auth: 'required',
    deployment: 'hosted',
  });
  const original = d.offerings[0];
  original.lifecycleEvidence = { ...original.lifecycleEvidence, status: 'OUTDATED' };
  d.offerings.push({
    ...original,
    id: 'openrouter/same-model',
    providerId: 'openrouter',
    lifecycleEvidence: { ...original.lifecycleEvidence, status: 'LIVE' },
  });
  const c = new byokit.Catalog(d),
    list = c.getModels(byokit.COMPLETE, { asOf, local: false });
  assert.ok(
    list.some((o) => o.id === original.id && o.lifecycle.status === byokit.Lifecycle.Outdated),
  );
  assert.ok(list.some((o) => o.id === 'openrouter/same-model'));
  delete d.offerings[1].lifecycleEvidence;
  assert.ok(
    new byokit.Catalog(d)
      .getModels(byokit.COMPLETE, { asOf, local: false })
      .some((o) => o.id === d.offerings[1].id),
  );
  assert.ok(
    c
      .getModels(byokit.COMPLETE, {
        asOf,
        local: false,
        filters: { lifecycle: byokit.any(byokit.Lifecycle.Outdated) },
      })
      .some((o) => o.id === original.id),
  );
});
test('local URL/model entries bypass hosted metadata filters and never fabricate capabilities', () => {
  const local = [
    { endpoint: 'http://localhost:8000/v1', api: byokit.LocalApi.OpenAI, modelId: 'my-model' },
  ];
  const q = {
    asOf,
    local,
    filters: {
      minContextTokens: 1e12,
      excludeTags: byokit.any(byokit.customTag('deployment:local')),
      requiredFeatures: byokit.any(byokit.FeatureName.StrictJsonSchema),
    },
  };
  const list = byokit.getModels(q);
  assert.equal(list.length, 1);
  assert.equal(list[0].apiModelId, 'my-model');
  assert.equal(list[0].local.endpoint, local[0].endpoint);
  assert.equal(list[0].limits.context, null);
  assert.deepEqual(list[0].features, {});
  assert.equal(byokit.getModels({ ...q, local: false }).length, 0);
  assert.equal(
    byokit
      .getModels({ ...q, filters: { deployment: byokit.any(byokit.Deployment.Hosted) } })
      .some((o) => o.local),
    false,
  );
  assert.throws(() => byokit.getModels({ local: [{ endpoint: 'file:///secret' }] }));
  assert.throws(() => byokit.getModels({ local: [{ endpoint: 'http://key@localhost:8000' }] }));
  assert.throws(() =>
    byokit.getModels({ local: [{ endpoint: 'http://localhost:8000', api: 'unknown' }] }),
  );
});
test('simplified list modes and appended local entries agree with Python', () => {
  const d = JSON.parse(readFileSync('catalog/catalog.json'));
  const queries = [
    'complete',
    'china',
    'global',
    { asOf },
    {
      asOf,
      list: 'complete',
      limit: 5,
      local: [{ endpoint: 'http://localhost:8080/v1', modelId: 'one' }],
    },
    { asOf, local: false, filters: { lifecycle: byokit.any('UNCERTAIN') } },
    { asOf, local: false, filters: { includeTags: byokit.any(byokit.Tag.ModelFlash) } },
  ];
  const run = pythonModels({ data: d, queries });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    JSON.parse(run.stdout),
    queries.map((q) => new byokit.Catalog(d).getModels(q)),
  );
});

test('serializeQuery produces deterministic keys and Catalog caches results', () => {
  const d = fixture();
  const catalog = new byokit.Catalog(d);

  // 1. Deterministic serialization
  assert.equal(byokit.serializeQuery('china'), byokit.serializeQuery({ list: 'china' }));
  assert.equal(
    byokit.serializeQuery({ limit: 5, list: 'global' }),
    byokit.serializeQuery({ list: 'global', limit: 5 }),
  );
  assert.equal(byokit.serializeQuery(), byokit.serializeQuery({}));

  // 2. Cache detection before call
  const query = { list: 'global', limit: 2 };
  assert.equal(catalog.hasCached(query), false);
  assert.equal(catalog.getCached(query), undefined);

  // 3. First call populates cache
  const first = catalog.getModels(query);
  assert.equal(catalog.hasCached(query), true);
  assert.equal(catalog.hasCached({ limit: 2, list: 'global' }), true);
  assert.ok(Array.isArray(catalog.getCached(query)));
  assert.equal(catalog.getCached(query).length, first.length);

  // 4. Second call returns cached result directly
  const second = catalog.getModels({ limit: 2, list: 'global' });
  assert.deepEqual(first, second);

  // 5. Cache mutation isolation
  first[0].name = 'MUTATED_NAME';
  const third = catalog.getModels(query);
  assert.notEqual(third[0].name, 'MUTATED_NAME');

  // 6. Cache clearing
  catalog.clearCache();
  assert.equal(catalog.hasCached(query), false);
  assert.equal(catalog.getCached(query), undefined);
});

test('LIVE and default list return live models', () => {
  const live = byokit.getModels(byokit.LIVE, { asOf });
  const def = byokit.getModels({ asOf });
  assert.deepEqual(live, def);
  assert.ok(live.every((o) => o.lifecycle.status !== byokit.Lifecycle.Outdated));
});
