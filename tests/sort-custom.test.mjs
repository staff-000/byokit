import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as byokit from '../packages/core/catalog.js';
import { pythonModels } from './python-fixture.mjs';
const data = () => JSON.parse(readFileSync('spec/fixtures/catalog.json'));
const asOf = '2026-10-12T12:00:00Z';
test('sorts across providers before limit with deterministic ties, zero prices and unknowns last', () => {
  const d = data(),
    base = d.offerings[0];
  d.offerings = ['Zulu', 'Alpha', 'Beta', 'Gamma'].map((name, i) => ({
    ...base,
    id: 'test/' + i,
    apiModelId: String(i),
    name,
    price: { currency: 'USD', input: [null, 0, 1, 1][i], output: 2 },
    speed: { tokensPerSecond: [null, 0, 10, 10][i], timeToFirstTokenMs: null, source: null },
  }));
  d.providers.push({ ...d.providers[0], id: 'second' });
  d.offerings[1].providerId = 'second';
  const c = new byokit.Catalog(d),
    q = { asOf, local: false, providerIds: ['test', 'second'] };
  assert.deepEqual(
    c.getModels(q).map((m) => m.name),
    ['Alpha', 'Beta', 'Gamma', 'Zulu'],
  );
  assert.deepEqual(
    c.getModels({ ...q, sort: byokit.ModelSort.PriceAscend, limit: 2 }).map((m) => m.name),
    ['Alpha', 'Beta'],
  );
  assert.deepEqual(
    c.getModels({ ...q, sort: byokit.ModelSort.SpeedDescend }).map((m) => m.name),
    ['Beta', 'Gamma', 'Alpha', 'Zulu'],
  );
  assert.deepEqual(
    c.getModels({ ...q, sort: byokit.ModelSort.SpeedAscend }).map((m) => m.name),
    ['Alpha', 'Beta', 'Gamma', 'Zulu'],
  );
  assert.deepEqual(
    c.getModels({ ...q, sort: byokit.ModelSort.PriceDescend }).map((m) => m.name),
    ['Beta', 'Gamma', 'Alpha', 'Zulu'],
  );
  assert.deepEqual(
    c.getModels({ ...q, sort: byokit.ModelSort.AlphabeticalDescend }).map((m) => m.name),
    ['Zulu', 'Gamma', 'Beta', 'Alpha'],
  );
  assert.deepEqual(
    c.getModels({ ...q, sort: 'price' }),
    c.getModels({ ...q, sort: byokit.ModelSort.PriceAscend }),
  );
  assert.deepEqual(
    c.getModels({ ...q, sort: 'speed' }),
    c.getModels({ ...q, sort: byokit.ModelSort.SpeedDescend }),
  );
  const queries = Object.values(byokit.ModelSort).map((sort) => ({ ...q, sort }));
  const py = pythonModels({ data: d, queries });
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(
    JSON.parse(py.stdout),
    queries.map((q) => c.getModels(q)),
  );
  assert.throws(() => c.getModels({ ...q, sort: 'fastest' }), /sort/);
});
test('directional price sorts leave missing and non-USD values last, with Local appended', () => {
  const d = data(),
    base = d.offerings[0];
  d.offerings = ['Dollar', 'Unknown', 'Euro'].map((name, i) => ({
    ...base,
    name,
    id: 'price/' + i,
    apiModelId: String(i),
    price: { currency: i === 2 ? 'EUR' : 'USD', input: i === 1 ? null : i, output: 1 },
  }));
  const c = new byokit.Catalog(d),
    q = {
      asOf,
      providerIds: ['test'],
      local: [{ endpoint: 'http://localhost:8080/v1', modelId: 'local' }],
    };
  for (const sort of [byokit.ModelSort.PriceAscend, byokit.ModelSort.PriceDescend]) {
    const models = c.getModels({ ...q, sort });
    assert.deepEqual(
      models.slice(0, 3).map((m) => m.name),
      ['Dollar', 'Euro', 'Unknown'],
    );
    assert.ok(models.at(-1).local);
  }
  const queries = [byokit.ModelSort.PriceAscend, byokit.ModelSort.PriceDescend].map((sort) => ({
    ...q,
    sort,
  }));
  const py = pythonModels({ data: d, queries });
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(
    JSON.parse(py.stdout),
    queries.map((query) => c.getModels(query)),
  );
});
const custom = {
  providerId: byokit.customProviderId('acme'),
  providerName: 'Acme',
  modelId: 'my-model',
  name: 'My model',
  baseUrl: 'https://example.com/v1',
  protocol: byokit.ApiProtocol.OpenAI,
};
test('append is immutable, unverified, callable, and rejects duplicate and credential-bearing configuration', async () => {
  const original = byokit.getModels(),
    models = byokit.appendModel(original, custom),
    model = models.at(-1);
  assert.equal(models.length, original.length + 1);
  assert.equal(model.verification.status, 'unverified');
  assert.equal(model.lifecycle.status, 'UNCERTAIN');
  assert.equal(model.limits.context, null);
  models[0].name = 'changed';
  assert.notEqual(original[0].name, 'changed');
  assert.throws(() => byokit.appendModel(models, custom), /Duplicate/);
  for (const bad of [
    { ...custom, apiKey: 'secret' },
    { ...custom, baseUrl: 'https://key@example.com' },
    { ...custom, baseUrl: 'https://example.com?key=secret' },
    { ...custom, protocol: 'unknown' },
    { ...custom, limits: { context: -1 } },
  ])
    assert.throws(() => byokit.appendModel([], bad));
  let called = false;
  const result = await byokit.call(model, 'Hello', 'transient', {
    runtimeChecks: false,
    fetch: async (url, init) => {
      called = true;
      assert.equal(url, 'https://example.com/v1/chat/completions');
      assert.equal(JSON.parse(init.body).model, 'my-model');
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }] }),
        { status: 200 },
      );
    },
  });
  assert.ok(called);
  assert.equal(result.choices[0].message.content, 'Hi');
  assert.ok(!JSON.stringify(models).includes('transient'));
});
