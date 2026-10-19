import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverLocal } from '../packages/byokit/dom/local.js';
test('local discovery validates origin and requires an explicit remote opt-in', async () => {
  let called = false;
  const fetch = async () => {
    called = true;
    return {
      ok: true,
      json: async () => ({
        models: [{ name: 'qwen:8b', size: 123, details: { quantization_level: 'Q4_K_M' } }],
      }),
    };
  };
  await assert.rejects(discoverLocal('https://example.com', { fetch }));
  assert.equal(called, false);
  await assert.rejects(discoverLocal('http://secret@localhost', { fetch }));
  const result = await discoverLocal('http://127.0.0.1:11434', { fetch });
  assert.equal(result[0].apiModelId, 'qwen:8b');
  assert.equal(result[0].limits.context, null);
  assert.equal(result[0].artifact.quantization, 'Q4_K_M');
});

test('OpenAI-compatible URL discovery supports vLLM, llama.cpp and Ollama with no doubled /v1', async () => {
  const { LocalApi } = await import('byokit');
  for (const [base, path] of [
    ['http://localhost:8000', '/v1/models'],
    ['http://localhost:8080/v1', '/v1/models'],
    ['http://localhost:11434/v1/', '/v1/models'],
    ['http://localhost:8000/proxy/v1', '/proxy/v1/models'],
  ]) {
    const found = await discoverLocal(base, {
      api: LocalApi.OpenAI,
      fetch: async (url) => {
        assert.equal(url.pathname, path);
        return { ok: true, json: async () => ({ data: [{ id: 'one-model' }] }) };
      },
    });
    assert.equal(found[0].local.api, LocalApi.OpenAI);
    assert.equal(found[0].apiModelId, 'one-model');
    assert.deepEqual(found[0].features, {});
  }
});
test('native Ollama can list running models separately from installed models', async () => {
  const { LocalApi } = await import('byokit');
  const found = await discoverLocal('http://localhost:11434', {
    api: LocalApi.Ollama,
    runningOnly: true,
    fetch: async (url) => {
      assert.equal(url.pathname, '/api/ps');
      return { ok: true, json: async () => ({ models: [{ name: 'running:8b' }] }) };
    },
  });
  assert.equal(found[0].apiModelId, 'running:8b');
});

test('configured local entries have stable connection identities and Python parity', async () => {
  const { Catalog } = await import('../packages/byokit/index.js');
  const { readFileSync } = await import('node:fs');
  const { pythonModels } = await import('./python-fixture.mjs');
  const data = JSON.parse(readFileSync(new URL('../spec/fixtures/catalog.json', import.meta.url)));
  const catalog = new Catalog(data);
  const entries = [
    { endpoint: 'http://LOCALHOST:80/v1/', modelId: 'model/a', api: 'openai-compatible' },
    { endpoint: 'http://localhost:11434', modelId: 'model/a', api: 'ollama' },
    { endpoint: 'http://localhost:11434', modelId: 'model/b', api: 'ollama' },
  ];
  const queries = [
    { providerIds: [], local: entries },
    { providerIds: [], local: [...entries].reverse() },
    { providerIds: [], local: [{ ...entries[0], endpoint: 'http://localhost' }] },
  ];
  const lists = queries.map((query) => catalog.getModels(query));
  assert.equal(new Set(lists[0].map((m) => m.id)).size, 3);
  assert.deepEqual(
    lists[0].map((m) => m.id),
    lists[1].map((m) => m.id).reverse(),
  );
  assert.equal(lists[0][0].id, lists[2][0].id);
  assert.ok(lists[0].every((m) => m.callSupport.textGeneration));
  const py = pythonModels({ data, queries });
  assert.equal(py.status, 0, py.stderr);
  const returned = JSON.parse(py.stdout);
  assert.deepEqual(
    returned.map((list) => list.map((m) => [m.id, m.connection, m.callSupport])),
    lists.map((list) => list.map((m) => [m.id, m.connection, m.callSupport])),
  );
});

test('incomplete local setup is visible but calls fail before networking', async () => {
  const { Catalog, call } = await import('../packages/byokit/index.js');
  const { readFileSync } = await import('node:fs');
  const catalog = new Catalog(
    JSON.parse(readFileSync(new URL('../spec/fixtures/catalog.json', import.meta.url))),
  );
  const placeholder = catalog.getModels().find((model) => model.local);
  assert.equal(placeholder.name, 'Local — configure endpoint');
  assert.equal(placeholder.callSupport.textGeneration, false);
  const [incomplete] = catalog.getModels({
    providerIds: [],
    local: [{ endpoint: 'http://localhost:8080' }],
  });
  assert.equal(incomplete.local.configured, false);
  let requests = 0;
  for (const model of [placeholder, incomplete]) {
    await assert.rejects(
      call(model, 'Hello', '', {
        fetch: async () => {
          requests++;
        },
      }),
    );
  }
  assert.equal(requests, 0);
});

test('both configured local protocols use the regular call API without a key', async () => {
  const { Catalog, call } = await import('../packages/byokit/index.js');
  const { readFileSync } = await import('node:fs');
  const catalog = new Catalog(
    JSON.parse(readFileSync(new URL('../spec/fixtures/catalog.json', import.meta.url))),
  );
  for (const api of ['openai-compatible', 'ollama']) {
    const [model] = catalog.getModels({
      providerIds: [],
      local: [{ endpoint: 'http://localhost:11434', api, modelId: 'installed-model' }],
    });
    let requests = 0;
    const result = await call(model, 'Hello', '', {
      fetch: async (url, options) => {
        requests++;
        assert.equal(
          url,
          `http://localhost:11434${api === 'ollama' ? '/api/chat' : '/v1/chat/completions'}`,
        );
        assert.equal(JSON.parse(options.body).model, 'installed-model');
        assert.equal(options.headers.Authorization, undefined);
        return {
          ok: true,
          json: async () =>
            api === 'ollama'
              ? { message: { content: 'OK' }, done: true }
              : { choices: [{ message: { content: 'OK' } }] },
        };
      },
    });
    assert.equal(result.choices[0].message.content, 'OK');
    assert.equal(requests, 1);
  }
});
