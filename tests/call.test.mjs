import test from 'node:test';
import assert from 'node:assert/strict';
import * as byokit from '../packages/byokit/catalog.js';
import { providerConnections } from '../packages/byokit/connection.js';
const model = (providerId = 'deepseek') => ({
  id: providerId + '/demo',
  providerId,
  apiModelId: 'served-demo',
  connection: { ...providerConnections[providerId] },
  limits: {
    context: 1000,
    input: 900,
    output: 200,
    contextAccounting: byokit.ContextAccounting.Combined,
  },
  features: { functionCalling: { status: byokit.FeatureStatus.Supported } },
});
const noChecks = { runtimeChecks: false };
const ok = (data) => ({ ok: true, json: async () => data });
const chat = {
  id: 'test',
  model: 'served-demo',
  choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 3, completion_tokens: 1 },
};
const tool = {
  type: 'function',
  function: { name: 'lookup', parameters: { type: 'object', properties: {} } },
};
test('discovery includes endpoint metadata without initiating network or changing API IDs', () => {
  const selected = byokit.getModels({ providerIds: byokit.exact(byokit.ProviderId.DeepSeek) });
  assert.ok(selected.length);
  assert.equal(selected[0].connection.baseUrl, providerConnections.deepseek.baseUrl);
  const [local] = byokit.getModels({
    providerIds: byokit.exact(),
    local: [{ endpoint: 'http://localhost:8080', modelId: 'my-model' }],
  });
  assert.equal(local.connection.baseUrl, 'http://localhost:8080/v1');
  assert.equal(local.apiModelId, 'my-model');
});
test('all hosted adapters route only to selected provider; both formats normalize responses', async () => {
  for (const [providerId, c] of Object.entries(providerConnections)) {
    const data =
      c.protocol === byokit.ApiProtocol.Claude
        ? {
            content: [{ type: 'text', text: 'OK' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 3, output_tokens: 1 },
          }
        : c.protocol === byokit.ApiProtocol.Gemini
          ? {
              candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
              usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 },
            }
          : chat;
    let count = 0;
    const options = {
      ...noChecks,
      fetch: async (url, { body, headers, redirect }) => {
        count++;
        assert.ok(url.startsWith(c.baseUrl));
        assert.equal(redirect, 'error');
        assert.ok(!body.includes('secret'));
        assert.ok(Object.values(headers).some((v) => v.includes('secret')));
        assert.ok(body.includes('served-demo') || url.includes('served-demo'));
        return ok(data);
      },
    };
    assert.equal(
      (await byokit.call(model(providerId), 'Hi', 'secret', options)).choices[0].message.content,
      'OK',
    );
    assert.deepEqual(
      (await byokit.callClaude(model(providerId), 'Hi', 'secret', options)).content,
      [{ type: 'text', text: 'OK' }],
    );
    assert.equal(count, 2);
  }
});
test('system messages, tools, tool choices and tool results translate across formats', () => {
  const input = {
    system: 'Be brief',
    messages: [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'lookup', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'found' }] },
    ],
    tools: [{ name: 'lookup', input_schema: { type: 'object' } }],
    tool_choice: { type: 'tool', name: 'lookup' },
    max_tokens: 100,
    temperature: 0.2,
  };
  const deep = byokit.prepareCall(model(), input, { format: 'claude', runtimeChecks: false }).body;
  assert.equal(deep.messages[0].role, 'system');
  assert.equal(deep.messages[2].role, 'tool');
  assert.equal(deep.tool_choice.function.name, 'lookup');
  const claude = byokit.prepareCall(
    model('anthropic'),
    { messages: deep.messages, tools: [tool], max_tokens: 100 },
    { runtimeChecks: false },
  ).body;
  assert.equal(claude.system, 'Be brief');
  assert.equal(claude.messages[0].content[0].type, 'tool_use');
  assert.equal(claude.messages[1].content[0].type, 'tool_result');
  const gem = byokit.prepareCall(model('google'), input, {
    format: 'claude',
    runtimeChecks: false,
  }).body;
  assert.equal(gem.contents[1].parts[0].functionResponse.name, 'lookup');
  assert.equal(gem.toolConfig.functionCallingConfig.allowedFunctionNames[0], 'lookup');
});
test('tool-only responses return calls without executing a tool or retrying', async () => {
  let calls = 0;
  const r = await byokit.callClaude(
    model(),
    {
      messages: [{ role: byokit.Role.User, content: 'Find it' }],
      tools: [{ name: 'lookup', input_schema: { type: 'object' } }],
    },
    'secret',
    {
      ...noChecks,
      fetch: async () => {
        calls++;
        return ok({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'c',
                    type: 'function',
                    function: { name: 'lookup', arguments: '{"q":"test"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        });
      },
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(r.content, [
    { type: 'tool_use', id: 'c', name: 'lookup', input: { q: 'test' } },
  ]);
  assert.equal(r.stop_reason, 'tool_use');
});
test('known oversized budgets fail when checkBudget is enabled; disabled by default; defaults cap output; bypass does not bypass shape checks', async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return ok(chat);
  };
  // By default, budget checking is disabled, so a call with max_tokens: 201 succeeds through to fetch
  await byokit.call(
    model(),
    { messages: [{ role: byokit.Role.User, content: 'Hi' }], max_tokens: 201 },
    'secret',
    { fetch },
  );
  assert.equal(calls, 1);
  await assert.rejects(
    byokit.call(
      model(),
      { messages: [{ role: byokit.Role.User, content: 'Hi' }], max_tokens: 201 },
      'secret',
      { fetch, checkBudget: true, onWarning() {} },
    ),
    (e) => e.code === 'MODEL_FIT_FAILED',
  );
  assert.equal(calls, 1);
  const defaultWarnings = [];
  await byokit.call(model(), 'Hi', 'secret', { fetch, onWarning: (d) => defaultWarnings.push(d) });
  assert.equal(defaultWarnings.length, 0);
  const warnings = [];
  await byokit.call(model(), 'Hi', 'secret', {
    fetch,
    checkBudget: true,
    onWarning: (d) => warnings.push(d),
  });
  assert.ok(warnings.some((d) => d.code === 'TOKEN_COUNT_UNKNOWN'));
  assert.equal(byokit.prepareCall(model(), 'Hi').body.max_tokens, 200);
  await byokit.call(
    model(),
    { messages: [{ role: byokit.Role.User, content: 'Hi' }], max_tokens: 201 },
    'secret',
    { fetch, runtimeChecks: false },
  );
  assert.equal(calls, 4);
  await assert.rejects(
    byokit.call(
      model(),
      { messages: [{ role: byokit.Role.User, content: 'Hi' }], stream: true },
      'secret',
      { fetch, runtimeChecks: false },
    ),
    (e) => e.code === 'INVALID_REQUEST',
  );
  assert.throws(() =>
    byokit.prepareCall(
      model(),
      { messages: [{ role: 'user', content: 'Hi' }], response_format: {} },
      noChecks,
    ),
  );
  assert.throws(() =>
    byokit.prepareCall(
      { ...model(), connection: { ...model().connection, baseUrl: 'https://key@host.test' } },
      'Hi',
      noChecks,
    ),
  );
  assert.ok(
    byokit
      .checkTask(
        new byokit.Catalog({
          schemaVersion: 1,
          providers: [],
          models: [],
          offerings: [],
          families: [],
          presets: [],
        }),
        { offeringIds: ['custom'] },
      )
      .some((d) => d.code === 'BUDGET_UNDECLARED'),
  );
});
test('timeouts, cancel and failure are terminal, never leak keys or provider errors', async () => {
  const fetch = async (_, { signal }) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) reject(new Error('secret'));
      else signal.addEventListener('abort', () => reject(new Error('secret')), { once: true });
    });
  await assert.rejects(
    byokit.call(model(), 'Hi', 'secret', { ...noChecks, fetch, timeoutMs: 10 }),
    (e) => e.code === 'TIMEOUT',
  );
  const c = new AbortController();
  const pending = byokit.call(model(), 'Hi', 'secret', { ...noChecks, fetch, signal: c.signal });
  c.abort();
  await assert.rejects(pending, (e) => e.code === 'CANCELED');
  await assert.rejects(
    byokit.call(model(), 'Hi', 'secret', {
      ...noChecks,
      fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: 'secret' }) }),
    }),
    (e) => e.code === 'PROVIDER_ERROR' && e.status === 401 && !JSON.stringify(e).includes('secret'),
  );
  await assert.rejects(
    byokit.call(model(), 'Hi', 'secret', {
      ...noChecks,
      fetch: async () => {
        throw new Error('secret');
      },
    }),
    (e) => !e.message.includes('secret'),
  );
  const result = await byokit.call(model(), 'Hi', 'secret', {
    ...noChecks,
    fetch: async () =>
      ok({ ...chat, model: 'secret', choices: [{ message: { content: 'secret' } }] }),
  });
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test('concurrent calls do not share keys, model selection or cancellation', async () => {
  const keys = [];
  const fetch = async (_, { headers, body }) => {
    keys.push(headers.Authorization);
    await new Promise((r) => setTimeout(r, 5));
    return ok({ ...chat, model: JSON.parse(body).model });
  };
  const [a, b] = await Promise.all([
    byokit.call(model(), 'A', 'key-A', { ...noChecks, fetch }),
    byokit.call({ ...model(), apiModelId: 'second' }, 'B', 'key-B', { ...noChecks, fetch }),
  ]);
  assert.deepEqual(keys, ['Bearer key-A', 'Bearer key-B']);
  assert.equal(a.model, 'served-demo');
  assert.equal(b.model, 'second');
});

test('known input context upper bounds reject oversize even when combined accounting is unknown', () => {
  const m = {
    ...model(),
    limits: {
      context: 100,
      input: null,
      output: 200,
      contextAccounting: byokit.ContextAccounting.Unknown,
    },
  };
  // By default, budget checking is disabled, so inputTokens > context does not throw
  const defaultPrep = byokit.prepareCall(m, 'Hi', { inputTokens: 101 });
  assert.equal(defaultPrep.diagnostics.length, 0);
  assert.throws(
    () => byokit.prepareCall(m, 'Hi', { inputTokens: 101, checkBudget: true }),
    (e) => e.code === 'MODEL_FIT_FAILED',
  );
  assert.ok(
    byokit
      .prepareCall(m, 'Hi', { inputTokens: 99, checkBudget: true })
      .diagnostics.some((d) => d.code === 'CONTEXT_UNVERIFIED'),
  );
});

test('native Claude content order and stop sequence survive normalization without private fields', async () => {
  const content = [
    { type: 'text', text: 'First' },
    { type: 'tool_use', id: 't', name: 'lookup', input: {} },
    { type: 'text', text: 'Last' },
  ];
  const fetch = async () => ok({ content, stop_reason: 'stop_sequence', stop_sequence: 'END' });
  const c = await byokit.callClaude(model('anthropic'), 'Hi', 'key', {
    runtimeChecks: false,
    fetch,
  });
  assert.deepEqual(c.content, content);
  assert.equal(c.stop_reason, 'stop_sequence');
  assert.equal(c.stop_sequence, 'END');
  const o = await byokit.call(model('anthropic'), 'Hi', 'key', { runtimeChecks: false, fetch });
  assert.ok(!Object.keys(o).some((k) => k.startsWith('_')));
});

test('Gemini thinking parts, thoughtSignature, and reasoning content parse correctly', async () => {
  const geminiModel = model('google');
  // 1. Thinking part + final answer part
  const resWithThinking = await byokit.call(geminiModel, 'Hi', 'key', {
    ...noChecks,
    fetch: async () =>
      ok({
        candidates: [
          {
            content: {
              parts: [{ text: 'Thinking process...', thought: true }, { text: 'Final answer' }],
            },
            finishReason: 'STOP',
          },
        ],
      }),
  });
  assert.equal(resWithThinking.choices[0].message.content, 'Final answer');
  assert.equal(resWithThinking.choices[0].message.reasoning_content, 'Thinking process...');

  // 2. Thought signature
  const resWithSignature = await byokit.call(geminiModel, 'Hi', 'key', {
    ...noChecks,
    fetch: async () =>
      ok({
        candidates: [
          {
            content: {
              parts: [
                { text: 'Thinking...', thought: true },
                { text: 'Signed answer', thoughtSignature: 'sig123' },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      }),
  });
  assert.equal(resWithSignature.choices[0].message.content, 'Signed answer');
  assert.equal(resWithSignature.choices[0].message.reasoning_content, 'Thinking...');

  // 3. Only thinking parts never become visible answers
  await assert.rejects(
    byokit.call(geminiModel, 'Hi', 'key', {
      ...noChecks,
      fetch: async () =>
        ok({
          candidates: [
            {
              content: {
                parts: [{ text: 'Deep thoughts only', thought: true }],
              },
              finishReason: 'STOP',
            },
          ],
        }),
    }),
    (error) => error.code === 'EMPTY_RESPONSE' && error.completion.reasoningPresent === true,
  );
});

function callRuntime(t, kind) {
  const worker = class {
    static [Symbol.hasInstance](value) {
      return kind === 'module-worker' && value === globalThis;
    }
  };
  const values = {
    window: kind === 'page' ? {} : undefined,
    importScripts: kind === 'classic-worker' ? () => {} : undefined,
    WorkerGlobalScope: kind === 'module-worker' ? worker : undefined,
  };
  for (const [name, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
}

for (const runtime of ['page', 'classic-worker', 'module-worker', 'node']) {
  test(`Claude browser access header covers ${runtime} without changing other provider authentication`, async (t) => {
    callRuntime(t, runtime);
    for (const [providerId, connection] of Object.entries(providerConnections)) {
      const native = connection.protocol === byokit.ApiProtocol.Claude;
      const gemini = connection.protocol === byokit.ApiProtocol.Gemini;
      const data = native
        ? { content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn' }
        : gemini
          ? { candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] }
          : chat;
      let calls = 0;
      const options = {
        ...noChecks,
        fetch: async (_, { headers }) => {
          ++calls;
          const actual = new Headers(headers);
          assert.equal(
            actual.get('anthropic-dangerous-direct-browser-access'),
            native && runtime !== 'node' ? 'true' : null,
          );
          assert.equal(actual.get('x-api-key'), native ? 'test-key' : null);
          assert.equal(actual.get('anthropic-version'), native ? '2023-06-01' : null);
          assert.equal(actual.get('x-goog-api-key'), gemini ? 'test-key' : null);
          assert.equal(actual.get('authorization'), !native && !gemini ? 'Bearer test-key' : null);
          return ok(data);
        },
      };
      assert.equal(
        (await byokit.call(model(providerId), 'Hi', 'test-key', options)).choices[0].message
          .content,
        'OK',
      );
      // NutEgg uses the reusable OpenAI-shaped client with the Claude protocol.
      const client = new byokit.OpenAI({
        baseURL: connection.baseUrl,
        protocol: connection.protocol,
        models: [model(providerId)],
        apiKey: 'test-key',
        ...options,
      });
      assert.equal(
        (
          await client.chat.completions.create({
            model: 'served-demo',
            messages: [{ role: 'user', content: 'Hi' }],
          })
        ).choices[0].message.content,
        'OK',
      );
      assert.equal(calls, 2);
    }
  });
}

test('Claude custom headers remain configurable in worker contexts', async (t) => {
  callRuntime(t, 'module-worker');
  await byokit.call(model('anthropic'), 'Hi', 'test-key', {
    ...noChecks,
    headers: { 'anthropic-dangerous-direct-browser-access': 'false' },
    fetch: async (_, { headers }) => {
      assert.equal(new Headers(headers).get('anthropic-dangerous-direct-browser-access'), 'false');
      return ok({ content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn' });
    },
  });
});
