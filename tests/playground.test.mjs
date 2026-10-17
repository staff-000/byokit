import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { buildPlaygroundWorker } from '../scripts/build-playground.mjs';
import { playgroundExamples } from '../website/playground-examples.js';
import * as byokit from '../packages/byokit/catalog.js';
const source = await buildPlaygroundWorker();
async function execute(code, verifications) {
  const messages = [];
  const context = {
    self: { postMessage: (message) => messages.push(message) },
    structuredClone,
    URL,
    AbortController,
    TextEncoder,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, context, { timeout: 2000 });
  await context.self.onmessage({ data: { id: 7, code, verifications } });
  return JSON.parse(JSON.stringify(messages));
}
test('playground runs the actual compiled catalog and price sorting API', async () => {
  const messages = await execute(playgroundExamples.price.code);
  assert.equal(messages.at(-1).type, 'done');
  assert.equal(messages.at(-1).id, 7);
  const actual = JSON.parse(messages[0].text),
    expected = byokit
      .getModels({ sort: byokit.ModelSort.PriceAscend, limit: 5, local: false })
      .map((model) => ({
        provider: model.provider.name,
        model: model.apiModelId,
        inputPrice: model.price.input,
        context: model.limits.context,
      }));
  assert.deepEqual(actual, expected);
});
test('all editable examples run offline and preserve custom-model unknown metadata', async () => {
  for (const example of Object.values(playgroundExamples)) {
    const messages = await execute(example.code);
    assert.equal(messages.at(-1).type, 'done', example.label);
    assert.ok(
      messages.some((m) => m.type === 'log'),
      example.label,
    );
  }
  const custom = await execute(playgroundExamples.custom.code);
  assert.equal(JSON.parse(custom[0].text).verification.status, 'unverified');
});
test('runner reports syntax/errors, awaits returned values and bounds output', async () => {
  assert.equal((await execute('const = ;')).at(-1).type, 'error');
  assert.match((await execute('throw new Error("try again")')).at(-1).text, /try again/);
  assert.equal((await execute('return await Promise.resolve(42)'))[0].text, '42');
  const circular = await execute('const x={};x.x=x;console.log(x)');
  assert.match(circular[0].text, /Circular/);
  const large = await execute('for(let i=0;i<200;i++)console.log("x".repeat(1000))');
  assert.ok(large.filter((m) => m.type === 'log').length <= 100);
  assert.ok(large.reduce((n, m) => n + (m.text?.length || 0), 0) < 25000);
  assert.equal((await execute(''))[0].empty, true);
});
test('playground only exposes offline library APIs and uses an opaque sandbox with no connections', async () => {
  assert.equal(
    (
      await execute('console.log(typeof byokit.call, typeof byokit.openAI, typeof byokit.Byokit)')
    )[0].text,
    'undefined undefined undefined',
  );
  const ui = await readFile(new URL('../website/playground.js', import.meta.url), 'utf8');
  assert.ok(
    ui.includes("setAttribute('sandbox', 'allow-scripts')") ||
      ui.includes("setAttribute('sandbox','allow-scripts')"),
  );
  assert.ok(ui.includes("connect-src 'none'"));
  assert.ok(ui.includes('3000'));
  assert.ok(ui.includes('frame?.remove()'));
});
test('playground captures generated models and updates verification status when verified', async () => {
  const messages = await execute('const models = byokit.getModels();');
  const done = messages.find((m) => m.type === 'done');
  assert.ok(done.models && done.models.length > 0);
  assert.ok(done.models.some((m) => m.providerId === 'openai'));

  const verifiedOffering = 'anthropic/claude-sonnet-5-5';
  const mockVerification = {
    id: 'test:verify-rec-1',
    offeringId: verifiedOffering,
    contributor: 'github:verifier',
    checkedAt: new Date().toISOString(),
    result: 'passed',
    checks: ['textGeneration'],
  };
  const verifiedMessages = await execute(
    `const models = byokit.getModels();
     const m = models.find(x => x.id === "${verifiedOffering}");
     console.log(m?.verification?.status);`,
    [mockVerification],
  );
  assert.equal(verifiedMessages.find((m) => m.type === 'log')?.text, 'passed');

  const ui = await readFile(new URL('../website/playground.js', import.meta.url), 'utf8');
  assert.ok(ui.includes('availability-run-btn'));
  assert.ok(ui.includes('verifyInference'));
  assert.ok(ui.includes('successRecord'));
});
