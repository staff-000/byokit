import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as enums from '../packages/byokit/enums.js';
import { getModels } from '@staff-000/byokit/catalog';
import {
  ProviderId,
  Preset,
  FeatureName,
  Modality,
  customProviderId,
  githubContributor,
  customTag,
} from '@staff-000/byokit';

test('runtime enum objects match the shared definitions and are immutable', () => {
  const spec = JSON.parse(readFileSync('spec/enums.json'));
  for (const [name, values] of Object.entries(spec)) {
    assert.deepEqual(enums[name], values);
    assert.ok(Object.isFrozen(enums[name]));
  }
});
test('enum calls work and typo values are rejected at runtime for JavaScript/JSON', () => {
  assert.ok(
    getModels({
      preset: Preset.China,
      providerIds: [ProviderId.DeepSeek],
      filters: { input: [Modality.Text], requiredFeatures: [FeatureName.FunctionCalling] },
    }).length,
  );
  assert.throws(() => getModels({ filters: { input: ['imag'] } }));
  assert.throws(() => getModels({ filters: { requiredFeatures: ['functionCallling'] } }));
  assert.throws(() => getModels({ prefer: { features: ['madeUp'] } }));
  assert.equal(customProviderId('my-provider'), 'my-provider');
  assert.equal(githubContributor('example'), 'github:example');
  assert.equal(customTag('usecase:summarization'), 'usecase:summarization');
  assert.throws(() => customTag('no-namespace'));
  assert.throws(() => customProviderId('https://wrong'));
});
test('Python enums serialize to the same values and use the same query validation', () => {
  const run = spawnSync(
    process.env.BYOKIT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    [
      '-c',
      `import sys,json;sys.path.insert(0,'packages/python/src');from byokit import ProviderId,Preset,Modality,get_models,validate_config; print(json.dumps({'provider':ProviderId.DEEP_SEEK,'preset':Preset.CHINA,'modality':Modality.TEXT,'models':len(get_models({'providerIds':[ProviderId.DEEP_SEEK],'limit':1})),'invalid':bool(validate_config({'filters':{'requiredFeatures':['madeUp']}}))}))`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    provider: ProviderId.DeepSeek,
    preset: Preset.China,
    modality: Modality.Text,
    models: 1,
    invalid: true,
  });
});

test('Python typed API accepts enum calls and rejects raw fixed-choice values', () => {
  const valid = spawnSync(
    process.execPath,
    ['node_modules/pyright/index.js', '--project', 'pyrightconfig.json'],
    { encoding: 'utf8' },
  );
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  const invalid = spawnSync(
    process.execPath,
    [
      'node_modules/pyright/index.js',
      '--project',
      'pyrightconfig.json',
      'tests/python_types_invalid.py',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout, /error/);
});
