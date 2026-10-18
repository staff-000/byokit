import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBatch, runBatch } from '../website/batch-verification.js';
import { filterModels } from '../website/verification-filters.js';
const jobs = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    offeringId: 'deepseek/test-' + i,
    providerId: 'deepseek',
    modelId: 'test-' + i,
    protocol: 'chat',
    prompt: 'private prompt',
    maxTokens: 256,
  }));
test('batch admission rejects mixed providers, duplicate models, missing credentials, and oversized batches', () => {
  assert.throws(() => validateBatch(jobs(), ' '));
  assert.throws(() => validateBatch(jobs(), ''));
  assert.throws(() => validateBatch(jobs(11), 'fixture-key'));
  assert.throws(() => validateBatch([jobs()[0], jobs()[0]], 'fixture-key'));
  assert.throws(() =>
    validateBatch([jobs()[0], { ...jobs()[1], providerId: 'openai' }], 'fixture-key'),
  );
  assert.throws(() => validateBatch([{ ...jobs()[0], providerId: 'local' }], 'fixture-key'));
});
test('batch runs sequentially, once per model, using only the captured provider key', async () => {
  let calls = 0,
    active = 0,
    max = 0;
  const entries = await runBatch(jobs(), 'fixture-key', {
    verify: async (job, key) => {
      assert.equal(key, 'fixture-key');
      calls++;
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { text: 'OK', model: job.modelId };
    },
  });
  assert.equal(calls, 2);
  assert.equal(max, 1);
  assert.deepEqual(
    entries.map((e) => e.status),
    ['passed', 'passed'],
  );
  assert.ok(!JSON.stringify(entries).includes('fixture-key'));
});
test('authentication and quota failures stop the queue and redact credential-bearing errors', async () => {
  for (const status of [401, 402, 403, 429]) {
    let calls = 0;
    const entries = await runBatch(jobs(), 'fixture-key', {
      verify: async () => {
        calls++;
        throw Object.assign(new Error(`HTTP ${status} fixture-key`), {
          code: 'PROVIDER_ERROR',
          status,
        });
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(
      entries.map((e) => e.status),
      ['failed', 'skipped'],
    );
    assert.ok(!JSON.stringify(entries).includes('fixture-key'));
  }
});
test('canceling prevents queued requests and fences a late result', async () => {
  const controller = new AbortController();
  let calls = 0;
  const entries = await runBatch(jobs(), 'fixture-key', {
    signal: controller.signal,
    verify: async () => {
      calls++;
      controller.abort();
      return { text: 'late' };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(
    entries.map((e) => e.status),
    ['canceled', 'skipped'],
  );
});
test('verification selectors include uncertain defaults and explicitly include outdated offerings', () => {
  const live = filterModels({ provider: 'openai' }),
    all = filterModels({ provider: 'openai', includeOutdated: true });
  assert.ok(live.length);
  assert.ok(all.length > live.length);
  assert.ok(live.every((m) => ['LIVE', 'UNCERTAIN'].includes(m.lifecycle.status)));
  assert.ok(all.some((m) => m.lifecycle.status === 'OUTDATED'));
  const china = filterModels({ region: 'china' });
  assert.ok(
    china.every(
      (m) => m.local || m.tags.includes('origin:cn') || m.provider.tags.includes('origin:cn'),
    ),
  );
  const tools = filterModels({
    feature: 'functionCalling',
    context: '128000',
    price: '5',
    weights: 'open',
    modality: 'image',
  });
  assert.ok(
    tools.every(
      (m) =>
        m.local ||
        (m.features.functionCalling.status === 'supported' &&
          m.limits.context >= 128000 &&
          m.price.input <= 5 &&
          m.model.openWeights === true &&
          m.modalities.input.includes('image')),
    ),
  );
});

test('China exclusions use library tags, not a separate audience', () => {
  const models = filterModels({ excludeTag: 'origin:cn' });
  assert.ok(models.length);
  assert.ok(
    models.every(
      (m) => m.local || ![...m.tags, ...m.model.tags, ...m.provider.tags].includes('origin:cn'),
    ),
  );
});

test('cross-provider batches validate every key before sending and isolate provider failures', async () => {
  const mixed = [
    jobs()[0],
    { ...jobs()[0], offeringId: 'openai/fixture', providerId: 'openai' },
    jobs()[1],
  ];
  let calls = [];
  await assert.rejects(
    runBatch(mixed, { deepseek: 'deep-secret' }, { verify: async () => calls.push('unexpected') }),
  );
  assert.deepEqual(calls, []);
  const entries = await runBatch(
    mixed,
    { deepseek: 'deep-secret', openai: 'open-secret' },
    {
      verify: async (job, key) => {
        calls.push(job.providerId);
        assert.equal(key, job.providerId === 'deepseek' ? 'deep-secret' : 'open-secret');
        if (job.providerId === 'deepseek')
          throw Object.assign(new Error('HTTP 401 deep-secret open-secret'), { status: 401 });
        return { text: 'OK' };
      },
    },
  );
  assert.deepEqual(calls, ['deepseek', 'openai']);
  assert.deepEqual(
    entries.map((e) => e.status),
    ['failed', 'passed', 'skipped'],
  );
  assert.ok(!JSON.stringify(entries).includes('secret'));
});

test('unsupported providers send no requests and inherited credentials are rejected', async () => {
  let calls = 0;
  const verify = async () => {
    calls++;
  };
  await assert.rejects(
    runBatch(
      [{ ...jobs()[0], providerId: 'unreviewed-provider' }],
      { 'unreviewed-provider': 'secret' },
      { verify },
    ),
  );
  await assert.rejects(runBatch(jobs(), Object.create({ deepseek: 'secret' }), { verify }));
  assert.equal(calls, 0);
});

test('a running batch captures jobs and credentials before callers mutate them', async () => {
  const selected = jobs(),
    keys = { deepseek: 'original-key' };
  const seen = [];
  await runBatch(selected, keys, {
    verify: async (job, key) => {
      seen.push([job.modelId, key]);
      selected[1].modelId = 'changed';
      keys.deepseek = 'changed';
      return { text: 'OK' };
    },
  });
  assert.deepEqual(seen, [
    ['test-0', 'original-key'],
    ['test-1', 'original-key'],
  ]);
});
