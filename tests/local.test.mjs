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
  const { LocalApi } = await import('@staff-000/byokit');
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
  const { LocalApi } = await import('@staff-000/byokit');
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
