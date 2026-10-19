import test from 'node:test';
import assert from 'node:assert/strict';
import { call, OpenAI, ApiProtocol } from '../packages/byokit/index.js';
import { requestFor } from '../website/inference.js';
const key = 'synthetic-security-test-key';
const localModel = (baseUrl) => ({
  id: 'local/security-test',
  providerId: 'local',
  apiModelId: 'served-model',
  local: { endpoint: baseUrl },
  connection: { baseUrl, protocol: ApiProtocol.OpenAI },
});
const response = () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
});

test('remote HTTP credentials and custom headers fail before fetch; bypass must be boolean', async () => {
  let requests = 0;
  const fetch = async () => {
    requests++;
    return response();
  };
  for (const host of [
    'remote.example',
    'localhost.evil.example',
    '127.0.0.1.evil.example',
    '192.168.1.10',
  ]) {
    const model = localModel(`http://${host}/v1`);
    await assert.rejects(call(model, 'Hello', key, { fetch }), /HTTPS/);
    await assert.rejects(call(model, 'Hello', '', { fetch, headers: { 'api-key': key } }), /HTTPS/);
  }
  await assert.rejects(
    call(localModel('http://remote.example/v1'), 'Hello', key, {
      fetch,
      allowInsecureHttp: 'true',
    }),
    /boolean/,
  );
  assert.equal(requests, 0);
});

test('HTTPS, loopback development, and explicit remote development opt-in still work', async () => {
  let requests = 0;
  const fetch = async (url, options) => {
    requests++;
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    return response();
  };
  for (const base of [
    'https://remote.example/v1',
    'http://localhost:8080/v1',
    'http://127.0.0.1:8080/v1',
    'http://127.0.0.2:8080/v1',
    'http://[::1]:8080/v1',
  ]) {
    await call(localModel(base), 'Hello', key, { fetch });
  }
  await call(localModel('http://192.168.1.10:8080/v1'), 'Hello', key, {
    fetch,
    allowInsecureHttp: true,
  });
  assert.equal(requests, 6);
  await call(localModel('http://remote.example/v1'), 'Hello', '', {
    fetch: async () => response(),
  });
});

test('standard SDK clients enforce transport and forward an explicit development opt-in', async () => {
  let requests = 0;
  const input = { model: 'served-model', messages: [{ role: 'user', content: 'Hello' }] };
  const config = {
    baseURL: 'http://remote.example/v1',
    apiKey: key,
    fetch: async () => {
      requests++;
      return response();
    },
  };
  await assert.rejects(new OpenAI(config).chat.completions.create(input), /HTTPS/);
  assert.equal(requests, 0);
  await new OpenAI({ ...config, allowInsecureHttp: true }).chat.completions.create(input);
  await new OpenAI(config).chat.completions.create(input, { allowInsecureHttp: true });
  assert.equal(requests, 2);
});

test('website request previews reject authenticated remote HTTP, but permit loopback', () => {
  const settings = {
    offeringId: 'local/test',
    providerId: 'local',
    modelId: 'served-model',
    protocol: 'chat',
    prompt: 'Hello',
    maxTokens: 128,
  };
  assert.throws(() => requestFor({ ...settings, endpoint: 'http://remote.example' }, key), /HTTPS/);
  assert.equal(
    requestFor({ ...settings, endpoint: 'http://localhost:8080' }, key).headers.Authorization,
    `Bearer ${key}`,
  );
});
