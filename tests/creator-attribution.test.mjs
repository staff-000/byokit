import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  creatorFor,
  enrichCatalogCreators,
  creatorCoverage,
} from '../scripts/creator-attribution.mjs';
import bundled from '../packages/byokit/catalog.js';

test('aliases, reseller identifiers and derivative authors resolve independently of display names', () => {
  for (const [id, providerId, apiModelId, expected] of [
    ['google/claude-sonnet-5', 'google', 'claude-sonnet-5', 'anthropic'],
    ['alibaba/kimi-k2', 'alibaba', 'kimi-k2', 'moonshot'],
    ['zhipuai/glm-5', 'zhipuai', 'glm-5', 'zhipu'],
    ['302ai/claude-opus-4-7', '302ai', 'claude-opus-4-7', 'anthropic'],
    ['openrouter/x-ai/grok-4.20', 'openrouter', 'x-ai/grok-4.20', 'xai'],
    ['reseller/deepseek-ai/DeepSeek-V3', 'reseller', 'deepseek-ai/DeepSeek-V3', 'deepseek'],
    [
      'reseller/nousresearch/hermes-llama-3',
      'reseller',
      'nousresearch/hermes-llama-3',
      'nousresearch',
    ],
    ['digitalocean/anthropic-claude-4', 'digitalocean', 'anthropic-claude-4', 'anthropic'],
    ['reseller/us.anthropic.claude-sonnet', 'reseller', 'us.anthropic.claude-sonnet', 'anthropic'],
    ['cloudflare-workers-ai/@cf/meta/llama-3', 'cloudflare-workers-ai', '@cf/meta/llama-3', 'meta'],
    ['reseller/unknown-author/llama-3-tuned', 'reseller', 'unknown-author/llama-3-tuned', null],
    ['reseller/my-claude-copy', 'reseller', 'my-claude-copy', null],
    ['reseller/gptish', 'reseller', 'gptish', null],
    ['openrouter/openrouter/auto', 'openrouter', 'openrouter/auto', null],
  ])
    assert.equal(
      creatorFor(id, { providerId, apiModelId, name: 'Google GPT Claude' }),
      expected,
      id,
    );
});

test('exact aliases propagate only unambiguous attribution and do not change identity', () => {
  const data = {
    models: [
      { id: 'openai/opaque' },
      { id: 'anthropic/opaque' },
      { id: 'reseller/opaque' },
      { id: 'reseller/unique' },
      { id: 'google/unique' },
    ],
    offerings: [
      { id: 'a', modelId: 'openai/opaque', apiModelId: 'opaque' },
      { id: 'b', modelId: 'anthropic/opaque', apiModelId: 'opaque' },
      { id: 'c', modelId: 'reseller/opaque', apiModelId: 'opaque' },
      { id: 'd', modelId: 'reseller/unique', apiModelId: 'unique' },
      { id: 'e', modelId: 'google/unique', apiModelId: 'unique' },
    ],
  };
  const ids = data.models.map((m) => m.id);
  enrichCatalogCreators(data);
  assert.equal(data.models[2].creatorId, null);
  assert.equal(data.models[3].creatorId, 'google');
  assert.deepEqual(
    data.models.map((m) => m.id),
    ids,
  );
  const copy = structuredClone(data);
  enrichCatalogCreators(data);
  assert.deepEqual(data, copy);
});

test('pinned catalogs, bundles and attribution coverage agree', () => {
  const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  const data = load('../catalog/catalog.json');
  assert.deepEqual(bundled, data);
  assert.deepEqual(load('../packages/python/src/byokit/data/catalog.json'), data);
  const before = structuredClone(data);
  const report = enrichCatalogCreators(data);
  assert.deepEqual(data, before);
  assert.deepEqual(report, load('../catalog/creator-coverage.json'));
  assert.deepEqual(report, creatorCoverage(data));
  assert.deepEqual(
    report.unresolvedOpenRouterOfferingIds,
    ['auto', 'bodybuilder', 'free', 'fusion', 'pareto-code'].map(
      (id) => 'openrouter/openrouter/' + id,
    ),
  );
});
