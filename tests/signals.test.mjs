import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as byokit from '../packages/core/index.js';
const fixture = () => {
  const d = JSON.parse(readFileSync('spec/fixtures/catalog.json'));
  for (const o of d.offerings) delete o.lifecycleEvidence;
  return d;
};
const asOf = '2026-10-12T12:00:00Z';
const live = {
  status: byokit.Lifecycle.Live,
  source: 'https://example.com/model-status',
  checkedAt: '2026-10-11T00:00:00Z',
};
const usage = {
  metric: byokit.PopularityMetric.Requests,
  rank: 10,
  population: 100,
  scope: 'Example platform text models (complete ranking)',
  source: 'https://example.com/usage',
  windowStart: '2026-10-01T00:00:00Z',
  windowEnd: '2026-10-11T00:00:00Z',
};
function data() {
  const d = fixture();
  d.offerings[0].lifecycleEvidence = live;
  d.offerings[0].popularityEvidence = usage;
  return d;
}
test('exclusions apply to model, offering, and provider tags; exclusion wins', () => {
  for (const target of ['models', 'offerings', 'providers']) {
    const d = fixture();
    d[target][0].tags = ['usecase:excluded'];
    const c = new byokit.Catalog(d);
    const q = {
      asOf,
      local: false,
      filters: { includeTags: ['usecase:excluded'], excludeTags: ['usecase:excluded'] },
    };
    assert.deepEqual(c.getModels(q), []);
    assert.ok(
      !c
        .getModels({ asOf, local: false, filters: { excludeTags: ['usecase:excluded'] } })
        .some((o) => o.id === d.offerings[0].id),
    );
  }
});
test('lifecycle and objective popularity expose evidence, filter by enum and derived tag', () => {
  const d = data(),
    c = new byokit.Catalog(d);
  const q = {
    asOf,
    local: false,
    filters: { lifecycle: [byokit.Lifecycle.Live], popularity: [byokit.Popularity.Popular] },
  };
  const result = c.getModels(q);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].popularity.evidence, usage);
  assert.deepEqual(
    c.getModels({
      asOf,
      local: false,
      filters: { includeTags: [byokit.Tag.LifecycleLive, byokit.Tag.PopularityPopular] },
    }),
    result,
  );
  assert.ok(
    !c
      .getModels({ asOf, local: false, filters: { excludeTags: [byokit.Tag.LifecycleLive] } })
      .some((o) => o.id === result[0].id),
  );
  result[0].popularity.evidence.rank = 99;
  assert.equal(c.getModels(q)[0].popularity.evidence.rank, 10);
  d.offerings[0].popularityEvidence = { ...usage, rank: 11 };
  assert.equal(
    new byokit.Catalog(d).getModels({ asOf }).find((o) => o.id === d.offerings[0].id).popularity
      .status,
    'NOT_POPULAR',
  );
  d.offerings[0].lifecycleEvidence = { ...live, status: 'OUTDATED' };
  assert.equal(
    new byokit.Catalog(d)
      .getModels({ asOf, local: false, filters: { lifecycle: ['OUTDATED'] } })
      .find((o) => o.id === d.offerings[0].id).lifecycle.status,
    'OUTDATED',
  );
});
test('missing, stale, future evidence and forged tags cannot establish live/popular', () => {
  for (const stamp of ['2020-01-01T00:00:00Z', '2099-01-01T00:00:00Z']) {
    const d = data();
    d.offerings[0].lifecycleEvidence = { ...live, checkedAt: stamp };
    d.offerings[0].popularityEvidence = {
      ...usage,
      windowStart: '2019-01-01T00:00:00Z',
      windowEnd: stamp,
    };
    for (const collection of ['models', 'providers', 'offerings'])
      d[collection][0].tags = ['lifecycle:LIVE', 'popularity:POPULAR'];
    const c = new byokit.Catalog(d);
    assert.deepEqual(
      c.getModels({ asOf, local: false, filters: { includeTags: [byokit.Tag.LifecycleLive] } }),
      [],
    );
    assert.equal(
      c.getModels({ asOf, local: false, filters: { lifecycle: ['UNCERTAIN'] } })[0].popularity
        .status,
      'UNCERTAIN',
    );
  }
  const c = new byokit.Catalog(fixture());
  assert.deepEqual(
    c.getModels({
      asOf,
      local: false,
      unknownPolicy: byokit.UnknownPolicy.Include,
      filters: { lifecycle: [byokit.Lifecycle.Live] },
    }),
    [],
  );
  assert.ok(
    c.getModels({
      asOf,
      local: false,
      filters: {
        lifecycle: [byokit.Lifecycle.Uncertain],
        popularity: [byokit.Popularity.Uncertain],
      },
    }).length,
  );
});
test('invalid evidence and enum filters are rejected', () => {
  for (const [key, value] of [
    ['lifecycleEvidence', { ...live, status: 'live' }],
    ['lifecycleEvidence', null],
    ['lifecycleEvidence', { ...live, source: '' }],
    ['popularityEvidence', { ...usage, rank: 101 }],
    ['popularityEvidence', { ...usage, windowEnd: usage.windowStart }],
    ['popularityEvidence', { ...usage, scope: '' }],
    ['popularityEvidence', { ...usage, metric: 'likes' }],
  ]) {
    const d = fixture();
    d.offerings[0][key] = value;
    assert.throws(() => new byokit.Catalog(d));
  }
  const c = new byokit.Catalog(data());
  assert.throws(() => c.getModels({ filters: { lifecycle: ['live'] } }));
  assert.throws(() => c.getModels({ filters: { popularity: ['famous'] } }));
});
test('signal and exclusion behavior matches Python including stale evidence', () => {
  const d = data();
  d.providers[0].tags = ['provider:test'];
  const queries = [
    { asOf, local: false },
    { asOf, local: false, filters: { lifecycle: ['LIVE'] } },
    { asOf, local: false, filters: { popularity: ['POPULAR'] } },
    { asOf, local: false, filters: { excludeTags: ['lifecycle:LIVE'] } },
    { asOf, local: false, filters: { excludeTags: ['provider:test'] } },
    { asOf: '2027-01-20T00:00:00Z' },
  ];
  const run = spawnSync('python3', ['packages/python/tests/conformance_runner.py', 'models'], {
    input: JSON.stringify({ data: d, queries }),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    JSON.parse(run.stdout),
    queries.map((q) => new byokit.Catalog(d).getModels(q)),
  );
});

test('freshness boundaries, small populations and evidence validation agree in Python', () => {
  const d = data();
  d.offerings[0].lifecycleEvidence = { ...live, checkedAt: '2026-07-14T12:00:00Z' };
  d.offerings[0].popularityEvidence = {
    ...usage,
    rank: 1,
    population: 5,
    windowStart: '2026-09-01T00:00:00Z',
    windowEnd: '2026-09-12T12:00:00Z',
  };
  const q = { asOf, local: false, filters: { lifecycle: ['LIVE'], popularity: ['POPULAR'] } };
  assert.equal(new byokit.Catalog(d).getModels(q).length, 1);
  assert.equal(new byokit.Catalog(d).getModels({ ...q, asOf: '2026-10-12T12:00:01Z' }).length, 0);
  const invalids = [
    null,
    { ...usage, rank: 0 },
    { ...usage, population: 1 },
    { ...usage, source: 'http://example.com' },
    { ...usage, windowStart: 'tomorrow' },
    { ...usage, unexpected: 'field' },
  ].map((p) => {
    const f = fixture();
    f.offerings[0].popularityEvidence = p;
    return f;
  });
  const run = spawnSync(
    'python3',
    [
      '-c',
      `import sys,json;sys.path.insert(0,'packages/python/src');import byokit;print(json.dumps([bool(byokit.validate_catalog(d)) for d in json.load(sys.stdin)]))`,
    ],
    { input: JSON.stringify(invalids), encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    JSON.parse(run.stdout),
    invalids.map((d) => byokit.validateCatalog(d).length > 0),
  );
  assert.ok(JSON.parse(run.stdout).every(Boolean));
});
