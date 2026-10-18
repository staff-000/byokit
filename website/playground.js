import { playgroundExamples } from './playground-examples.js';
import catalog, { verificationSummary } from '../packages/byokit/catalog.js';
import { attemptText } from './attempt-display.js';
const $ = (selector) => document.querySelector(selector);
const editor = $('#playground-code'),
  output = $('#playground-output'),
  status = $('#playground-status');
let generation = 0,
  frame = null,
  timer = null,
  active = false,
  runtimePromise;
const frameDocument = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'"><script>
let worker;
onmessage=event=>{
 if(event.source!==parent||event.data?.kind!=='byokit-playground-run')return;
 const {source,code,id,verifications}=event.data;
 worker?.terminate();
 const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
 worker=new Worker(url);URL.revokeObjectURL(url);
 worker.onmessage=event=>parent.postMessage(event.data,'*');
 worker.onerror=()=>parent.postMessage({kind:'byokit-playground',type:'error',id,text:'The playground worker could not start.'},'*');
 worker.postMessage({code,id,verifications});
};
<\/script>`;
function finish(message, state = 'ready') {
  active = false;
  clearTimeout(timer);
  frame?.remove();
  frame = null;
  $('#playground-run').disabled = false;
  $('#playground-stop').disabled = true;
  status.textContent = message;
  status.dataset.state = state;
}
function stop(message = 'Stopped. Edit your code and run again.') {
  generation++;
  finish(message);
}
function chooseExample() {
  stop('Ready. Run this example or edit it first.');
  editor.value = playgroundExamples[$('#playground-example').value].code;
  output.textContent = 'Your console output will appear here.';
  resetGeneratedModels();
  capturedConfigs = [];
}
async function run() {
  if (active) return;
  if (!editor.value.trim()) {
    status.textContent = 'Enter some JavaScript first.';
    return;
  }
  if (editor.value.length > 30000) {
    status.textContent = 'Keep your example under 30,000 characters.';
    return;
  }
  const id = ++generation,
    code = editor.value;
  active = true;
  $('#playground-run').disabled = true;
  $('#playground-stop').disabled = false;
  output.textContent = '';
  resetGeneratedModels();
  status.textContent = 'Loading the offline runtime…';
  status.dataset.state = 'running';
  try {
    runtimePromise ??= import('./playground-runtime.js');
    const { workerSource } = await runtimePromise;
    if (id !== generation || !active) return;
    frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('title', 'Isolated JavaScript playground');
    frame.onload = () => {
      if (id !== generation || !active) return;
      status.textContent = 'Running…';
      const storageKey = 'byokit.inference-verifications.v1';
      let verifications = [];
      try {
        verifications = JSON.parse(localStorage.getItem(storageKey) || '[]');
      } catch {}
      frame.contentWindow.postMessage(
        { kind: 'byokit-playground-run', id, source: workerSource, code, verifications },
        '*',
      );
    };
    frame.srcdoc = frameDocument;
    document.body.append(frame);
    timer = setTimeout(() => {
      if (id === generation) stop('Stopped after 3 seconds. Shorten your code and try again.');
    }, 3000);
  } catch {
    if (id === generation) {
      runtimePromise = null;
      finish('The playground could not load. Check your connection and try again.', 'error');
    }
  }
}

let generatedModels = [];
let capturedConfigs = [];
let shownModels = 40;
let drawer = null;
let drawerPromise;
const selectedModels = new Set();
const offeringIndex = new Map(catalog.offerings.map((m) => [m.id, m]));
const MAX_SELECTION = 10;
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function modelSupport(model) {
  const known = offeringIndex.get(model.id);
  if (!known)
    return {
      single: false,
      batch: false,
      reason: 'Custom models need a reviewed browser adapter.',
    };
  const local = known.providerId === 'local';
  const supported = !!known.callSupport?.textGeneration;
  return {
    single: local || supported,
    batch: !local && supported,
    reason: local
      ? 'Local servers support single-model verification.'
      : supported
        ? null
        : known.callSupport?.reason || 'No reviewed provider adapter.',
  };
}
async function sharedDrawer() {
  drawerPromise ??= import('./verification.js').then((module) => module.verificationDrawer);
  try {
    drawer = await drawerPromise;
    return drawer;
  } catch (error) {
    drawerPromise = null;
    throw error;
  }
}
async function openVerification(action) {
  try {
    if (!drawer) $('#playground-verification-status').textContent = 'Opening verification drawer…';
    const controller = await sharedDrawer();
    action(controller);
    renderVerificationState();
  } catch (error) {
    $('#playground-verification-status').textContent =
      error.message || 'The verification drawer could not load. Try again.';
  }
}
function resetGeneratedModels() {
  generatedModels = [];
  selectedModels.clear();
  shownModels = 40;
  renderGeneratedModels();
}
function renderVerificationState() {
  const state = drawer?.state;
  $('#playground-models').hidden = !generatedModels.length && !state?.hasRun;
  $('#playground-selection-count').textContent =
    `${selectedModels.size} of ${MAX_SELECTION} selected`;
  $('#playground-selection-clear').disabled = !selectedModels.size;
  $('#playground-verify-selected').disabled = !selectedModels.size || !!state?.busy;
  $('#playground-verification-reopen').hidden = !state?.hasRun;
  $('#playground-verification-reopen').textContent = state?.busy
    ? 'View verification progress'
    : 'View verification results';
  $('#playground-verification-cancel').hidden = !state?.busy;
  $('#playground-verification-status').textContent = state?.hasRun
    ? state.status
    : 'Select up to 10 models. No requests are sent until you confirm in the drawer.';
  for (const card of document.querySelectorAll(
    '#playground-model-results .playground-model-card',
  )) {
    const record = drawer?.attempt(card.dataset.modelId);
    const personal = card.querySelector('.playground-personal-attempt');
    personal.hidden = !record;
    if (record)
      personal.textContent = `Your attempt: ${record.assessment ? attemptText(record.assessment) : record.result === 'passed' ? 'Call succeeded' : 'Inconclusive'}`;
  }
}
function renderGeneratedModels() {
  const container = $('#playground-model-results');
  const focusedId = document.activeElement?.dataset.playgroundModel;
  container.replaceChildren();
  for (const model of generatedModels.slice(0, shownModels)) {
    const support = modelSupport(model);
    const card = node('article', undefined, 'playground-model-card');
    card.dataset.modelId = model.id;
    const select = node('input');
    select.type = 'checkbox';
    select.className = 'playground-model-pick';
    select.dataset.playgroundModel = model.id;
    select.setAttribute(
      'aria-label',
      `Select ${model.providerName} ${model.name} for verification`,
    );
    select.checked = selectedModels.has(model.id);
    select.disabled = !support.batch || (!select.checked && selectedModels.size >= MAX_SELECTION);
    select.title =
      support.reason ||
      (select.disabled ? 'Choose at most 10 models per batch.' : 'Select for batch verification');
    select.addEventListener('change', () => {
      if (select.checked && selectedModels.size < MAX_SELECTION) selectedModels.add(model.id);
      else selectedModels.delete(model.id);
      renderGeneratedModels();
    });
    const info = node('div', undefined, 'playground-model-info');
    info.append(
      node('span', model.providerName, 'provider-name'),
      node('strong', model.name || model.apiModelId),
      node('code', model.apiModelId || model.id),
    );
    const community = verificationSummary(catalog, model.id).community.status;
    info.append(node('p', `Community: ${community.replaceAll('_', ' ')}`, 'fine'));
    const personal = node('p', '', 'fine playground-personal-attempt');
    personal.hidden = true;
    info.append(personal);
    if (support.reason) info.append(node('p', support.reason, 'fine'));
    const verify = node('button', model.local ? 'Set up local' : 'Verify', 'small-button');
    verify.type = 'button';
    verify.disabled = !support.single;
    if (support.reason) verify.title = support.reason;
    verify.addEventListener('click', () =>
      openVerification((controller) => controller.openModel(model.id)),
    );
    card.append(select, info, verify);
    container.append(card);
  }
  $('#playground-models-title').textContent =
    `${generatedModels.length} query ${generatedModels.length === 1 ? 'result' : 'results'}`;
  $('#playground-models-description').textContent = generatedModels.length
    ? 'Verify individual models or choose a batch. Keys, results, and sharing use the same verification drawer.'
    : 'Run a query to discover models.';
  $('#playground-models-more').hidden = shownModels >= generatedModels.length;
  renderVerificationState();
  if (focusedId)
    [...container.querySelectorAll('input')]
      .find((input) => input.dataset.playgroundModel === focusedId)
      ?.focus({ preventScroll: true });
}
function handleGeneratedModels(models) {
  generatedModels = [
    ...new Map(models.filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m])).values(),
  ];
  selectedModels.clear();
  shownModels = 40;
  renderGeneratedModels();
}
$('#playground-selection-clear').addEventListener('click', () => {
  selectedModels.clear();
  renderGeneratedModels();
});
$('#playground-verify-selected').addEventListener('click', () => {
  const ids = [...selectedModels];
  openVerification((controller) => controller.openBatch(ids));
});
$('#playground-verification-reopen').addEventListener('click', () =>
  openVerification((controller) => controller.reopen()),
);
$('#playground-verification-cancel').addEventListener('click', () => drawer?.cancel());
$('#playground-models-more').addEventListener('click', () => {
  shownModels += 40;
  renderGeneratedModels();
});
window.addEventListener('byokit:verification-state', renderVerificationState);

window.addEventListener('message', (event) => {
  if (!active || !frame || event.source !== frame.contentWindow) return;
  const data = event.data;
  if (!data || data.kind !== 'byokit-playground' || data.id !== generation) return;
  if (data.type === 'log' && typeof data.text === 'string') {
    const available = 26000 - output.textContent.length;
    if (available > 0)
      output.textContent += (output.textContent ? '\n\n' : '') + data.text.slice(0, available);
  } else if (data.type === 'done') {
    if (!output.textContent)
      output.textContent = 'No console output. Use console.log() or return a value.';
    finish('Finished. Output comes from the real byokit catalog.', 'success');
    capturedConfigs = Array.isArray(data.configs) ? data.configs : [];
    if (data.models && data.models.length > 0) {
      handleGeneratedModels(data.models);
    } else {
      resetGeneratedModels();
    }
  } else if (data.type === 'error') {
    output.textContent +=
      (output.textContent ? '\n\n' : '') + String(data.text || 'Execution failed.').slice(0, 2000);
    finish('JavaScript error. Edit your code and try again.', 'error');
  }
});

for (const [value, example] of Object.entries(playgroundExamples)) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = example.label;
  $('#playground-example').append(option);
}
$('#playground-example').addEventListener('change', chooseExample);
$('#playground-run').addEventListener('click', run);
$('#playground-stop').addEventListener('click', () => stop());
$('#playground-reset').addEventListener('click', chooseExample);
$('#playground-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(editor.value);
    status.textContent = 'JavaScript copied.';
  } catch {
    editor.focus();
    editor.select();
    status.textContent = 'Select and copy the JavaScript.';
  }
});
function downloadJson(filename, obj) {
  const jsonStr = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
$('#playground-save-config')?.addEventListener('click', () => {
  if (!capturedConfigs.length) {
    status.textContent = 'Run your code first to generate and save config.json.';
    status.dataset.state = 'warning';
    return;
  }
  const config = capturedConfigs[0];
  downloadJson('byok.config.json', config);
  if (capturedConfigs.length > 1) {
    status.textContent = `Warning: Multiple model list calls detected (${capturedConfigs.length} calls). Saved the config from the first call.`;
    status.dataset.state = 'warning';
  } else {
    status.textContent = 'Saved byok.config.json from your model list call.';
    status.dataset.state = 'success';
  }
});
editor.addEventListener('input', () => {
  capturedConfigs = [];
  if (active) stop('Code changed. Run again to use your edits.');
});
editor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    run();
  }
});
window.addEventListener('pagehide', () => stop());
chooseExample();
