import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Catalog,
  checkFit,
  checkTask,
  validateCatalog,
  validateConfig,
  estimatePrice,
  preflight,
  reduceSetup,
  resolveSelection,
  deriveTags,
} from '../packages/byokit/index.js';
const data = JSON.parse(readFileSync(new URL('../spec/fixtures/catalog.json', import.meta.url)));
const catalog = new Catalog(data);
test('capability filters, unknown policy, limits, origins, open weights and commercial use are distinct', () => {
  assert.deepEqual(
    catalog.select({ local: false, filters: { requiredFeatures: ['strictJsonSchema'] } }),
    [],
  );
  assert.equal(
    catalog.select({
      local: false,
      filters: { requiredFeatures: ['strictJsonSchema'] },
      unknownPolicy: 'include',
    }).length,
    1,
  );
  assert.equal(
    catalog.select({ local: false, filters: { openWeights: true, commercialUse: 'allowed' } })
      .length,
    0,
  );
  assert.equal(
    catalog.select({ local: false, filters: { minContextTokens: 16000 } })[0].offerings[0].id,
    'test/large',
  );
  assert.equal(catalog.select({ local: false, filters: { origin: ['us'] } }).length, 0);
  assert.equal(catalog.select({ local: false, filters: { input: ['image'] } }).length, 0);
  assert.equal(
    catalog.select({ ui: { maxProviders: 1, maxModelsPerProvider: 1 } })[0].offerings.length,
    1,
  );
});
test('budget accounting and unknown local context', () => {
  assert.equal(
    checkFit(catalog.get('test/small'), { inputTokens: 7000, outputTokens: 2000 }).status,
    'exceeds',
  );
  assert.equal(
    checkFit(catalog.get('test/small'), { inputTokens: 4000, outputTokens: 2000 }).status,
    'fits',
  );
  assert.equal(
    checkFit(catalog.get('local/custom'), { inputTokens: 4000, outputTokens: 2000 }).status,
    'unknown',
  );
  assert.equal(checkFit(undefined, { inputTokens: 1 }).status, 'unknown');
  assert.equal(
    checkFit(
      catalog.get('test/small'),
      { inputTokens: 1000 },
      { requiredFeatures: ['strictJsonSchema'] },
    ).status,
    'unknown',
  );
  assert.equal(
    checkFit(catalog.get('test/small'), { inputTokens: 1000 }, { modalities: { input: ['image'] } })
      .status,
    'exceeds',
  );
});
test('untrusted/invalid metadata and configuration are rejected', () => {
  const invalid = structuredClone(data);
  invalid.offerings[0].limits.context = -1;
  assert.ok(validateCatalog(invalid).length);
  assert.throws(() => new Catalog(invalid));
  assert.ok(validateConfig({ ui: { maxProviders: 0 } }).length);
  assert.ok(validateConfig({ filters: { madeUpFeature: true } }).length);
  assert.throws(() => catalog.select({ preset: 'invalid' }));
  assert.throws(() => checkFit(catalog.get('test/small'), { inputTokens: -1 }));
});
test('preflight makes estimates and missing token counts explicit', async () => {
  const o = catalog.get('test/small');
  assert.equal((await preflight(o, [])).status, 'unknown');
  assert.equal(
    (
      await preflight(o, [], {
        countTokens: async () => ({ tokens: 1000, certainty: 'estimated' }),
      })
    ).status,
    'unknown',
  );
  assert.equal(
    (await preflight(o, [], { countTokens: async () => ({ tokens: 1000, certainty: 'measured' }) }))
      .status,
    'fits',
  );
});
test('saved custom selections and stale async results are preserved/fenced', () => {
  const selection = { providerId: 'test', modelId: 'custom' };
  assert.equal(resolveSelection(catalog, selection).selection, selection);
  const state = { selection, status: 'checking', requestId: 'new' };
  assert.equal(reduceSetup(state, { type: 'result', requestId: 'old', ok: true }), state);
  assert.equal(reduceSetup(state, { type: 'result', requestId: 'new', ok: true }).status, 'ready');
});
test('price and task diagnostics', () => {
  assert.equal(
    estimatePrice(catalog.get('test/small'), { inputTokens: 1e6, outputTokens: 1e6 }).amount,
    0.4,
  );
  assert.equal(checkTask(catalog, { offeringIds: [], budget: {} })[0].code, 'NO_MODELS');
});
test('real bundled catalog validates and each preset respects display cap', () => {
  const real = new Catalog(
    JSON.parse(readFileSync(new URL('../catalog/catalog.json', import.meta.url))),
  );
  for (const preset of ['china', 'global']) assert.ok(real.select({ preset }).length <= 8);
});

test('bundled catalog subpath is usable without network', async () => {
  const { default: snapshot } = await import('byokit/catalog');
  assert.ok(new Catalog(snapshot).select().length);
});

test('derived tags never retain stale capability flags or imply licensing', () => {
  const o = structuredClone(catalog.get('test/small'));
  o.features.functionCalling.status = 'unsupported';
  o.tags = ['cap:functionCalling', 'custom:favorite'];
  const tags = deriveTags(o, catalog.models.get(o.modelId));
  assert.ok(!tags.includes('cap:functionCalling'));
  assert.ok(tags.includes('weights:open'));
  assert.ok(!tags.includes('license:commercial'));
  assert.ok(tags.includes('custom:favorite'));
});
