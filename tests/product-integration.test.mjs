import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as b from '../packages/byokit/index.js';

const response = (data) => new Response(JSON.stringify(data));
const native = (protocol) =>
  b.appendModel([], {
    providerId: 'local',
    modelId: 'installed',
    deployment: b.Deployment.Local,
    baseUrl: 'http://localhost:11434/v1',
    protocol,
  })[0];

test('reasoning-only responses fail with safe completion metadata; reasoning never becomes an answer', async () => {
  for (const protocol of [b.ApiProtocol.OpenAI, b.ApiProtocol.Gemini]) {
    const data =
      protocol === b.ApiProtocol.Gemini
        ? {
            candidates: [
              {
                content: { parts: [{ thought: true, text: 'PRIVATE_THOUGHT' }] },
                finishReason: 'MAX_TOKENS',
              },
            ],
            usageMetadata: {
              promptTokenCount: 3,
              candidatesTokenCount: 0,
              thoughtsTokenCount: 8,
              totalTokenCount: 11,
            },
          }
        : {
            choices: [
              {
                message: { content: '', reasoning_content: 'PRIVATE_THOUGHT' },
                finish_reason: 'length',
              },
            ],
            usage: {
              prompt_tokens: 3,
              completion_tokens: 8,
              total_tokens: 11,
              completion_tokens_details: { reasoning_tokens: 8, private: 'PRIVATE_KEY' },
            },
          };
    const model = native(protocol);
    const options = { fetch: async () => response({ ...data, private: 'PRIVATE_KEY' }) };
    const check = (error) => {
      assert.equal(error.code, 'EMPTY_RESPONSE');
      assert.deepEqual(error.completion, {
        finishReason: 'length',
        reasoningPresent: true,
        usage: {
          prompt_tokens: 3,
          completion_tokens: protocol === b.ApiProtocol.Gemini ? 0 : 8,
          total_tokens: 11,
          completion_tokens_details: { reasoning_tokens: 8 },
        },
      });
      assert.ok(!JSON.stringify(error).includes('PRIVATE_'));
      return true;
    };
    await assert.rejects(b.call(model, 'PRIVATE_PROMPT', '', options), check);
    const client = new b.OpenAI({
      baseURL: model.connection.baseUrl,
      protocol,
      apiKey: '',
      models: [model],
      ...options,
    });
    await assert.rejects(
      client.chat.completions.create({
        model: model.apiModelId,
        messages: [{ role: b.Role.User, content: 'Hi' }],
      }),
      check,
    );
  }
  await assert.rejects(
    b.call(native(b.ApiProtocol.OpenAI), 'Hi', '', {
      fetch: async () =>
        response({
          choices: [{ message: { content: '' }, finish_reason: 'PRIVATE_KEY' }],
          usage: { prompt_tokens: -1, completion_tokens: 'PRIVATE_KEY' },
        }),
    }),
    (error) => {
      assert.deepEqual(error.completion, {
        finishReason: null,
        usage: {},
        reasoningPresent: false,
      });
      return true;
    },
  );
});

test('custom local and optional-auth models work without a key; hosted required auth remains enforced', async () => {
  for (const protocol of [b.ApiProtocol.OpenAI, b.ApiProtocol.Ollama]) {
    let requests = 0;
    const model = native(protocol);
    assert.equal(requests, 0);
    const fetch = async (url, options) => {
      requests++;
      assert.ok(
        url.endsWith(protocol === b.ApiProtocol.Ollama ? '/api/chat' : '/chat/completions'),
      );
      assert.equal(options.headers.Authorization, undefined);
      return response(
        protocol === b.ApiProtocol.Ollama
          ? { message: { content: 'OK' } }
          : { choices: [{ message: { content: 'OK' } }] },
      );
    };
    assert.equal((await b.call(model, 'Hi', '', { fetch })).choices[0].message.content, 'OK');
    const client = b.openAI({ model, fetch });
    await client.chat.completions.create({ messages: [{ role: b.Role.User, content: 'Hi' }] });
    assert.equal(requests, 2);
  }
  const model = native(b.ApiProtocol.OpenAI);
  const required = {
    ...model,
    deployment: b.Deployment.Hosted,
    provider: { ...model.provider, auth: b.AuthRequirement.Required },
  };
  await assert.rejects(
    b.call(required, 'Hi', '', { fetch: () => assert.fail('must not fetch') }),
    (error) => error.code === 'INVALID_REQUEST',
  );
});

test('offline client validation checks URL, protocol, headers and credential transport without retaining secrets', () => {
  const key = 'PRIVATE_KEY';
  for (const patch of [
    { baseURL: 'http://remote.example/v1' },
    { baseURL: `https://${key}@example.com/v1` },
    { baseURL: `https://example.com/?key=${key}` },
    { protocol: 'invalid' },
    { defaultHeaders: { Authorization: key } },
    { allowInsecureHttp: 'yes' },
  ]) {
    assert.throws(
      () => b.validateClientConfig({ baseURL: 'https://example.com/v1', apiKey: key, ...patch }),
      (error) => {
        assert.equal(error.code, 'INVALID_REQUEST');
        assert.ok(!JSON.stringify(error).includes(key));
        assert.ok(!error.message.includes(key));
        return true;
      },
    );
  }
  for (const baseURL of [
    'https://example.com/v1',
    'http://localhost:11434/v1',
    'http://127.0.0.1/v1',
    'http://[::1]:8000/v1',
  ]) {
    assert.deepEqual(b.validateClientConfig({ baseURL, apiKey: key }), {
      baseUrl: baseURL,
      protocol: b.ApiProtocol.OpenAI,
    });
  }
  assert.equal(
    b.validateClientConfig({
      baseURL: 'http://remote.example/v1',
      apiKey: key,
      allowInsecureHttp: true,
    }).baseUrl,
    'http://remote.example/v1',
  );
  assert.throws(() =>
    b.validateClientConfig({
      baseURL: 'http://remote.example',
      defaultHeaders: { 'x-secret': key },
    }),
  );
});

test('compact offerings preserve routing, fit decisions and unsupported-call guards while excluding bulky catalog evidence', async () => {
  const full = b.getModels(b.DEFAULT, { local: false });
  const compact = b.compactModels(full);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length / 2);
  for (let i = 0; i < full.length; i++) {
    assert.deepEqual(b.prepareCall(compact[i], 'Hi'), b.prepareCall(full[i], 'Hi'));
    assert.deepEqual(
      b.checkFit(compact[i], { inputTokens: 100, outputTokens: 100 }),
      b.checkFit(full[i], { inputTokens: 100, outputTokens: 100 }),
    );
    for (const field of ['model', 'logos', 'verification', 'price', 'provenance'])
      assert.equal(compact[i][field], undefined);
  }
  compact[0].limits.output = 1;
  assert.notEqual(full[0].limits.output, 1);
  const unsupported = b.compactModels([
    {
      ...native(b.ApiProtocol.OpenAI),
      callSupport: { textGeneration: false, reason: 'Unsupported operation' },
    },
  ])[0];
  await assert.rejects(
    b.call(unsupported, 'Hi', '', { fetch: () => assert.fail('must not fetch') }),
    /Unsupported operation/,
  );
});

test('equivalent offering lookup matches catalog identity before limits and never joins names or unlinked models', () => {
  const data = JSON.parse(readFileSync('spec/fixtures/catalog.json'));
  data.providers.push({
    id: 'openrouter',
    name: 'OpenRouter',
    auth: 'required',
    deployment: 'hosted',
  });
  data.models.push({ ...data.models[0], id: 'openrouter/unlinked' });
  data.offerings.push(
    {
      ...data.offerings[0],
      id: 'openrouter/related',
      providerId: 'openrouter',
      apiModelId: 'creator/model',
      name: 'Z related',
    },
    {
      ...data.offerings[0],
      id: 'openrouter/unlinked',
      providerId: 'openrouter',
      apiModelId: 'same-name',
      modelId: 'openrouter/unlinked',
      name: 'A unrelated',
    },
  );
  const catalog = new b.Catalog(data);
  const seed = data.offerings[0];
  const config = { providerIds: ['openrouter'], limit: 1 };
  assert.deepEqual(
    catalog.getEquivalentModels([seed], config).map((m) => m.id),
    ['openrouter/related'],
  );
  assert.deepEqual(
    catalog.getEquivalentModels([seed.id], config),
    catalog.getEquivalentModels([seed], config),
  );
  assert.deepEqual(catalog.getEquivalentModels([], config), []);
  assert.throws(() => catalog.getEquivalentModels(['unknown/model'], config));
  const python = spawnSync(
    'python3',
    [
      '-c',
      `import sys,json;sys.path.insert(0,'packages/python/src');import byokit;d=json.load(sys.stdin);c=byokit.Catalog(d);print(json.dumps([m['id'] for m in c.get_equivalent_models(['${seed.id}'], {'providerIds':['openrouter'],'limit':1})]))`,
    ],
    { input: JSON.stringify(data), encoding: 'utf8' },
  );
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), ['openrouter/related']);
});

test('both compilers emit compact native models with declarations accepted by call and SDK clients', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'byokit-compact-'));
  try {
    symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    const config = join(dir, 'config.json');
    writeFileSync(config, JSON.stringify({ providerIds: ['deepseek'], local: false, limit: 1 }));
    for (const compiler of ['js', 'python']) {
      for (const ext of ['mjs', 'py']) {
        const output = join(dir, `${compiler}-models.${ext}`);
        const args = ['build', config, '--out', output, '--compact'];
        const build =
          compiler === 'js'
            ? spawnSync(process.execPath, ['packages/byokit/bin.mjs', ...args], {
                encoding: 'utf8',
              })
            : spawnSync('python3', ['-m', 'byokit', ...args], {
                encoding: 'utf8',
                env: { ...process.env, PYTHONPATH: resolve('packages/python/src') },
              });
        assert.equal(build.status, 0, build.stdout + build.stderr);
        assert.equal(JSON.parse(readFileSync(output + '.lock.json')).target, 'compact');
        if (ext === 'py') {
          const run = spawnSync(
            'python3',
            [
              '-c',
              `import runpy,json;print(json.dumps(runpy.run_path(${JSON.stringify(output)})['get_models']()))`,
            ],
            { encoding: 'utf8' },
          );
          assert.equal(run.status, 0, run.stderr);
          assert.equal(JSON.parse(run.stdout)[0].verification, undefined);
          continue;
        }
        const compiled = await import(pathToFileURL(output));
        assert.equal(compiled.models[0].verification, undefined);
        const client = new b.OpenAI({
          apiKey: 'dummy',
          baseURL: compiled.models[0].connection.baseUrl,
          protocol: compiled.models[0].connection.protocol,
          models: compiled.getModels(),
          fetch: async () => response({ choices: [{ message: { content: 'OK' } }] }),
        });
        assert.equal(
          (
            await client.chat.completions.create({
              model: compiled.models[0].apiModelId,
              messages: [{ role: b.Role.User, content: 'Hi' }],
            })
          ).choices[0].message.content,
          'OK',
        );
        const source = join(dir, 'check.mts');
        writeFileSync(
          source,
          `import {getModels} from './${compiler}-models.mjs';
import {call, OpenAI, ApiProtocol, ExecutionModel, validateClientConfig, Role} from 'byokit/client';
const model: ExecutionModel = getModels()[0];
call(model, 'Hi', 'dummy');
const protocol: ApiProtocol = model.connection!.protocol;
new OpenAI({apiKey:'dummy', baseURL:model.connection!.baseUrl, protocol, models:getModels()});
validateClientConfig({baseURL:'https://example.com/v1', protocol, apiKey:'dummy'});
async function answer() {const r=await call(model,'Hi','dummy'); const thoughts:string|undefined=r.choices[0].message.reasoning_content;return thoughts;}
// @ts-expect-error protocol uses native enums
validateClientConfig({baseURL:'https://example.com', protocol:'made-up'});
`,
        );
        const checked = spawnSync(
          process.execPath,
          [
            'node_modules/typescript/bin/tsc',
            '--noEmit',
            '--strict',
            '--target',
            'ES2022',
            '--module',
            'NodeNext',
            '--moduleResolution',
            'NodeNext',
            source,
          ],
          { encoding: 'utf8' },
        );
        assert.equal(checked.status, 0, checked.stdout + checked.stderr);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
