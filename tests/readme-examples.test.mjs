import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as byokit from '../packages/byokit/index.js';
import { tutorials } from '../website/tutorials.js';
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function example(name) {
  const section = readme.split(`<!-- example: ${name} -->`)[1];
  assert.ok(section, `Missing README example ${name}`);
  return section.match(/```\w+\n([\s\S]*?)\n```/)[1];
}
const wireResponse = (url) =>
  url.includes(':generateContent')
    ? { candidates: [{ content: { parts: [{ text: 'OK' }] } }] }
    : url.endsWith('/messages')
      ? { content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn' }
      : url.endsWith('/api/chat')
        ? { message: { content: 'OK' }, done: true }
        : { choices: [{ message: { content: 'OK' } }] };
async function runJavascript(source, model) {
  const original = globalThis.fetch,
    requests = [],
    logs = [];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, ...options });
      return { ok: true, json: async () => wireResponse(url) };
    };
    await new AsyncFunction(
      'byokit',
      'process',
      'console',
      'context',
      (model ? 'const { model, key } = context;\n' : '') + source.replace(/^import .*;\n/gm, ''),
    )(
      byokit,
      { env: { DEEPSEEK_API_KEY: 'synthetic-docs-key', ANTHROPIC_API_KEY: 'synthetic-docs-key' } },
      { log: (...values) => logs.push(...values) },
      { model, key: 'synthetic-docs-key' },
    );
  } finally {
    globalThis.fetch = original;
  }
  assert.ok(!JSON.stringify(logs).includes('synthetic-docs-key'));
  return { requests, logs };
}

test('npm and PyPI READMEs match the canonical root instructions', async () => {
  for (const path of ['packages/byokit/README.md', 'packages/python/README.md'])
    assert.equal(await readFile(new URL('../' + path, import.meta.url), 'utf8'), readme);
  assert.equal(tutorials.direct.typescript, example('hosted-js'));
  assert.equal(tutorials.direct.python, example('hosted-python'));
  assert.equal(tutorials.local.typescript, example('local-js'));
  assert.equal(tutorials.local.python, example('local-python'));
  assert.ok(tutorials.inference.typescript.endsWith(example('client-js')));
  assert.ok(tutorials.inference.python.endsWith(example('client-python')));
  const html = await readFile(new URL('../website/index.html', import.meta.url), 'utf8');
  const fallback = html
    .match(/<pre id="start-code"><code>([\s\S]*?)<\/code><\/pre>/)[1]
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
  assert.equal(fallback, example('hosted-js'));
});

test('README build configuration generates usable JavaScript and Python lists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'byokit-readme-build-'));
  try {
    const config = join(directory, 'byok.config.json');
    await writeFile(config, readme.match(/```json\n([\s\S]*?)\n```/)[1]);
    const javascript = join(directory, 'models.mjs');
    const python = join(directory, 'generated_models.py');
    const js = spawnSync(
      process.execPath,
      ['packages/byokit/bin.mjs', 'build', config, '--out', javascript],
      { encoding: 'utf8' },
    );
    assert.equal(js.status, 0, js.stderr);
    const generated = await import(pathToFileURL(javascript).href);
    const expected = byokit.getModels(byokit.DEFAULT, {
      local: false,
      filters: { callable: true },
    });
    assert.deepEqual(
      generated.getModels().map((model) => model.id),
      expected.map((model) => model.id),
    );
    const py = spawnSync(
      'python3',
      [
        '-c',
        "import sys;sys.path.insert(0,'packages/python/src');from byokit.cli import main;sys.exit(main())",
        'build',
        config,
        '--out',
        python,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(py.status, 0, py.stderr);
    const imported = spawnSync(
      'python3',
      [
        '-c',
        'import runpy,sys,json;data=runpy.run_path(sys.argv[1]);print(json.dumps([model["id"] for model in data["get_models"]()]))',
        python,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(imported.status, 0, imported.stderr);
    assert.deepEqual(
      JSON.parse(imported.stdout),
      expected.map((model) => model.id),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('README hosted, local, and filtering JavaScript examples run through the library', async () => {
  for (const name of ['hosted-js', 'local-js']) {
    const { requests, logs } = await runJavascript(example(name));
    assert.equal(requests.length, 1);
    assert.deepEqual(logs, ['OK']);
    const request = requests[0];
    assert.equal(
      request.headers.Authorization,
      name === 'hosted-js' ? 'Bearer synthetic-docs-key' : undefined,
    );
    assert.equal(request.redirect, 'error');
    assert.ok(!request.body.includes('synthetic-docs-key'));
  }
  const { requests, logs } = await runJavascript(example('filters-js'));
  assert.equal(requests.length, 0);
  assert.equal(logs.length, 2);
  assert.ok(logs.every((list) => Array.isArray(list) && list.length > 0));
});

test('README reusable client preserves OpenAI, Gemini, Claude, and Ollama wire protocols', async () => {
  const models = byokit.getModels({ local: false });
  models.push(
    byokit.getModels({
      providerIds: [],
      local: [
        { endpoint: 'http://localhost:11434', api: byokit.LocalApi.Ollama, modelId: 'installed' },
      ],
    })[0],
  );
  for (const provider of ['openai', 'google', 'anthropic', 'deepseek', 'local']) {
    const model = models.find((item) => item.providerId === provider);
    const { requests, logs } = await runJavascript(example('client-js'), model);
    assert.equal(requests.length, 1);
    assert.deepEqual(logs, ['OK']);
    assert.ok(requests[0].url.startsWith(model.connection.baseUrl));
    const expectedSuffix =
      { google: ':generateContent', anthropic: '/messages', local: '/api/chat' }[provider] ||
      '/chat/completions';
    assert.ok(requests[0].url.endsWith(expectedSuffix));
  }
});

const pythonRunner = `import sys,json,os,io,contextlib
from unittest.mock import patch
sys.path.insert(0, 'packages/python/src')
os.environ['BYOKIT_NO_RUNTIME_WARNING']='1'
os.environ['DEEPSEEK_API_KEY']='synthetic-docs-key';os.environ['ANTHROPIC_API_KEY']='synthetic-docs-key'
import byokit
payload=json.load(sys.stdin)
requests=[]
class Response:
 status=200
 def __init__(self,path): self.path=path
 def read(self, amount=None):
  data=({'candidates':[{'content':{'parts':[{'text':'OK'}]}}]} if self.path.endswith(':generateContent') else {'content':[{'type':'text','text':'OK'}],'stop_reason':'end_turn'} if self.path.endswith('/messages') else {'message':{'content':'OK'},'done':True} if self.path.endswith('/api/chat') else {'choices':[{'message':{'content':'OK'}}]})
  raw=json.dumps(data).encode();return raw if amount is None else raw[:amount]
 def getheader(self,name): return None
class Connection:
 def __init__(self,*args,**kwargs): self.sock=None
 def request(self,method,path,body,headers):
  self.path=path;requests.append((path,body.decode(),dict(headers)))
 def getresponse(self): return Response(self.path)
 def close(self): pass
namespace={'byokit':byokit,'key':'synthetic-docs-key'}
if payload.get('provider'):
 namespace['model']=byokit.get_models(byokit.DEFAULT, {'providerIds':[payload['provider']],'local':False})[0]
output=io.StringIO()
with patch('http.client.HTTPConnection',Connection), patch('http.client.HTTPSConnection',Connection), contextlib.redirect_stdout(output):
 exec(payload['source'],namespace)
assert 'synthetic-docs-key' not in output.getvalue()
assert all('synthetic-docs-key' not in body for _,body,_ in requests)
print(json.dumps({'requests':len(requests),'printed':bool(output.getvalue())}))`;
function runPython(source, expectedRequests, provider) {
  const run = spawnSync('python3', ['-c', pythonRunner], {
    input: JSON.stringify({ source, provider }),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { requests: expectedRequests, printed: true });
}

test('README Python calls and website Python tutorials execute with mocked native endpoints', () => {
  for (const name of ['hosted-python', 'local-python']) runPython(example(name), 1);
  for (const provider of ['openai', 'google', 'anthropic', 'deepseek'])
    runPython(example('client-python'), 1, provider);
  for (const [name, tutorial] of Object.entries(tutorials))
    runPython(tutorial.python, ['query', 'matchers'].includes(name) ? 0 : 1);
});

test('all website JavaScript tutorials execute, and missing hosted keys fail before requests', async () => {
  for (const [name, tutorial] of Object.entries(tutorials)) {
    const { requests, logs } = await runJavascript(tutorial.typescript);
    assert.equal(requests.length, ['query', 'matchers'].includes(name) ? 0 : 1);
    assert.ok(logs.length > 0);
  }
  await assert.rejects(
    new AsyncFunction('byokit', 'process', example('hosted-js').replace(/^import .*;\n/, ''))(
      byokit,
      { env: {} },
    ),
    /Set DEEPSEEK_API_KEY/,
  );
});
