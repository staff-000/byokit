import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pythonModels } from './python-fixture.mjs';
import data, * as b from '../packages/byokit/catalog.js';

const expected = [
  'anthropic/claude-haiku-5-5',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-flash',
  'google/gemini-3.8-flash',
  'openai/gpt-5.6-terra',
  'openai/gpt-6-luna',
];
const ids = (models) => models.map((m) => m.id);

test('default selects exactly the six reviewed product-line choices in both languages', () => {
  const query = { local: false, asOf: '2026-10-18T12:00:00Z' };
  assert.deepEqual(ids(b.getModels(query)), expected);
  assert.ok(b.getModels(query).every((m) => m.callSupport.textGeneration));
  const run = pythonModels({ data, queries: [query] });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(ids(JSON.parse(run.stdout)[0]), expected);
  assert.ok(b.getModels(b.COMPLETE, query).some((m) => m.id === 'openai/gpt-6.1-sol'));
  const empty = structuredClone(data);
  empty.presets.find((p) => p.id === 'default').offeringIds = [];
  assert.deepEqual(new b.Catalog(empty).getModels(query), []);
});

test('nested predicates retain their semantics, serialize and agree with Python', () => {
  const fixture = JSON.parse(readFileSync('spec/fixtures/catalog.json'));
  const original = fixture.offerings[0];
  fixture.offerings = [
    ['text', ['text']],
    ['mixed', ['text', 'image']],
    ['image', ['image']],
    ['audio', ['audio']],
    ['video', ['video']],
    ['unknown', null],
  ].map(([name, output]) => ({
    ...structuredClone(original),
    id: `test/${name}`,
    name,
    modalities: { input: ['text', 'image'], output },
    tags: name === 'mixed' ? ['test:a', 'test:b'] : ['test:a'],
  }));
  for (const p of fixture.presets) p.offeringIds = fixture.offerings.map((o) => o.id);
  const c = new b.Catalog(fixture);
  const query = (filters) => ({ local: false, filters });
  const predicates = [
    b.exact('text'),
    b.any(b.exact('text')),
    b.or(b.exact('text'), b.exact('image')),
    b.exclude(b.exact('text')),
    b.not(b.exact('text')),
    b.and(b.contain('text'), b.exclude('image')),
    b.exact('text', 'text'),
    b.exact(),
    b.any(),
    b.contain('text'),
    b.any('audio', 'video'),
  ];
  const queries = predicates.map((output) => query({ output }));
  queries.push(
    query({ input: ['text'] }),
    query({ input: b.or(b.contain('image'), b.contain('audio')) }),
    query({ excludeTags: b.and('test:a', 'test:b') }),
    query({ includeTags: ['test:a', 'test:b'] }),
    query({ output: b.not(b.exact('text')) }),
  );
  assert.deepEqual(ids(c.getModels(queries[0])), ['test/text']);
  assert.deepEqual(ids(c.getModels(queries[1])), ['test/text']);
  assert.deepEqual(ids(c.getModels(queries[2])), ['test/image', 'test/text']);
  assert.ok(!ids(c.getModels(queries[3])).includes('test/text'));
  assert.deepEqual(ids(c.getModels(queries[5])), ['test/text']);
  assert.deepEqual(ids(c.getModels(queries[6])), ['test/text']);
  assert.deepEqual(c.getModels(queries[7]), []);
  assert.deepEqual(c.getModels(queries[8]), []);
  assert.deepEqual(ids(c.getModels(queries.at(-3))), [
    'test/audio',
    'test/image',
    'test/text',
    'test/unknown',
    'test/video',
  ]);
  for (const q of queries) {
    assert.deepEqual(c.getModels(JSON.parse(c.getConfigJson(q))), c.getModels(q));
    assert.deepEqual(c.getCached(q), c.getModels(q));
  }
  const run = pythonModels({ data: fixture, queries });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    JSON.parse(run.stdout).map(ids),
    queries.map((q) => ids(c.getModels(q))),
  );
  assert.throws(() => c.getModels(query({ output: b.not('text', 'image') })), /exactly one/);
});

test('coding classification covers different providers and respects editorial values', () => {
  for (const name of [
    'gpt-5.3-codex',
    'codestral-latest',
    'devstral-medium',
    'qwen3-coder-plus',
    'starcoder',
  ]) {
    assert.equal(b.getModelSpeciality({ apiModelId: name }), b.Speciality.Coding);
  }
  for (const id of [
    'mistral/codestral-latest',
    'mistral/devstral-medium-latest',
    'alibaba/qwen3-coder-plus',
  ]) {
    assert.equal(data.offerings.find((o) => o.id === id).speciality, b.Speciality.Coding);
  }
  assert.equal(b.getModelSpeciality({ apiModelId: 'codex', speciality: 'general' }), 'general');
  assert.equal(b.getModelTier({ apiModelId: 'flash', tier: 'workhorse' }), 'workhorse');
  assert.equal(b.getModelSpeciality({ apiModelId: 'unreviewed-model' }), 'unknown');
  assert.equal(b.getModelTier({ apiModelId: 'unreviewed-model' }), 'unknown');
});

test('release channels exclude previews independently from lifecycle and release age', () => {
  assert.equal(b.getReleaseChannel({ apiModelId: 'gemini-preview', status: 'stable' }), 'preview');
  assert.equal(b.getReleaseChannel({ apiModelId: 'model-exp' }), 'experimental');
  assert.equal(b.getReleaseChannel({ apiModelId: 'model' }), 'unknown');
  const fixture = JSON.parse(readFileSync('spec/fixtures/catalog.json'));
  fixture.offerings = ['stable', 'preview', 'experimental', 'unknown'].map((channel) => ({
    ...structuredClone(fixture.offerings[0]),
    id: `test/${channel}`,
    apiModelId: `model-${channel}`,
    status: channel === 'stable' ? 'stable' : undefined,
  }));
  const c = new b.Catalog(fixture);
  const query = { local: false, filters: { releaseChannel: ['stable'] } };
  const stable = c.getModels(b.COMPLETE, query);
  assert.ok(stable.length);
  assert.ok(stable.every((o) => b.getReleaseChannel(o) === 'stable'));
  assert.ok(!stable.some((o) => /preview|experimental/.test(o.apiModelId)));
  const run = pythonModels({ data: fixture, queries: [{ ...query, list: b.COMPLETE }] });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(ids(JSON.parse(run.stdout)[0]), ids(stable));
});

test('unknown local setup does not satisfy capability, speciality, or stable-channel filters', () => {
  const queries = [
    { filters: { output: b.exact() } },
    { filters: { speciality: ['general'] } },
    { filters: { releaseChannel: ['stable'] } },
  ];
  for (const q of queries) assert.ok(b.getModels(q).every((m) => !m.local));
  const run = pythonModels({ data, queries });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    JSON.parse(run.stdout).map(ids),
    queries.map((q) => ids(b.getModels(q))),
  );
});

test('channel:preview tag and default exclusion of preview/experimental models with Python parity', () => {
  assert.equal(b.Tag.ChannelPreview, 'channel:preview');
  assert.equal(b.Tag.Preview, 'channel:preview');
  assert.equal(b.Tag.ModelPreview, 'channel:preview');

  const fixture = JSON.parse(readFileSync('spec/fixtures/catalog.json'));
  fixture.offerings = ['stable', 'preview', 'experimental', 'unknown'].map((channel) => ({
    ...structuredClone(fixture.offerings[0]),
    id: `test/${channel}`,
    apiModelId: `model-${channel}`,
    status: channel === 'stable' ? 'stable' : channel,
  }));
  const c = new b.Catalog(fixture);

  const base = { local: false, ui: { maxModelsPerProvider: 10 } };

  // 1. By default when generating model list, preview and experimental models are excluded
  const defaultList = c.getModels(base);
  assert.deepEqual(ids(defaultList), ['test/stable', 'test/unknown']);
  assert.ok(defaultList.every((o) => !o.tags.includes('channel:preview')));

  // 2. Explicitly include previews via filters.includePreviews
  const withPreviews = c.getModels({ ...base, filters: { includePreviews: true } });
  assert.deepEqual(ids(withPreviews), [
    'test/experimental',
    'test/preview',
    'test/stable',
    'test/unknown',
  ]);

  // Verify channel:preview tag is present on preview and experimental offerings
  const previewModel = withPreviews.find((o) => o.id === 'test/preview');
  const expModel = withPreviews.find((o) => o.id === 'test/experimental');
  const stableModel = withPreviews.find((o) => o.id === 'test/stable');
  assert.ok(previewModel.tags.includes('channel:preview'));
  assert.ok(expModel.tags.includes('channel:preview'));
  assert.ok(!stableModel.tags.includes('channel:preview'));

  // 3. Filter using includeTags with Tag.ChannelPreview
  const tagged = c.getModels({ ...base, filters: { includeTags: b.any(b.Tag.ChannelPreview) } });
  assert.deepEqual(ids(tagged), ['test/experimental', 'test/preview']);

  // 4. Python parity
  const queries = [
    base,
    { ...base, filters: { includePreviews: true } },
    { ...base, filters: { includeTags: b.any(b.Tag.ChannelPreview) } },
    { ...base, filters: { releaseChannel: ['preview'] } },
  ];
  const run = pythonModels({ data: fixture, queries });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    JSON.parse(run.stdout).map(ids),
    queries.map((q) => ids(c.getModels(q))),
  );
});
