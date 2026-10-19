import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
test('CLI passes a valid budget and fails an excessive budget before requests', async () => {
  const good = spawnSync(
    'node',
    ['packages/byokit/bin.mjs', 'check', 'examples/task.config.json', '--strict'],
    { encoding: 'utf8' },
  );
  assert.equal(good.status, 0, good.stdout + good.stderr);
  const dir = mkdtempSync(join(tmpdir(), 'byokit-'));
  const file = join(dir, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      catalog: resolve('spec/fixtures/catalog.json'),
      tasks: [
        { offeringIds: ['test/small'], budget: { maxInputTokens: 9000, maxOutputTokens: 1000 } },
      ],
    }),
  );
  const bad = spawnSync('node', ['packages/byokit/bin.mjs', 'check', file], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /CONTEXT_BUDGET_EXCEEDED/);
  const built = spawnSync(
    'node',
    [
      'packages/byokit/bin.mjs',
      'build',
      'examples/byok.config.json',
      '--out',
      join(dir, 'catalog.json'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(built.status, 0, built.stderr);
  assert.ok(JSON.parse(readFileSync(join(dir, 'catalog.json'))).providers.length <= 8);
  assert.match(
    readFileSync(join(dir, 'catalog.json.ids.d.ts'), 'utf8'),
    /export declare enum OfferingId/,
  );
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  const runtime = await import(pathToFileURL(join(dir, 'catalog.json.ids.js')).href);
  const id = Object.values(runtime.OfferingId)[0];
  assert.ok(id);
  writeFileSync(
    join(dir, 'enum-types.ts'),
    `import {OfferingId} from './catalog.json.ids.js';\nconst good:OfferingId=OfferingId[${JSON.stringify(id)}];\n// @ts-expect-error raw model strings must be rejected\nconst bad:OfferingId=${JSON.stringify(id)};\n// @ts-expect-error missing catalog member\nOfferingId['missing/model'];\n`,
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
      join(dir, 'enum-types.ts'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
});

test('undeclared budgets warn; strict validation fails without performing inference', () => {
  const dir = mkdtempSync(join(tmpdir(), 'byokit-budget-')),
    file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ catalog: resolve('spec/fixtures/catalog.json') }));
  const warning = spawnSync('node', ['packages/byokit/bin.mjs', 'check', file], {
    encoding: 'utf8',
  });
  assert.equal(warning.status, 0);
  assert.match(warning.stdout, /BUDGET_UNDECLARED/);
  const strict = spawnSync('node', ['packages/byokit/bin.mjs', 'check', file, '--strict'], {
    encoding: 'utf8',
  });
  assert.equal(strict.status, 1);
});

test('CLI surfaces descriptive error message on invalid input and exits with 2', () => {
  const result = spawnSync(
    'node',
    ['packages/byokit/bin.mjs', 'check', 'nonexistent-config.json'],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Error:/);
});

test('CLI build supports omitted catalog, precompiled models.js, and generated_models.py', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'byokit-precompiled-'));
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  const configFile = join(dir, 'byok.config.json');
  // Omit "catalog" to test default bundled catalog usage
  writeFileSync(
    configFile,
    JSON.stringify({
      list: 'official',
      local: false,
      sort: 'alphabeticalAscend',
      filters: {
        callable: true,
      },
    }),
  );

  // 1. Build precompiled models.js
  const jsOut = join(dir, 'models.js');
  const buildJs = spawnSync(
    'node',
    ['packages/byokit/bin.mjs', 'build', configFile, '--out', jsOut],
    { encoding: 'utf8' },
  );
  assert.equal(buildJs.status, 0, buildJs.stderr);
  assert.match(buildJs.stdout, /Built precompiled model list/);

  // Check generated files
  const jsContent = readFileSync(jsOut, 'utf8');
  assert.match(jsContent, /export const models = Object\.freeze/);
  assert.match(jsContent, /export function getModels\(\)/);
  assert.match(jsContent, /export const OfferingId=Object\.freeze/);

  const dtsContent = readFileSync(join(dir, 'models.d.ts'), 'utf8');
  assert.match(dtsContent, /export declare enum OfferingId/);
  assert.match(dtsContent, /export declare function getModels\(\): PrecompiledModel\[\]/);

  const lockContent = JSON.parse(readFileSync(join(dir, 'models.js.lock.json'), 'utf8'));
  assert.equal(lockContent.schemaVersion, 1);
  assert.ok(lockContent.upstreamHash);
  assert.ok(lockContent.configHash);

  // Import generated module and verify runtime behavior
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  const precompiledModule = await import(pathToFileURL(jsOut).href);
  assert.ok(Array.isArray(precompiledModule.models));
  assert.ok(precompiledModule.models.length > 0);
  assert.deepEqual(precompiledModule.getModels(), precompiledModule.models);
  // Verify safe cloning (mutating returned array doesn't mutate precompiledModule.models)
  const copy = precompiledModule.getModels();
  copy.pop();
  assert.notEqual(copy.length, precompiledModule.models.length);

  // Typecheck generated models.d.ts
  const sampleTs = join(dir, 'test-models.ts');
  const sampleOfferingId = Object.values(precompiledModule.OfferingId)[0];
  writeFileSync(
    sampleTs,
    `import { models, getModels, OfferingId } from './models.js';
const list = getModels();
const first = models[0];
import {call, OpenAI, ModelOption, ApiProtocol} from 'byokit/client';
const native: ModelOption = first;
call(first, 'Hi', 'dummy-key');
new OpenAI({apiKey: 'dummy-key', baseURL: first.connection!.baseUrl, protocol: first.connection!.protocol, models: list});
const protocol: ApiProtocol | undefined = first.connection?.protocol;
const id: OfferingId = OfferingId[${JSON.stringify(sampleOfferingId)}];
`,
  );
  const checkedTs = spawnSync(
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
      sampleTs,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(checkedTs.status, 0, checkedTs.stdout + checkedTs.stderr);

  // 2. Build precompiled Python module models.py
  const pyOut = join(dir, 'generated_models.py');
  const buildPy = spawnSync(
    'node',
    ['packages/byokit/bin.mjs', 'build', configFile, '--out', pyOut],
    { encoding: 'utf8' },
  );
  assert.equal(buildPy.status, 0, buildPy.stderr);
  assert.match(buildPy.stdout, /Built precompiled Python model list/);

  const pyContent = readFileSync(pyOut, 'utf8');
  assert.match(pyContent, /MODELS: list\[dict\] =/);
  assert.match(pyContent, /def get_models\(\) -> list\[dict\]:/);
  assert.match(pyContent, /class OfferingId\(str, Enum\):/);

  // Execute generated Python module
  const testPy = spawnSync(
    'python3',
    [
      '-c',
      `import sys; sys.path.insert(0, ${JSON.stringify(dir)}); import generated_models; models = generated_models.get_models(); assert len(models) == ${precompiledModule.models.length}; assert isinstance(generated_models.OfferingId, type); print("OK")`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(testPy.status, 0, testPy.stderr);
  assert.match(testPy.stdout, /OK/);
});

test('byokit/client subpath exports client SDK and call helpers without loading catalog.js', async () => {
  // Test via isolated child process measuring memory/evaluated modules
  const checkClient = spawnSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `import { OpenAI, Anthropic, call, checkFit, FeatureName } from 'byokit/client';
if (typeof OpenAI !== 'function' || typeof Anthropic !== 'function' || typeof call !== 'function') {
  process.exit(1);
}
// Confirm catalog data is NOT imported
if (globalThis.__byokit_catalog_loaded__) {
  process.exit(2);
}
console.log('CLIENT_OK');
`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(checkClient.status, 0, checkClient.stderr);
  assert.match(checkClient.stdout, /CLIENT_OK/);
});
