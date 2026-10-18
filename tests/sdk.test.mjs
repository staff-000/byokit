import test from 'node:test';
import assert from 'node:assert/strict';
import * as byokit from '../packages/byokit/catalog.js';
const [model] = byokit.getModels({ providerIds: byokit.exact(byokit.ProviderId.DeepSeek) });
const response = () => ({
  ok: true,
  json: async () => ({
    model: 'served',
    choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
  }),
});
const input = { model: model.apiModelId, messages: [{ role: byokit.Role.User, content: 'Hello' }] };
test('SDK method shape, factory/constructor aliases, both formats, and no request at construction', async () => {
  let requests = 0,
    reads = 0;
  const options = {
    model,
    apiKey: () => {
      reads++;
      return 'dummy';
    },
    runtimeChecks: false,
    fetch: async () => {
      requests++;
      return response();
    },
  };
  const clients = [byokit.openAI(options), new byokit.OpenAI(options)];
  const claude = [byokit.claude(options), new byokit.Anthropic(options)];
  assert.equal(requests, 0);
  assert.equal(reads, 0);
  for (const c of clients)
    assert.equal((await c.chat.completions.create(input)).choices[0].message.content, 'OK');
  for (const c of claude)
    assert.deepEqual((await c.messages.create(input)).content, [{ type: 'text', text: 'OK' }]);
  assert.equal(requests, 4);
  assert.equal(reads, 4);
});
test('each request reads the current application key; inspection and serialization contain no key', async () => {
  let key = 'key-A';
  const sent = [];
  const client = byokit.openAI({
    model,
    apiKey: () => key,
    runtimeChecks: false,
    fetch: async (_, o) => {
      sent.push(o.headers.Authorization);
      return response();
    },
  });
  await client.chat.completions.create(input);
  key = 'key-B';
  await client.chat.completions.create(input);
  assert.deepEqual(sent, ['Bearer key-A', 'Bearer key-B']);
  assert.ok(!JSON.stringify(client).includes('key-'));
  assert.throws(
    () => byokit.openAI({ model, apiKey: 'do-not-retain-this' }),
    (e) => e.code === 'INVALID_REQUEST' && !e.message.includes('do-not-retain-this'),
  );
});
test('requests capture configuration before async credential reads, with defaults and overrides', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  let body;
  const config = {
    model: structuredClone(model),
    apiKey: () => gate,
    runtimeChecks: false,
    fetch: async (_, o) => {
      body = JSON.parse(o.body);
      return response();
    },
  };
  const client = byokit.openAI(config);
  const p = structuredClone(input),
    job = client.chat.completions.create(p);
  p.messages[0].content = 'changed';
  config.model.apiModelId = 'changed';
  release('dummy');
  await job;
  assert.equal(body.model, model.apiModelId);
  assert.equal(body.messages[0].content, 'Hello');
  await assert.rejects(
    client.chat.completions.create(input, { runtimeChecks: true, inputTokens: 1e12 }),
    (e) => e.code === 'MODEL_FIT_FAILED',
  );
});
test('invalid shapes and key-read errors fail without inference or secret details', async () => {
  let requests = 0,
    reads = 0;
  const c = byokit.openAI({
    model,
    apiKey: () => {
      reads++;
      throw new Error('dummy-secret');
    },
    fetch: async () => {
      requests++;
      return response();
    },
    runtimeChecks: false,
  });
  await assert.rejects(
    c.chat.completions.create({ ...input, stream: true }),
    (e) => e.code === 'INVALID_REQUEST',
  );
  assert.equal(reads, 0);
  await assert.rejects(
    c.chat.completions.create(input),
    (e) => e.code === 'CREDENTIAL_ERROR' && !e.message.includes('dummy-secret'),
  );
  assert.equal(requests, 0);
});
test('cancel and timeout fence asynchronous key reads; late resolution cannot issue inference', async () => {
  let release,
    requests = 0;
  const gate = new Promise((r) => (release = r)),
    c = byokit.openAI({
      model,
      apiKey: () => gate,
      fetch: async () => {
        requests++;
        return response();
      },
      runtimeChecks: false,
    });
  const controller = new AbortController(),
    job = c.chat.completions.create(input, { signal: controller.signal });
  controller.abort();
  await assert.rejects(job, (e) => e.code === 'CANCELED');
  release('dummy');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(requests, 0);
  const timeout = byokit.openAI({
    model,
    apiKey: () => new Promise(() => {}),
    runtimeChecks: false,
  });
  await assert.rejects(
    timeout.chat.completions.create(input, { timeoutMs: 5 }),
    (e) => e.code === 'TIMEOUT',
  );
});
test('custom model ID keeps the provider endpoint and uses unknown fit metadata', async () => {
  const requests = [],
    warnings = [];
  const c = byokit.openAI({
    model,
    apiKey: () => 'dummy',
    fetch: async (url, o) => {
      requests.push({ url, body: JSON.parse(o.body) });
      return response();
    },
    onWarning: (d) => warnings.push(d),
  });
  await c.chat.completions.create({ ...input, model: 'custom-id', max_tokens: 2000000 });
  assert.equal(warnings.length, 0);
  await c.chat.completions.create(
    { ...input, model: 'custom-id', max_tokens: 2000000 },
    { checkBudget: true },
  );
  assert.equal(requests[0].body.model, 'custom-id');
  assert.ok(requests[0].url.startsWith(model.connection.baseUrl));
  assert.ok(warnings.some((d) => d.code === 'OUTPUT_LIMIT_UNKNOWN'));
});

test('unauthenticated local SDK clients can omit the key callback', async () => {
  const [local] = byokit.getModels({
    providerIds: byokit.exact(),
    local: [{ endpoint: 'http://localhost:8080/v1', modelId: 'local-model' }],
  });
  const c = byokit.openAI({
    model: local,
    runtimeChecks: false,
    fetch: async (_, options) => {
      assert.equal(options.headers.Authorization, undefined);
      return response();
    },
  });
  assert.equal(
    (await c.chat.completions.create({ messages: [{ role: byokit.Role.User, content: 'Hi' }] }))
      .choices[0].message.content,
    'OK',
  );
});

test('Byokit is credential-free and supports both formats on one client', async () => {
  const c = new byokit.Byokit({ runtimeChecks: false });
  let calls = 0;
  const opts = {
    apiKey: 'per-call-secret',
    fetch: async (_, o) => {
      calls++;
      assert.equal(o.headers.Authorization, 'Bearer per-call-secret');
      return response();
    },
  };
  assert.equal(calls, 0);
  assert.equal(
    (await c.chat.completions.create({ ...input, model }, opts)).choices[0].message.content,
    'OK',
  );
  assert.deepEqual((await c.messages.create({ ...input, model }, opts)).content, [
    { type: 'text', text: 'OK' },
  ]);
  assert.equal(calls, 2);
  assert.ok(!JSON.stringify(c).includes('per-call-secret'));
  assert.throws(
    () => new byokit.Byokit({ apiKey: 'per-call-secret' }),
    (e) => e.code === 'INVALID_REQUEST' && !e.message.includes('per-call-secret'),
  );
});
test('one Byokit client isolates concurrent providers, keys, models and input snapshots', async () => {
  const c = new byokit.Byokit({ runtimeChecks: false }),
    seen = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const other = byokit.appendModel([], {
    providerId: byokit.customProviderId('acme'),
    modelId: 'acme-model',
    baseUrl: 'https://acme.example/v1',
    protocol: byokit.ApiProtocol.OpenAI,
  })[0];
  const fetch = async (url, o) => {
    seen.push({ url, headers: o.headers, body: JSON.parse(o.body) });
    await gate;
    return response();
  };
  const a = { model: structuredClone(model), messages: [{ role: byokit.Role.User, content: 'A' }] };
  const b = { model: other, messages: [{ role: byokit.Role.User, content: 'B' }] };
  const jobs = [
    c.chat.completions.create(a, { apiKey: 'key-A', fetch }),
    c.chat.completions.create(b, { apiKey: 'key-B', fetch }),
  ];
  a.model.apiModelId = 'mutated';
  a.messages[0].content = 'mutated';
  b.model.connection.baseUrl = 'https://wrong.example';
  release();
  await Promise.all(jobs);
  assert.deepEqual(
    seen.map((r) => [r.headers.Authorization, r.body.model, r.body.messages[0].content]),
    [
      ['Bearer key-A', model.apiModelId, 'A'],
      ['Bearer key-B', 'acme-model', 'B'],
    ],
  );
  assert.ok(seen[0].url.startsWith(model.connection.baseUrl));
  assert.equal(seen[1].url, 'https://acme.example/v1/chat/completions');
});
test('Byokit defaults, fit checks, per-request overrides and format validation', async () => {
  const c = new byokit.Byokit();
  let requests = 0;
  const opts = {
    apiKey: 'dummy',
    fetch: async () => {
      requests++;
      return response();
    },
  };
  await assert.rejects(
    c.chat.completions.create(
      { ...input, model },
      { ...opts, inputTokens: 1e12, checkBudget: true },
    ),
    (e) => e.code === 'MODEL_FIT_FAILED',
  );
  await c.chat.completions.create({ ...input, model }, { ...opts, inputTokens: 1e12 });
  await assert.rejects(
    c.chat.completions.create({ ...input, model, stream: true }, { ...opts, runtimeChecks: false }),
    (e) => e.code === 'INVALID_REQUEST',
  );
  await assert.rejects(
    c.chat.completions.create({ ...input, model: 'a-string' }, opts),
    (e) => e.code === 'INVALID_REQUEST',
  );
  await assert.rejects(
    c.chat.completions.create({ ...input, model }, { ...opts, runtimeChecks: 'no' }),
    (e) => e.code === 'INVALID_REQUEST',
  );
  await assert.rejects(
    c.chat.completions.create({ ...input, model }, { ...opts, arbitrary: 'x' }),
    (e) => e.code === 'INVALID_REQUEST',
  );
  await assert.rejects(
    c.chat.completions.create({ ...input, model }, { fetch: opts.fetch }),
    (e) => e.code === 'INVALID_REQUEST',
  );
  await assert.rejects(
    c.chat.completions.create({ ...input, model }, { ...opts, apiKey: () => 'dummy' }),
    (e) => e.code === 'INVALID_REQUEST',
  );
  assert.equal(requests, 1);
});
test('Byokit routes both public formats identically to helpers across native protocols', async () => {
  const c = new byokit.Byokit({ runtimeChecks: false });
  for (const provider of [
    byokit.ProviderId.DeepSeek,
    byokit.ProviderId.Anthropic,
    byokit.ProviderId.Google,
  ]) {
    const [offering] = byokit.getModels({
      providerIds: byokit.exact(provider),
      local: false,
      filters: { callable: true },
    });
    const data =
      provider === byokit.ProviderId.Anthropic
        ? { content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn' }
        : provider === byokit.ProviderId.Google
          ? { candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] }
          : { choices: [{ message: { content: 'OK' } }] };
    for (const format of ['openai', 'claude']) {
      const seen = [],
        opts = {
          apiKey: 'dummy',
          runtimeChecks: false,
          fetch: async (url, o) => {
            seen.push({ url, body: JSON.parse(o.body), headers: o.headers });
            return { ok: true, json: async () => data };
          },
        };
      const params = { messages: [{ role: byokit.Role.User, content: 'Hi' }] };
      const actual = await (format === 'openai' ? c.chat.completions : c.messages).create(
        { model: offering, ...params },
        opts,
      );
      const expected = await (format === 'openai' ? byokit.call : byokit.callClaude)(
        offering,
        params,
        'dummy',
        opts,
      );
      assert.deepEqual(seen[0], seen[1]);
      assert.deepEqual(Object.keys(actual), Object.keys(expected));
      assert.equal(
        format === 'openai' ? actual.choices[0].message.content : actual.content[0].text,
        'OK',
      );
    }
  }
});
test('Byokit cancellation and deadlines propagate; failures cannot expose keys', async () => {
  const c = new byokit.Byokit({ runtimeChecks: false, timeoutMs: 5 });
  const fetch = async (_, o) =>
    new Promise((resolve, reject) => {
      if (o.signal.aborted) reject(new Error('secret'));
      o.signal.addEventListener('abort', () => reject(new Error('secret')), { once: true });
    });
  await assert.rejects(
    c.chat.completions.create({ ...input, model }, { apiKey: 'secret', fetch }),
    (e) => e.code === 'TIMEOUT' && !e.message.includes('secret'),
  );
  const controller = new AbortController(),
    job = c.chat.completions.create(
      { ...input, model },
      { apiKey: 'secret', fetch, signal: controller.signal, timeoutMs: 1000 },
    );
  controller.abort();
  await assert.rejects(job, (e) => e.code === 'CANCELED');
  await assert.rejects(
    c.chat.completions.create(
      { ...input, model },
      {
        apiKey: 'secret',
        fetch: async () => {
          throw new Error('secret');
        },
      },
    ),
    (e) => e.code === 'NETWORK_ERROR' && !e.message.includes('secret'),
  );
  const r = await c.chat.completions.create(
    { ...input, model },
    {
      apiKey: 'secret',
      fetch: async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'secret' } }] }),
      }),
    },
  );
  assert.equal(r.choices[0].message.content, '[redacted]');
});
test('Byokit local requests can omit authentication without sharing a previous key', async () => {
  const [local] = byokit.getModels({
    providerIds: byokit.exact(),
    local: [{ endpoint: 'http://localhost:8080/v1', modelId: 'local-model' }],
  });
  const c = new byokit.Byokit({ runtimeChecks: false });
  await c.chat.completions.create(
    { ...input, model },
    { apiKey: 'hosted-secret', fetch: async () => response() },
  );
  await c.chat.completions.create(
    { ...input, model: local },
    {
      fetch: async (_, o) => {
        assert.equal(o.headers.Authorization, undefined);
        return response();
      },
    },
  );
});

test('standard OpenAI constructor reuses one account and endpoint across request model IDs', async () => {
  let count = 0;
  const seen = [],
    config = {
      baseURL: 'https://openrouter.ai/api/v1/',
      apiKey: 'account-key',
      defaultHeaders: { 'HTTP-Referer': 'https://app.example', 'X-OpenRouter-Title': 'App' },
      runtimeChecks: false,
      fetch: async (url, o) => {
        count++;
        seen.push({ url, body: JSON.parse(o.body), headers: o.headers });
        return response();
      },
    };
  const c = new byokit.OpenAI(config);
  assert.equal(count, 0);
  config.apiKey = 'changed';
  config.baseURL = 'https://wrong.example';
  config.defaultHeaders['X-OpenRouter-Title'] = 'changed';
  await c.chat.completions.create({ ...input, model: 'provider/model-A' });
  await c.chat.completions.create(
    { ...input, model: 'provider/model-B' },
    { headers: { 'x-openrouter-title': 'Second call' } },
  );
  assert.deepEqual(
    seen.map((r) => [r.url, r.headers.Authorization, r.body.model]),
    [
      ['https://openrouter.ai/api/v1/chat/completions', 'Bearer account-key', 'provider/model-A'],
      ['https://openrouter.ai/api/v1/chat/completions', 'Bearer account-key', 'provider/model-B'],
    ],
  );
  assert.equal(seen[0].headers['http-referer'], 'https://app.example');
  assert.equal(seen[0].headers['x-openrouter-title'], 'App');
  assert.equal(seen[1].headers['x-openrouter-title'], 'Second call');
  assert.ok(!JSON.stringify(c).includes('account-key'));
});
test('standard Anthropic uses Claude wire format and normalizes root or /v1 bases', async () => {
  for (const baseURL of ['https://api.tokenify.example', 'https://api.tokenify.example/v1/']) {
    const c = new byokit.Anthropic({
      baseURL,
      apiKey: 'claude-key',
      runtimeChecks: false,
      fetch: async (url, o) => {
        assert.equal(url, 'https://api.tokenify.example/v1/messages');
        assert.equal(o.headers['x-api-key'], 'claude-key');
        assert.equal(o.headers.Authorization, undefined);
        const body = JSON.parse(o.body);
        assert.equal(body.model, 'deepseek/example');
        assert.equal(body.max_tokens, 1024);
        assert.equal(body.system, 'Be concise.');
        return {
          ok: true,
          json: async () => ({
            content: [{ type: 'text', text: 'B-trees' }],
            stop_reason: 'end_turn',
          }),
        };
      },
    });
    const r = await c.messages.create({
      model: 'deepseek/example',
      max_tokens: 1024,
      system: 'Be concise.',
      messages: [{ role: byokit.Role.User, content: 'Explain B-trees' }],
    });
    assert.equal(r.content[0].text, 'B-trees');
  }
});
test('standard clients scope metadata to exact endpoint/protocol and never borrow limits', async () => {
  const c = new byokit.OpenAI({
    baseURL: model.connection.baseUrl,
    apiKey: 'dummy',
    models: [model],
    fetch: async () => response(),
  });
  await c.chat.completions.create({ ...input, max_tokens: 1e12 });
  await assert.rejects(
    c.chat.completions.create({ ...input, max_tokens: 1e12 }, { checkBudget: true }),
    (e) => e.code === 'MODEL_FIT_FAILED',
  );
  const defaultWarnings = [];
  await c.chat.completions.create(
    { ...input, model: 'custom-id', max_tokens: 1e12 },
    { onWarning: (d) => defaultWarnings.push(d) },
  );
  assert.equal(defaultWarnings.length, 0);
  const warnings = [];
  await c.chat.completions.create(
    { ...input, model: 'custom-id', max_tokens: 1e12 },
    { checkBudget: true, onWarning: (d) => warnings.push(d) },
  );
  assert.ok(warnings.some((d) => d.code === 'OUTPUT_LIMIT_UNKNOWN'));
  assert.throws(
    () => new byokit.OpenAI({ baseURL: 'https://wrong.example', apiKey: 'dummy', models: [model] }),
    (e) => e.code === 'INVALID_REQUEST',
  );
  assert.throws(
    () =>
      new byokit.OpenAI({
        baseURL: model.connection.baseUrl,
        apiKey: 'dummy',
        models: [model, model],
      }),
    (e) => e.code === 'INVALID_REQUEST',
  );
});
test('standard clients reject credential/destination overrides and malformed headers before sending', async () => {
  let requests = 0;
  const c = new byokit.OpenAI({
    baseURL: 'http://localhost:8080/v1',
    apiKey: 'key',
    runtimeChecks: false,
    fetch: async () => {
      requests++;
      return response();
    },
  });
  for (const requestOptions of [
    { apiKey: 'other' },
    { baseURL: 'https://other.example' },
    { headers: { Authorization: 'other' } },
    { headers: { 'X-Test': 'line\nbreak' } },
  ])
    await assert.rejects(
      c.chat.completions.create(input, requestOptions),
      (e) => e.code === 'INVALID_REQUEST',
    );
  for (const params of [
    { ...input, model },
    { ...input, stream: true },
    { ...input, model: '' },
  ])
    await assert.rejects(c.chat.completions.create(params), (e) => e.code === 'INVALID_REQUEST');
  for (const config of [
    { apiKey: 'key', baseURL: 'https://key@evil.example' },
    { apiKey: 'key', baseURL: 'https://example.com?token=key' },
    { apiKey: 'key', defaultHeaders: { Cookie: 'session' } },
    { baseURL: 'https://example.com' },
  ])
    assert.throws(
      () => new byokit.OpenAI(config),
      (e) => e.code === 'INVALID_REQUEST',
    );
  assert.equal(requests, 0);
});
test('standard client concurrent calls have independent cancellation, fixed keys and no retry', async () => {
  let requests = 0;
  const c = new byokit.OpenAI({
    baseURL: model.connection.baseUrl,
    apiKey: 'secret',
    runtimeChecks: false,
    fetch: async (_, o) => {
      requests++;
      if (JSON.parse(o.body).model === 'wait')
        return new Promise((resolve, reject) =>
          o.signal.addEventListener('abort', () => reject(new Error('secret')), { once: true }),
        );
      return response();
    },
  });
  const abort = new AbortController(),
    waiting = c.chat.completions.create({ ...input, model: 'wait' }, { signal: abort.signal });
  const r = await c.chat.completions.create({ ...input, model: 'ready' });
  abort.abort();
  await assert.rejects(waiting, (e) => e.code === 'CANCELED' && !e.message.includes('secret'));
  assert.equal(r.choices[0].message.content, 'OK');
  assert.equal(requests, 2);
  const broken = new byokit.OpenAI({
    apiKey: 'secret',
    runtimeChecks: false,
    fetch: async () => {
      throw new Error('secret');
    },
  });
  await assert.rejects(
    broken.chat.completions.create(input),
    (e) => e.code === 'NETWORK_ERROR' && !e.message.includes('secret'),
  );
});
test('standard clients explicitly support unauthenticated local APIs and native adapter overrides', async () => {
  const c = new byokit.OpenAI({
    baseURL: 'http://localhost:11434',
    protocol: byokit.ApiProtocol.Ollama,
    apiKey: '',
    runtimeChecks: false,
    fetch: async (url, o) => {
      assert.equal(url, 'http://localhost:11434/api/chat');
      assert.equal(o.headers.Authorization, undefined);
      return { ok: true, json: async () => ({ message: { content: 'Local OK' } }) };
    },
  });
  assert.equal(
    (await c.chat.completions.create({ ...input, model: 'my-local' })).choices[0].message.content,
    'Local OK',
  );
});
