import * as byokit from '../packages/core/catalog.js';
import { tutorials } from '../website/tutorials.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { requestExample, nativeRequestExample } from '../website/request-examples.js';
import { requestFor, ProviderApi } from '../website/inference.js';
const settings = {
  providerId: 'deepseek',
  modelId: 'selected-model',
  protocol: 'chat',
  prompt: `Reply with "OK". Don't execute $(echo nope).\nSecond line.`,
  maxTokens: 128,
};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
test('JavaScript request examples reproduce settings and use only the environment key', async () => {
  for (const [providerId, provider] of Object.entries(ProviderApi))
    for (const protocol of provider.protocols) {
      const captured = { ...settings, providerId, protocol, endpoint: 'http://localhost:8080/v1' },
        expected = requestFor(captured, 'dummy-env-key'),
        code = nativeRequestExample(captured, 'javascript', { authenticated: true });
      assert.ok(!code.includes('EXAMPLE_API_KEY'));
      let called = 0;
      await new AsyncFunction('fetch', 'process', 'AbortSignal', 'console', code)(
        async (url, options) => {
          called++;
          assert.equal(url, expected.url);
          assert.deepEqual(options.headers, expected.headers);
          assert.deepEqual(JSON.parse(options.body), expected.body);
          assert.equal(options.redirect, 'error');
          return { ok: true, json: async () => ({ answer: 'OK' }) };
        },
        { env: { API_KEY: 'dummy-env-key' } },
        AbortSignal,
        { log() {} },
      );
      assert.equal(called, 1);
    }
});
test('Python request examples handle quoting, JSON booleans, authentication and redirect rejection', () => {
  const code = nativeRequestExample(settings, 'python');
  const runner = `import sys,os,json
from unittest.mock import patch,MagicMock
os.environ['API_KEY']='dummy-env-key'
request_capture=[]
class Result:
 def __enter__(self): return self
 def __exit__(self,*args): pass
 def read(self): return b'{"answer":"OK"}'
def open_request(request,timeout):
 request_capture.append({'url':request.full_url,'headers':dict(request.header_items()),'body':json.loads(request.data),'timeout':timeout})
 return Result()
opener=MagicMock();opener.open=open_request
with patch('urllib.request.build_opener',return_value=opener):
 exec(json.loads(sys.stdin.read()))
print(json.dumps(request_capture))`;
  const run = spawnSync('python3', ['-c', runner], {
    input: JSON.stringify(code),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const records = JSON.parse(run.stdout.trim().split('\n').at(-1));
  assert.equal(records[0].headers.Authorization, 'Bearer dummy-env-key');
  assert.equal(records[0].body.messages[0].content, settings.prompt);
  assert.equal(records[0].body.stream, false);
  assert.match(code, /class NoRedirect/);
});
test('cURL uses an environment placeholder and safely quotes arbitrary prompt text', () => {
  const code = requestExample(settings, 'curl');
  assert.ok(code.includes('$API_KEY'));
  assert.ok(!code.includes('EXAMPLE_API_KEY'));
  // Parse by running a mock curl function; no actual command/network request.
  const run = spawnSync(
    '/bin/sh',
    [
      '-c',
      `curl(){ printf '%s\n' "$@"; }
API_KEY=dummy-env-key
${code}`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('Authorization: Bearer dummy-env-key'));
  const body = run.stdout.split('--data-raw\n')[1].trim();
  assert.equal(JSON.parse(body).messages[0].content, settings.prompt);
});
test('local requests without authentication contain no key placeholder', () => {
  const code = requestExample(
    { ...settings, providerId: 'local', endpoint: 'http://localhost:8080' },
    'javascript',
  );
  assert.ok(!code.includes('API_KEY'));
  assert.ok(!code.includes('Authorization'));
});

test('copyable SDK snippets preserve exact settings and constructor credentials', async () => {
  const code = requestExample(settings, 'javascript');
  let calls = 0;
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, o) => {
      calls++;
      const expected = requestFor(settings, 'dummy-env-key');
      assert.equal(url, expected.url);
      assert.deepEqual(JSON.parse(o.body), expected.body);
      assert.equal(o.headers.Authorization, 'Bearer dummy-env-key');
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) };
    };
    await new AsyncFunction('byokit', 'process', 'console', code.replace(/^import.*;\n/, ''))(
      byokit,
      { env: { API_KEY: 'dummy-env-key' } },
      { log() {} },
    );
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls, 1);
  const py = requestExample(settings, 'python');
  const run = spawnSync(
    'python3',
    [
      '-c',
      `import sys,json,os
from unittest.mock import patch
sys.path.insert(0,'packages/python/src');sys.path.insert(0,'packages/python/tests')
from test_calls import Connection
os.environ['API_KEY']='dummy-env-key'
Connection.requests=[];Connection.response_data={'choices':[{'message':{'content':'OK'}}]}
with patch('byokit.inference.http.client.HTTPSConnection',Connection):
 exec(json.loads(sys.stdin.read()))
assert Connection.requests[0][1]['model']=='selected-model'
assert Connection.requests[0][1]['messages'][0]['content']==${JSON.stringify(settings.prompt)}
assert Connection.requests[0][2]['Authorization']=='Bearer dummy-env-key'
`,
    ],
    { input: JSON.stringify(py), encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), 'OK');
});
test('website client tutorials execute both formats through the real SDK', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url) => {
      calls++;
      return {
        ok: true,
        json: async () =>
          url.endsWith('/messages')
            ? { content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn' }
            : { choices: [{ message: { content: 'OK' } }] },
      };
    };
    for (const kind of ['inference', 'claude']) {
      const logs = [];
      await new AsyncFunction(
        'byokit',
        'process',
        'console',
        tutorials[kind].typescript.replace(/^import.*;\n/, ''),
      )(
        byokit,
        { env: { DEEPSEEK_API_KEY: 'dummy', ANTHROPIC_API_KEY: 'dummy' } },
        { log: (value) => logs.push(value) },
      );
      assert.deepEqual(logs, [kind === 'inference' ? 'OK' : [{ type: 'text', text: 'OK' }]]);
    }
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls, 2);
});

test('SDK snippets route exact offering IDs and local URLs across every supported protocol', async () => {
  const original = globalThis.fetch;
  try {
    for (const [providerId, provider] of Object.entries(ProviderApi))
      for (const protocol of provider.protocols) {
        const selected = {
            ...settings,
            providerId,
            protocol,
            endpoint: 'http://localhost:8080/v1',
          },
          expected = requestFor(selected, 'dummy-env-key');
        let called = 0;
        globalThis.fetch = async (url, o) => {
          called++;
          assert.equal(url, expected.url);
          assert.deepEqual(JSON.parse(o.body), expected.body);
          for (const [key, value] of Object.entries(expected.headers))
            if (key !== 'anthropic-dangerous-direct-browser-access')
              assert.equal(o.headers[key], value);
          const data =
            protocol === 'anthropic'
              ? { content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn' }
              : protocol === 'gemini'
                ? { candidates: [{ content: { parts: [{ text: 'OK' }] } }] }
                : protocol === 'ollama'
                  ? { message: { content: 'OK' } }
                  : { choices: [{ message: { content: 'OK' } }] };
          return { ok: true, json: async () => data };
        };
        await new AsyncFunction(
          'byokit',
          'process',
          'console',
          requestExample(selected, 'javascript', { authenticated: true }).replace(
            /^import.*;\n/,
            '',
          ),
        )(byokit, { env: { API_KEY: 'dummy-env-key' } }, { log() {} });
        assert.equal(called, 1);
      }
  } finally {
    globalThis.fetch = original;
  }
});

test('hero call helper and Python SDK examples execute through the library', async () => {
  const html = await readFile(new URL('../website/index.html', import.meta.url), 'utf8');
  const code = html
    .match(/<pre[^>]*id="hero-code"[^>]*>\s*<code>([\s\S]*?)<\/code><\/pre>/)[1]
    .replace(/<[^>]+>/g, '');
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (_url, o) => {
      calls++;
      assert.equal(o.headers.Authorization, 'Bearer dummy');
      assert.equal(typeof JSON.parse(o.body).model, 'string');
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) };
    };
    await new AsyncFunction('byokit', 'apiKey', 'console', code.replace(/^import[\s\S]*?;\n/, ''))(
      byokit,
      'dummy',
      { log() {} },
    );
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls, 1);
  for (const kind of ['inference', 'claude']) {
    const runner = `import sys,json,os
from unittest.mock import patch
sys.path.insert(0,'packages/python/src');sys.path.insert(0,'packages/python/tests')
from test_calls import Connection
os.environ['DEEPSEEK_API_KEY']='dummy';os.environ['ANTHROPIC_API_KEY']='dummy'
Connection.requests=[];Connection.response_data=${kind === 'claude' ? "{'content':[{'type':'text','text':'OK'}],'stop_reason':'end_turn'}" : "{'choices':[{'message':{'content':'OK'}}]}"}
with patch('byokit.inference.http.client.HTTPSConnection',Connection):
 exec(json.loads(sys.stdin.read()))
assert len(Connection.requests)==1
assert isinstance(Connection.requests[0][1]['model'],str)`;
    const run = spawnSync('python3', ['-c', runner], {
      input: JSON.stringify(tutorials[kind].python),
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
  }
});
