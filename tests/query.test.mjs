import { pythonModels } from './python-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  Catalog,
  validateCatalog,
  verificationSummary,
  COMPLETE,
  Modality,
  Exact,
  Contain,
  Any,
  exact,
  contain,
  any,
} from '../packages/byokit/index.js';
import bundled, { getModels } from 'byokit/catalog';
const fixture = () => JSON.parse(readFileSync('spec/fixtures/catalog.json'));
const asOf = '2026-10-12T12:00:00Z';
const report = (fields = {}) => ({
  id: 'alice-small',
  offeringId: 'test/small',
  contributor: 'github:alice',
  checkedAt: '2026-10-11T12:00:00Z',
  result: 'passed',
  checks: ['textGeneration'],
  adapter: 'fixture@1.0',
  evidence: 'https://github.com/example/test/blob/commit/evidence.md',
  ...fields,
});

test('simple query returns a bounded flat list with provider/model metadata and no invented reports', () => {
  const data = structuredClone(bundled);
  data.verifications = [];
  const catalog = new Catalog(data);
  const list = catalog.getModels({ providerIds: ['deepseek'], limit: 1 });
  assert.equal(list.length, 1);
  assert.equal(list[0].provider.id, 'deepseek');
  assert.ok(list[0].apiModelId);
  assert.ok(list[0].model);
  assert.equal(list[0].verification.status, 'unverified');
  assert.deepEqual(list[0].verification.records, []);
  assert.deepEqual(catalog.getModels({ local: false, filters: { verified: true } }), []);
  assert.throws(() => getModels({ limit: 0 }));
});
test('bundled provider results preserve real published contributor reports', () => {
  const asOf = new Date().toISOString();
  for (const model of getModels({ providerIds: ['deepseek'], asOf }))
    assert.deepEqual(model.verification, verificationSummary(bundled, model.id, { asOf }));
});
test('README example matches the bundled catalog', () => {
  const run = spawnSync('node', ['examples/query.mjs'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), ['anthropic', 'google', 'openai', 'openai', 'local']);
});
test('reports retain author and evidence, but never promote unknown capabilities', () => {
  const data = fixture();
  data.verifications = [report()];
  const c = new Catalog(data);
  const models = c.getModels({
    asOf,
    local: false,
    filters: { verified: true, verifiedBy: 'github:alice' },
  });
  assert.equal(models.length, 1);
  assert.equal(models[0].verification.latest.contributor, 'github:alice');
  assert.equal(models[0].features.strictJsonSchema.status, 'unknown');
  assert.deepEqual(
    c.getModels({
      asOf,
      local: false,
      filters: { verified: true, requiredFeatures: ['strictJsonSchema'] },
    }),
    [],
  );
  assert.deepEqual(c.getModels({ asOf, local: false, filters: { verifiedBy: 'github:bob' } }), []);
  models[0].verification.records[0].result = 'failed';
  assert.equal(c.data.verifications[0].result, 'passed');
});
test('later failures, stale reports, feature-only reports, and future reports cannot establish a passing text call', () => {
  const data = fixture();
  data.verifications = [
    report(),
    report({ id: 'new-failure', checkedAt: '2026-10-12T10:00:00Z', result: 'failed' }),
  ];
  assert.equal(verificationSummary(data, 'test/small', { asOf }).status, 'failed');
  data.verifications = [report({ checkedAt: '2020-01-01T00:00:00Z' })];
  assert.equal(verificationSummary(data, 'test/small', { asOf }).status, 'stale');
  data.verifications = [report({ checks: ['functionCalling'] })];
  assert.equal(verificationSummary(data, 'test/small', { asOf }).status, 'unverified');
  data.verifications = [report({ checkedAt: '2099-01-01T00:00:00Z' })];
  assert.equal(verificationSummary(data, 'test/small', { asOf }).status, 'unverified');
});
test('verification input rejects dangling targets, secret fields, duplicate IDs and missing evidence', () => {
  for (const records of [
    [report({ offeringId: 'missing' })],
    [report({ apiKey: 'secret' })],
    [report(), report()],
    [report({ evidence: '' })],
  ]) {
    const data = fixture();
    data.verifications = records;
    assert.ok(validateCatalog(data).length);
    assert.throws(() => new Catalog(data));
  }
});
test('JS and Python simple query and verification filters agree', () => {
  const data = fixture();
  data.verifications = [
    report(),
    report({
      id: 'bob-large',
      offeringId: 'test/large',
      contributor: 'github:bob',
      result: 'failed',
    }),
  ];
  const queries = [
    { asOf },
    { asOf, filters: { verified: true } },
    { asOf, filters: { verified: false } },
    { asOf, filters: { verified: 'verified' } },
    { asOf, filters: { verified: 'unverified' } },
    { asOf, filters: { verified: 'verified to be failure' } },
    { asOf, filters: { verifiedBy: 'github:bob' } },
    { asOf, limit: 1 },
  ];
  const result = pythonModels({ data, queries });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    queries.map((q) => new Catalog(data).getModels(q)),
    JSON.parse(result.stdout),
  );
});

test('explicit provider queries return all non-deprecated matches unless a limit is supplied', () => {
  const data = fixture(),
    base = data.offerings[0];
  data.offerings = Array.from({ length: 125 }, (_, i) => ({
    ...base,
    id: `test/model-${i}`,
    apiModelId: `model-${i}`,
    rank: i,
  }));
  data.offerings.push({ ...base, id: 'test/deprecated', status: 'deprecated' });
  const c = new Catalog(data);
  assert.equal(c.getModels({ providerIds: ['test'] }).length, 125);
  assert.equal(c.getModels({ providerIds: ['test'], limit: 5 }).length, 5);
  assert.equal(c.getModels().length, 2);
  assert.equal(c.select()[0].offerings.length, 4);
  const run = pythonModels({
    data,
    queries: [{ providerIds: ['test'] }, { providerIds: ['test'], limit: 5 }, {}],
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    JSON.parse(run.stdout).map((x) => x.length),
    [125, 5, 2],
  );
});

test('Global includes editorial providers and preserves local choices', () => {
  const data = JSON.parse(readFileSync('catalog/catalog.json'));
  const preset = data.presets.find((p) => p.id === 'global');
  assert.ok(preset);
  assert.ok(preset.providerIds.every((id) => data.providers.some((p) => p.id === id)));
  assert.ok(preset.providerIds.length < data.providers.length);
  assert.ok(preset.providerIds.includes('ollama'));
  assert.ok(preset.providerIds.includes('deepseek'));
  const c = new Catalog(data);
  assert.ok(c.getModels({ preset: 'global' }).length);
  const run = pythonModels({ data, queries: [{ preset: 'global' }] });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), [c.getModels({ preset: 'global' })]);
});
test('catalog namespace includes all helpers used by documented examples', async () => {
  const byokit = await import('byokit/catalog');
  assert.equal(byokit.Preset.Global, 'global');
  assert.equal(byokit.githubContributor('example'), 'github:example');
  assert.equal(typeof byokit.checkFit, 'function');
  const ui = await import('byokit/dom');
  assert.equal(ui.Preset.Global, 'global');
  assert.equal(typeof ui.discoverLocal, 'function');
});

test('release dates validate actual calendar days; unknown metadata remains nullable', () => {
  for (const releaseDate of ['2026-02-30', 'not-a-date', '2026-2-1', '0000-01-01']) {
    const data = fixture();
    data.offerings[0].releaseDate = releaseDate;
    assert.ok(validateCatalog(data).some((e) => e.includes('releaseDate')));
  }
  for (const releaseDate of [null, '2024-02-29', '2026-10']) {
    const data = fixture();
    data.offerings[0].releaseDate = releaseDate;
    assert.deepEqual(validateCatalog(data), []);
    const result = pythonModels({ data, queries: [{ list: COMPLETE, asOf, local: false }] });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      JSON.parse(result.stdout)[0].find((m) => m.id === data.offerings[0].id).releaseDate,
      releaseDate,
    );
  }
});

test('modality filters support Exact, Contain, Any with bare array defaults and Python parity', () => {
  assert.deepEqual(exact([Modality.Text]), { mode: 'exact', values: ['text'] });
  assert.deepEqual(Exact(Modality.Text), { mode: 'exact', values: ['text'] });
  assert.deepEqual(contain([Modality.Text]), { mode: 'contain', values: ['text'] });
  assert.deepEqual(Contain(Modality.Text), { mode: 'contain', values: ['text'] });
  assert.deepEqual(any([Modality.Text, Modality.Image]), {
    mode: 'any',
    values: ['text', 'image'],
  });
  assert.deepEqual(Any([Modality.Text, Modality.Image]), {
    mode: 'any',
    values: ['text', 'image'],
  });

  const data = fixture();
  data.offerings[0].modalities = { input: ['text'], output: ['text'] };
  const multiOut = structuredClone(data.offerings[0]);
  multiOut.id = 'test/image-text';
  multiOut.modalities = { input: ['text'], output: ['text', 'image'] };
  const visionIn = structuredClone(data.offerings[0]);
  visionIn.id = 'test/vision-in';
  visionIn.modalities = { input: ['text', 'image'], output: ['text'] };
  const audioOut = structuredClone(data.offerings[0]);
  audioOut.id = 'test/audio-out';
  audioOut.modalities = { input: ['text'], output: ['text', 'audio'] };

  data.offerings = [data.offerings[0], multiOut, visionIn, audioOut];
  data.presets[0].offeringIds = data.offerings.map((o) => o.id);
  data.presets[1].offeringIds = data.offerings.map((o) => o.id);
  data.presets[2].offeringIds = data.offerings.map((o) => o.id);

  const c = new Catalog(data);

  // 1. Bare array on output defaults to exact -> only pure text output matches
  const textExactBare = c
    .getModels({ local: false, filters: { output: [Modality.Text] } })
    .map((m) => m.id);
  assert.deepEqual(textExactBare, ['test/small', 'test/vision-in']);

  // 2. Exact on output -> identical to bare array
  const textExactExplicit = c
    .getModels({ local: false, filters: { output: Exact([Modality.Text]) } })
    .map((m) => m.id);
  assert.deepEqual(textExactExplicit, ['test/small', 'test/vision-in']);

  // 3. Contain on output -> matches models outputting text + image and text + audio
  const textContain = c
    .getModels({ local: false, filters: { output: Contain([Modality.Text]) } })
    .map((m) => m.id);
  assert.deepEqual(textContain, [
    'test/audio-out',
    'test/image-text',
    'test/small',
    'test/vision-in',
  ]);

  // 4. Exact on output for both text and image
  const multiExact = c
    .getModels({ local: false, filters: { output: Exact([Modality.Text, Modality.Image]) } })
    .map((m) => m.id);
  assert.deepEqual(multiExact, ['test/image-text']);

  // 5. Any on output -> matches anything with image or audio
  const imageOrAudio = c
    .getModels({ local: false, filters: { output: Any([Modality.Image, Modality.Audio]) } })
    .map((m) => m.id);
  assert.deepEqual(imageOrAudio, ['test/audio-out', 'test/image-text']);

  // 6. Bare array on input defaults to contain -> vision models match [Modality.Image]
  const imageInContain = c
    .getModels({ local: false, filters: { input: [Modality.Image] } })
    .map((m) => m.id);
  assert.deepEqual(imageInContain, ['test/vision-in']);

  // 7. Shorthand format { contain: [...] }, { exact: [...] }, { any: [...] }
  const shorthand = c
    .getModels({ local: false, filters: { output: { contain: ['text'] } } })
    .map((m) => m.id);
  assert.deepEqual(shorthand, textContain);

  // 8. Python parity check
  const queries = [
    { local: false, filters: { output: [Modality.Text] } },
    { local: false, filters: { output: { mode: 'exact', values: ['text'] } } },
    { local: false, filters: { output: { mode: 'contain', values: ['text'] } } },
    { local: false, filters: { output: { mode: 'exact', values: ['text', 'image'] } } },
    { local: false, filters: { output: { mode: 'any', values: ['image', 'audio'] } } },
    { local: false, filters: { input: [Modality.Image] } },
    { local: false, filters: { output: { contain: ['text'] } } },
  ];
  const pyResult = pythonModels({ data, queries });
  assert.equal(pyResult.status, 0, pyResult.stderr);
  const pyData = JSON.parse(pyResult.stdout);
  assert.deepEqual(
    pyData[0].map((m) => m.id),
    textExactBare,
  );
  assert.deepEqual(
    pyData[1].map((m) => m.id),
    textExactExplicit,
  );
  assert.deepEqual(
    pyData[2].map((m) => m.id),
    textContain,
  );
  assert.deepEqual(
    pyData[3].map((m) => m.id),
    multiExact,
  );
  assert.deepEqual(
    pyData[4].map((m) => m.id),
    imageOrAudio,
  );
  assert.deepEqual(
    pyData[5].map((m) => m.id),
    imageInContain,
  );
  assert.deepEqual(
    pyData[6].map((m) => m.id),
    shorthand,
  );

  // Bundled catalog check for chatgpt-image-latest and lyria-3-pro-preview
  const textOnlyBundled = getModels({
    providerIds: ['openai', 'google'],
    filters: { output: [Modality.Text] },
  }).map((m) => m.id);
  assert.ok(!textOnlyBundled.includes('openai/chatgpt-image-latest'));
  assert.ok(!textOnlyBundled.includes('google/lyria-3-pro-preview'));

  const containBundled = getModels({
    providerIds: ['openai'],
    filters: { output: Contain([Modality.Text]) },
  }).map((m) => m.id);
  assert.ok(containBundled.includes('openai/chatgpt-image-latest'));
});
