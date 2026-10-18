import { shouldStopProvider } from '../packages/byokit/verification.js';
import { assessmentForError, attemptText, retryCountdown } from './attempt-display.js';
import { playgroundExamples } from './playground-examples.js';
import { verifyInference, successRecord, ProviderApi } from './inference.js';
import { createReport, issueUrl } from './verification-report.js';
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
  availabilityController?.abort();
  finish(message);
}
function chooseExample() {
  stop('Ready. Run this example or edit it first.');
  editor.value = playgroundExamples[$('#playground-example').value].code;
  output.textContent = 'Your console output will appear here.';
  $('#playground-availability').hidden = true;
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
let availabilityController = null;
const availabilityKeys = new Map();

function renderAvailabilityResults() {
  const container = $('#availability-results');
  if (!container) return;
  container.replaceChildren();
  const storageKey = 'byokit.inference-verifications.v1';
  let records = [];
  try {
    records = JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {}

  for (const m of generatedModels) {
    const card = document.createElement('article');
    card.className = 'report';
    card.dataset.modelId = m.id;
    const isVerifiedLocally = records.some((r) => r.offeringId === m.id);
    const passed = isVerifiedLocally || m.verification?.status === 'passed';

    const header = document.createElement('strong');
    header.textContent = `${m.providerName} / ${m.name || m.apiModelId}`;
    const badge = document.createElement('span');
    badge.className = 'status badge ' + (passed ? 'passed' : '');
    badge.textContent = passed ? 'Verified ✓' : 'Unverified';

    const meta = document.createElement('p');
    meta.className = 'fine';
    meta.textContent = `${m.apiModelId} · ${m.protocol || 'chat'}`;

    card.append(header, badge, meta);
    container.append(card);
  }
}

function renderAvailabilityKeys(providers) {
  const container = $('#availability-keys');
  if (!container) return;
  container.replaceChildren();
  for (const pId of providers) {
    const pName = ProviderApi[pId]?.name || pId;
    const label = document.createElement('label');
    label.className = 'api-key-item';
    const span = document.createElement('span');
    span.textContent = `${pName} API key`;
    const input = document.createElement('input');
    input.type = 'password';
    input.dataset.provider = pId;
    input.placeholder = `Paste your ${pName} key`;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    if (availabilityKeys.has(pId)) {
      input.value = availabilityKeys.get(pId);
    }
    input.addEventListener('input', () => {
      availabilityKeys.set(pId, input.value.trim());
    });
    label.append(span, input);
    container.append(label);
  }
}

function handleGeneratedModels(models) {
  generatedModels = models;
  const availSection = $('#playground-availability');
  if (!availSection) return;
  availSection.hidden = false;
  const providers = [...new Set(models.map((m) => m.providerId))].filter((p) => p && p !== 'local');
  $('#availability-title').textContent =
    `Generated ${models.length} ${models.length === 1 ? 'model' : 'models'} across ${providers.length} ${providers.length === 1 ? 'provider' : 'providers'}`;
  const provNames = providers.map((p) => ProviderApi[p]?.name || p);
  $('#availability-subtitle').textContent = provNames.length
    ? `Providers: ${provNames.join(', ')}. Test availability with your API keys.`
    : 'All generated models are local or require no API keys.';

  renderAvailabilityResults();
  renderAvailabilityKeys(providers);
}

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
      $('#playground-availability').hidden = true;
    }
  } else if (data.type === 'error') {
    output.textContent +=
      (output.textContent ? '\n\n' : '') + String(data.text || 'Execution failed.').slice(0, 2000);
    finish('JavaScript error. Edit your code and try again.', 'error');
  }
});

$('#availability-start-btn')?.addEventListener('click', () => {
  const drawer = $('#availability-drawer');
  if (!drawer) return;
  drawer.hidden = !drawer.hidden;
  $('#availability-start-btn').textContent = drawer.hidden
    ? 'Test model availability'
    : 'Hide test panel';
});

$('#availability-clear-btn')?.addEventListener('click', () => {
  availabilityKeys.clear();
  for (const inp of document.querySelectorAll('#availability-keys input')) {
    inp.value = '';
  }
  $('#availability-status').textContent = 'API keys cleared.';
});

$('#availability-cancel-btn')?.addEventListener('click', () => {
  availabilityController?.abort();
});

$('#availability-run-btn')?.addEventListener('click', async () => {
  if (availabilityController) return;
  if (!generatedModels.length) return;
  const keyInputs = document.querySelectorAll('#availability-keys input');
  for (const inp of keyInputs) {
    if (inp.value.trim()) availabilityKeys.set(inp.dataset.provider, inp.value.trim());
  }
  if (!availabilityKeys.size) {
    $('#availability-status').textContent =
      'Please enter an API key for at least one provider to test availability.';
    return;
  }
  const controller = new AbortController();
  availabilityController = controller;
  $('#availability-run-btn').disabled = true;
  $('#availability-cancel-btn').hidden = false;

  const storageKey = 'byokit.inference-verifications.v1';
  let records = [];
  try {
    records = JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {}

  let verifiedCount = 0,
    failedCount = 0,
    skippedCount = 0;
  const providerStops = new Map();

  for (let i = 0; i < generatedModels.length; i++) {
    if (controller.signal.aborted) break;
    const model = generatedModels[i];
    const card = document.querySelector(`#availability-results [data-model-id="${model.id}"]`);
    const pId = model.providerId;
    const key = availabilityKeys.get(pId);

    if (model.local) {
      if (card) {
        card.querySelector('.status').textContent = 'Local setup';
        card.querySelector('.status').className = 'status badge';
      }
      continue;
    }

    if (!key) {
      skippedCount++;
      if (card) {
        card.querySelector('.status').textContent = `Skipped (no ${model.providerName} key)`;
        card.querySelector('.status').className = 'status badge';
      }
      continue;
    }

    if (providerStops.has(pId)) {
      skippedCount++;
      if (card) {
        card.querySelector('.status').textContent = `Not attempted: ${providerStops.get(pId)}`;
        card.querySelector('.status').className = 'status badge uncertain';
      }
      continue;
    }

    if (card) card.querySelector('.status').textContent = 'Testing…';
    $('#availability-status').textContent =
      `Testing availability ${i + 1} of ${generatedModels.length}: ${model.name || model.apiModelId} (${model.providerName})…`;

    const job = {
      offeringId: model.id,
      providerId: model.providerId,
      modelId: model.apiModelId,
      protocol: model.protocol || ProviderApi[model.providerId]?.protocols?.[0] || 'chat',
      endpoint: model.endpoint,
      prompt: 'Reply with exactly: OK',
      maxTokens: 256,
    };

    try {
      const result = await verifyInference(job, key, { signal: controller.signal });
      if (controller.signal.aborted) break;
      verifiedCount++;
      const record = successRecord(job, result, key);
      records = [record, ...records.filter((r) => r.offeringId !== record.offeringId)].slice(
        0,
        200,
      );
      try {
        localStorage.setItem(storageKey, JSON.stringify(records));
      } catch {}

      model.verification = {
        ...model.verification,
        attempt: result.assessment.attempt,
        personalChecks: result.assessment.checks,
      };
      // A local check does not replace published community evidence.

      if (card) {
        card.querySelector('.status').textContent =
          `Your call succeeded ✓ (${result.latencyMs} ms)`;
        card.querySelector('.status').className = 'status badge passed';
        try {
          const report = createReport(job, result, record.id, key);
          const oldActions = card.querySelector('.playground-card-actions');
          if (oldActions) oldActions.remove();
          const actions = document.createElement('div');
          actions.className = 'playground-card-actions';
          actions.style.marginTop = '10px';
          actions.style.display = 'flex';
          actions.style.gap = '8px';
          actions.style.flexWrap = 'wrap';

          const shareLink = document.createElement('a');
          shareLink.className = 'button primary action-highlight';
          shareLink.style.fontSize = '11.5px';
          shareLink.style.padding = '4px 10px';
          shareLink.textContent = 'Share on GitHub · claim badge ↗';
          shareLink.href = issueUrl(report);
          shareLink.target = '_blank';
          shareLink.rel = 'noopener noreferrer';
          shareLink.addEventListener('click', () => {
            if (window.trackVerificationPublication) {
              window.trackVerificationPublication(report);
            }
          });
          actions.append(shareLink);

          if (window.selectVerificationModel) {
            const selectBtn = document.createElement('button');
            selectBtn.type = 'button';
            selectBtn.className = 'small-button';
            selectBtn.textContent = 'Open verification drawer';
            selectBtn.addEventListener('click', () => {
              window.selectVerificationModel(model.id, key);
            });
            actions.append(selectBtn);
          }

          card.append(actions);
        } catch (e) {
          console.warn('[byokit playground] could not create report for model', e);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) break;
      failedCount++;
      const assessment = assessmentForError(err);
      model.verification = { ...model.verification, attempt: assessment.attempt };
      const observation = {
        assessment,
        checkedAt: err.checkedAt || new Date().toISOString(),
        latencyMs: err.latencyMs || 0,
        usage: {},
      };
      const record = successRecord(job, observation, key);
      records = [record, ...records].slice(0, 200);
      try {
        localStorage.setItem(storageKey, JSON.stringify(records));
      } catch {
        /* Memory remains available. */
      }
      if (card) {
        card.querySelector('.status').textContent = attemptText(assessment);
        card.querySelector('.status').className = 'status badge uncertain';
        const guidance = document.createElement('p');
        guidance.className = 'fine';
        card.append(guidance);
        retryCountdown(guidance, assessment.attempt);
        try {
          const report = createReport(job, observation, record.id, key),
            share = document.createElement('a');
          share.className = 'text-link';
          share.textContent = 'Share sanitized issue category on GitHub ↗';
          share.href = issueUrl(report);
          share.target = '_blank';
          share.rel = 'noopener noreferrer';
          share.addEventListener('click', () => window.trackVerificationPublication?.(report));
          card.append(share);
        } catch {
          /* Unsupported local observations cannot be published. */
        }
      }
      if (shouldStopProvider(assessment.attempt)) providerStops.set(pId, attemptText(assessment));
    }
  }

  availabilityController = null;
  $('#availability-run-btn').disabled = false;
  $('#availability-cancel-btn').hidden = true;
  $('#availability-status').textContent = controller.signal.aborted
    ? `Availability test canceled. ${verifiedCount} verified, ${failedCount} blocked or inconclusive, ${skippedCount} skipped.`
    : `Availability test complete: ${verifiedCount} verified, ${failedCount} blocked or inconclusive, ${skippedCount} skipped.${verifiedCount ? ' Click "Share on GitHub" on any verified card above to submit your report and update the status via GitHub Actions!' : ''}`;
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
