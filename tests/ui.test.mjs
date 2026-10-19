import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { mountByok } from '../packages/byokit/dom/index.js';
import { exact } from '../packages/byokit/index.js';
const data = JSON.parse(readFileSync(new URL('../spec/fixtures/catalog.json', import.meta.url)));
const tick = () => new Promise((r) => setTimeout(r, 0));
function setup(options = {}) {
  const dom = new JSDOM('<div id="app"></div>');
  globalThis.document = dom.window.document;
  const root = document.querySelector('#app');
  const ui = mountByok(root, { catalog: data, onSave: () => {}, ...options });
  return { dom, root, ui };
}
test('save sends only a credential reference and retains a custom ID', async () => {
  let saved, secret;
  const { root, ui } = setup({
    value: { providerId: 'test', modelId: 'my-custom' },
    credentialStore: {
      get: async () => undefined,
      set: async (ref, key) => {
        secret = key;
      },
    },
    onSave: (s) => (saved = s),
  });
  root.querySelector('input[data-role=custom]').value = 'my-custom';
  root.querySelector('input[type=password]').value = 'secret-key';
  root
    .querySelector('form')
    .dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(secret, 'secret-key');
  assert.equal(saved.modelId, 'my-custom');
  assert.equal(saved.apiKey, undefined);
  assert.ok(saved.credentialRef);
  ui.destroy();
  assert.equal(root.children.length, 0);
});
test('stale connection response cannot overwrite a newly edited selection', async () => {
  let resolve;
  const { root, ui } = setup({ onCheck: () => new Promise((r) => (resolve = r)) });
  root.querySelector('input[type=password]').value = 'test';
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'Check connection').click();
  await tick();
  const model = root.querySelectorAll('select')[1];
  model.value = '__custom';
  model.dispatchEvent(new document.defaultView.Event('change'));
  resolve({ ok: false, message: 'old error' });
  await tick();
  assert.ok(!root.textContent.includes('old error'));
  ui.destroy();
});
test('catalog logo URLs are never loaded implicitly', () => {
  const { root, ui } = setup();
  assert.equal(root.querySelector('img').getAttribute('src'), null);
  ui.destroy();
});
test('empty filters explain failure instead of silently choosing a provider', () => {
  const { root, ui } = setup({ config: { local: false, filters: { input: exact('video') } } });
  assert.ok(root.textContent.includes('No models match'));
  assert.ok(root.querySelector('button[type=submit]').disabled);
  ui.destroy();
});

test('a stuck connection check times out and permits retry', async () => {
  const { root, ui } = setup({ checkTimeoutMs: 5, onCheck: () => new Promise(() => {}) });
  root.querySelector('input[type=password]').value = 'key';
  const button = [...root.querySelectorAll('button')].find(
    (b) => b.textContent === 'Check connection',
  );
  button.click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(button.disabled, false);
  assert.equal(root.querySelector('[role=status]').dataset.state, 'error');
  ui.destroy();
});
test('switching providers cannot overwrite the previously saved credential reference', async () => {
  const refs = [];
  const { root, ui } = setup({
    value: {
      providerId: 'test',
      offeringId: 'test/small',
      modelId: 'small',
      credentialRef: 'existing-test',
    },
    credentialStore: { get: async () => undefined, set: async (ref) => refs.push(ref) },
  });
  const provider = root.querySelector('select');
  provider.value = 'local';
  provider.dispatchEvent(new document.defaultView.Event('change'));
  root.querySelector('input[data-role=custom]').value = 'local-model';
  root
    .querySelector('form')
    .dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(refs.length, 1);
  assert.ok(refs[0].startsWith('byokit:local/'));
  assert.notEqual(refs[0], 'existing-test');
  ui.destroy();
});

test('expanded model search preserves the selected model instead of silently replacing it', () => {
  const { root, ui } = setup({ config: { ui: { maxModelsPerProvider: 1 } } });
  const before = ui.getSelection();
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'More models').click();
  const search = root.querySelector('input[type=search]');
  search.value = 'large';
  search.dispatchEvent(new document.defaultView.Event('input'));
  assert.equal(ui.getSelection().modelId, before.modelId);
  assert.ok([...root.querySelectorAll('select')[1].options].some((o) => o.value === 'test/large'));
  ui.destroy();
});

test('provider switches retain distinct drafts and never borrow another provider key', () => {
  const { root, ui } = setup();
  const provider = root.querySelector('select'),
    model = root.querySelectorAll('select')[1],
    key = root.querySelector('input[type=password]');
  model.value = '__custom';
  model.dispatchEvent(new document.defaultView.Event('change'));
  root.querySelector('input[data-role=custom]').value = 'custom-test';
  key.value = 'test-secret';
  provider.value = 'local';
  provider.dispatchEvent(new document.defaultView.Event('change'));
  assert.equal(key.value, '');
  key.value = 'local-secret';
  provider.value = 'test';
  provider.dispatchEvent(new document.defaultView.Event('change'));
  assert.equal(key.value, 'test-secret');
  assert.equal(ui.getSelection().modelId, 'custom-test');
  ui.destroy();
});

test('local URL and protocol drafts survive provider switches and are passed on save', async () => {
  let saved;
  const { root, ui } = setup({
    config: { local: [{ endpoint: 'http://localhost:8000/v1', modelId: 'served-one' }] },
    onSave: (s) => (saved = s),
  });
  const provider = root.querySelector('select'),
    api = root.querySelectorAll('select')[2];
  provider.value = 'local';
  provider.dispatchEvent(new document.defaultView.Event('change'));
  assert.equal(ui.getSelection().endpoint, 'http://localhost:8000/v1');
  assert.equal(ui.getSelection().modelId, 'served-one');
  api.value = 'ollama';
  api.dispatchEvent(new document.defaultView.Event('change'));
  provider.value = 'test';
  provider.dispatchEvent(new document.defaultView.Event('change'));
  provider.value = 'local';
  provider.dispatchEvent(new document.defaultView.Event('change'));
  assert.equal(ui.getSelection().api, 'ollama');
  assert.equal(ui.getSelection().modelId, 'served-one');
  root
    .querySelector('form')
    .dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(saved.api, 'ollama');
  assert.equal(saved.apiKey, undefined);
  ui.destroy();
});
test('a retired saved hosted model is not restored or silently substituted', () => {
  const changed = structuredClone(data);
  changed.offerings[0].lifecycleEvidence.status = 'OUTDATED';
  const { root, ui } = setup({
    catalog: changed,
    value: { providerId: 'test', offeringId: 'test/small', modelId: 'small' },
  });
  const model = root.querySelectorAll('select')[1];
  assert.ok(![...model.options].some((o) => o.value === 'test/small'));
  assert.equal(model.value, '__unavailable');
  assert.equal(ui.getSelection().modelId, '');
  ui.destroy();
});

test('local setup saves a callable model without checking or discovery', async () => {
  let saved,
    checks = 0,
    discoveries = 0;
  const { root, ui } = setup({
    value: { providerId: 'local' },
    onSave: (selection) => (saved = selection),
    onCheck: async () => {
      checks++;
      return { ok: true };
    },
    discoverLocal: async () => {
      discoveries++;
      return [];
    },
  });
  assert.equal(root.querySelector('button[type=submit]').textContent, 'Use this model');
  const form = root.querySelector('form');
  form.dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(saved, undefined);
  root.querySelector('input[data-role=custom]').value = 'installed-model';
  root.querySelector('input[type=url]').value = 'not-a-url';
  form.dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(saved, undefined);
  root.querySelector('input[type=url]').value = 'http://localhost:8000';
  form.dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(checks, 0);
  assert.equal(discoveries, 0);
  assert.equal(saved.model.providerId, 'local');
  assert.equal(saved.model.apiModelId, 'installed-model');
  assert.equal(saved.offeringId, saved.model.id);
  assert.equal(saved.model.connection.baseUrl, 'http://localhost:8000/v1');
  assert.equal(saved.model.callSupport.textGeneration, true);
  ui.destroy();
});

test('picker switches configured local endpoints and clears connection credentials', () => {
  const { root, ui, dom } = setup({
    value: { providerId: 'local' },
    config: {
      local: [
        { endpoint: 'http://localhost:8000', modelId: 'one' },
        { endpoint: 'http://localhost:11434', api: 'ollama', modelId: 'two' },
      ],
    },
  });
  const model = root.querySelectorAll('select')[1];
  root.querySelector('input[type=password]').value = 'first-server-key';
  model.value = model.options[1].value;
  model.dispatchEvent(new dom.window.Event('change'));
  assert.equal(ui.getSelection().model.apiModelId, 'two');
  assert.equal(ui.getSelection().model.connection.baseUrl, 'http://localhost:11434');
  assert.equal(ui.getSelection().api, 'ollama');
  assert.equal(root.querySelector('input[type=password]').value, '');
  ui.destroy();
});
