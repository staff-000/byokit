import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import data, {
  Catalog,
  COMPLETE,
  DEFAULT,
  Lifecycle,
  Modality,
  call,
  exact,
  any,
} from '../packages/byokit/catalog.js';
import { pythonModels } from './python-fixture.mjs';

const catalog = new Catalog(data);
test('complete discovery includes direct providers, resellers, and every generation output', () => {
  const list = catalog.getModels(COMPLETE, { local: false });
  assert.equal(list.length, data.offerings.filter((o) => o.deployment === 'hosted').length);
  for (const id of ['xai', 'moonshotai', 'minimax', 'fireworks-ai', 'openrouter'])
    assert.ok(
      list.some((o) => o.providerId === id),
      id,
    );
  for (const output of [Modality.Image, Modality.Audio, Modality.Video]) {
    const matches = catalog.getModels(COMPLETE, { filters: { output: any(output) } });
    assert.ok(matches.length, output);
    assert.ok(matches.every((o) => !o.local && o.modalities.output.includes(output)));
  }
  const defaults = catalog.getModels(DEFAULT, { local: false });
  assert.ok(defaults.length);
  assert.ok(
    defaults.every(
      (o) =>
        data.recommendations.some((r) => r.offeringId === o.id) && o.callSupport.textGeneration,
    ),
  );
  assert.ok(
    list
      .filter((o) => o.providerId === 'xai')
      .every((o) => !o.callSupport.textGeneration && o.connection === null),
  );
});

test('unsupported catalog calls fail before network access', async () => {
  const selected = catalog.getModels(COMPLETE, {
    local: false,
    filters: { output: any(Modality.Image), callable: false },
    limit: 1,
  })[0];
  let requests = 0;
  await assert.rejects(
    call(selected, { messages: [{ role: 'user', content: 'Hi' }] }, 'fixture-key', {
      fetch: async () => {
        requests++;
        throw new Error('must not send');
      },
    }),
    /adapter|operation|declared|unsupported/i,
  );
  assert.equal(requests, 0);
});

test('combined import preserves canonical facts, partial dates, operation and price metadata, and evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'byokit-coverage-'));
  const source = join(root, 'upstream.json'),
    reports = join(root, 'reports.json'),
    out = join(root, 'out');
  writeFileSync(reports, '[]');
  const model = {
    id: 'chat',
    name: 'Serving name',
    canonical_model_id: 'lab/base',
    release_date: '2026-09',
    last_updated: '2026-10',
    modalities: { input: ['text', 'image'], output: ['text', 'audio'] },
    cost: {
      input: 1,
      output: 2,
      input_audio: 3,
      output_audio: 4,
      reasoning: 5,
      tiers: [{ tier: { type: 'context', size: 1000 }, input: 2, output: 4 }],
    },
    limit: { context: 1000, output: 100 },
    tool_call: true,
  };
  let upstream = {
    providers: {
      openai: {
        name: 'OpenAI',
        models: {
          chat: model,
          decision: { ...model, id: 'decision', type: 'decision' },
          retired: { ...model, id: 'retired', status: 'deprecated' },
          responses: { ...model, id: 'responses', provider: { shape: 'responses' } },
          overrides: { ...model, id: 'overrides', provider: { body: { routing: 'custom' } } },
          live: { ...model, id: 'gemini-3.8-live' },
        },
      },
      xai: {
        name: 'xAI',
        models: {
          chat: {
            ...model,
            name: 'Another serving name',
            open_weights: false,
            limit: { context: 2000, output: 100 },
          },
        },
      },
    },
    models: {
      'lab/base': {
        id: 'lab/base',
        name: 'Canonical name',
        family: 'base',
        open_weights: true,
        license: 'MIT',
      },
    },
  };
  const run = (...args) => {
    writeFileSync(source, JSON.stringify(upstream));
    const result = spawnSync(
      'node',
      ['scripts/import-catalog.mjs', source, '--out', out, '--verifications', reports, ...args],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(readFileSync(join(out, 'catalog.json')));
  };
  const stamp = '2026-10-15T12:00:00Z';
  let imported = run('--observed-at', stamp);
  assert.equal(imported.models.find((m) => m.id === 'lab/base').name, 'Canonical name');
  assert.equal(imported.models.find((m) => m.id === 'lab/base').openWeights, true);
  const a = imported.offerings.find((o) => o.id === 'openai/chat');
  assert.equal(a.releaseDate, '2026-09');
  assert.equal(a.lastUpdated, '2026-10');
  assert.equal(a.price.unit, 'per-million-tokens');
  assert.equal(a.price.inputAudio, 3);
  assert.equal(a.price.outputAudio, 4);
  assert.equal(a.price.reasoning, 5);
  assert.equal(a.price.tiers[0].tier.size, 1000);
  assert.equal(a.lifecycleEvidence, undefined);
  assert.equal(imported.offerings.find((o) => o.id === 'xai/chat').limits.context, 2000);
  assert.equal(
    imported.offerings.find((o) => o.id === 'openai/decision').callSupport.textGeneration,
    false,
  );
  for (const id of ['decision', 'responses', 'overrides', 'gemini-3.8-live'])
    assert.equal(
      imported.offerings.find((o) => o.id === 'openai/' + id).callSupport.textGeneration,
      false,
    );
  assert.deepEqual(run(), imported);
  upstream.providers = Object.fromEntries(Object.entries(upstream.providers).reverse());
  assert.deepEqual(run('--observed-at', stamp), imported);
  a.status = 'deprecated';
  a.lifecycleEvidence = {
    status: 'OUTDATED',
    basis: 'provider',
    source: 'https://example.com/retired',
    checkedAt: stamp,
  };
  writeFileSync(join(out, 'catalog.json'), JSON.stringify(imported));
  delete upstream.providers.openai.models.chat;
  delete upstream.providers.openai.models.retired;
  imported = run('--observed-at', '2026-10-16T12:00:00Z');
  assert.deepEqual(
    imported.offerings.find((o) => o.id === a.id).lifecycleEvidence,
    a.lifecycleEvidence,
  );
  assert.equal(imported.offerings.find((o) => o.id === 'openai/retired').status, 'deprecated');
  const manualPath = join(root, 'manual.json');
  const manualOffering = {
    ...a,
    id: 'openai/manual-retired',
    apiModelId: 'manual-retired',
    provenance: { source: 'https://example.com/manual', reviewedAt: '2026-10-15' },
  };
  writeFileSync(manualPath, JSON.stringify({ schemaVersion: 1, offerings: [manualOffering] }));
  const firstManual = run('--manual', manualPath, '--observed-at', stamp);
  assert.deepEqual(run('--manual', manualPath, '--observed-at', stamp), firstManual);
  manualOffering.lifecycleEvidence = {
    ...manualOffering.lifecycleEvidence,
    status: 'LIVE',
    checkedAt: '2026-10-16T12:00:00Z',
  };
  manualOffering.status = 'stable';
  writeFileSync(manualPath, JSON.stringify({ schemaVersion: 1, offerings: [manualOffering] }));
  assert.equal(
    run('--manual', manualPath, '--observed-at', stamp).offerings.find(
      (o) => o.id === manualOffering.id,
    ).lifecycleEvidence.status,
    'LIVE',
  );
});

test('lifecycle precedence, mixed modalities, unknowns, callable and month dates agree across languages', () => {
  const d = JSON.parse(readFileSync('spec/fixtures/catalog.json'));
  d.offerings[0].status = 'deprecated';
  delete d.offerings[0].lifecycleEvidence;
  d.offerings[0].releaseDate = '2026-10';
  d.offerings[0].modalities.output = ['text', 'audio'];
  d.offerings[1].modalities.output = null;
  d.offerings[1].lifecycleEvidence = {
    status: 'LIVE',
    basis: 'catalog-listing',
    source: 'https://models.dev/api.json',
    checkedAt: '2026-10-15T12:00:00Z',
  };
  const c = new Catalog(d);
  const queries = [
    { list: COMPLETE, local: false },
    { list: COMPLETE, local: false, filters: { includeDeprecated: false } },
    { local: false, filters: { includeDeprecated: true } },
    { local: false, filters: { includeDeprecated: false, lifecycle: exact(Lifecycle.Outdated) } },
    { local: false, filters: { includeDeprecated: true, lifecycle: exact(Lifecycle.Live) } },
    { list: COMPLETE, filters: { output: exact(Modality.Text, Modality.Audio) } },
    { list: COMPLETE, filters: { output: exact(Modality.Video) } },
    { list: COMPLETE, filters: { callable: false } },
    { list: COMPLETE, unknownPolicy: 'include', filters: { output: exact(Modality.Video) } },
  ].map((q) => ({ ...q, asOf: '2026-10-15T13:00:00Z' }));
  assert.equal(c.getModels(queries[4]).length, 0);
  assert.equal(c.getModels(queries[5]).length, 1);
  assert.equal(c.getModels(queries[6]).length, 0);
  assert.ok(c.getModels(queries[0]).some((o) => o.lifecycle.status === Lifecycle.Uncertain));
  assert.ok(c.getModels(queries[1]).every((o) => o.lifecycle.status !== Lifecycle.Outdated));
  delete d.offerings[1].lifecycleEvidence.basis;
  assert.equal(
    new Catalog(d).getModels(COMPLETE, { local: false }).find((o) => o.id === d.offerings[1].id)
      .lifecycle.status,
    Lifecycle.Uncertain,
  );
  d.offerings[1].lifecycleEvidence.basis = 'catalog-listing';
  const py = pythonModels({ data: d, queries });
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(
    JSON.parse(py.stdout),
    queries.map((q) => c.getModels(q)),
  );
});
