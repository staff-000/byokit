import { filterModels } from './verification-filters.js';
import { runBatch, validateBatch, MAX_BATCH_REQUESTS } from './batch-verification.js';
import { contributorBadges, badgeMarkdown } from './contributor-badges.js';
import { createReport, issueUrl, PublicationTracker } from './verification-report.js';
import catalog, * as byokit from './lib/core/catalog.js';
import { requestExample } from './request-examples.js';
import {
  ProviderApi,
  ProtocolNames,
  verifyInference,
  successRecord,
  safeRecords,
  requestFor,
} from './inference.js';
const $ = (s) => document.querySelector(s),
  el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
// Render canonical bundled evidence immediately; canceling a pending feed refresh
// while changing filters must not erase existing contributor badges.
let activeReport = null,
  publishedReports = catalog.verifications ?? [];
function publicationStatus(message) {
  $('#publication-status').textContent = message;
}
const tracker = new PublicationTracker((reports) => {
  const errors = byokit.validateVerifications(reports, catalog);
  if (errors.length) throw new Error('Invalid published verification records.');
  publishedReports = reports;
  byokit.addVerifications?.(reports);
  renderModels();
  renderContributors();
});
function trackPublication() {
  if (!activeReport) return;
  tracker.start(
    activeReport.operationId,
    (state, record) => {
      if (state === 'published') {
        publicationStatus(
          `Published: community verified by ${record.contributor.replace('github:', '@')} on ${new Date(record.checkedAt).toLocaleDateString()}.`,
        );
        $('#check-publication').hidden = true;
        const badge = contributorBadges(publishedReports).find(
          (b) => b.login.toLowerCase() === record.contributor.slice(7).toLowerCase(),
        );
        if (badge) {
          $('#earned-badge').href = badge.recognitionUrl;
          $('#earned-badge-image').src = './' + badge.badgePath;
          $('#earned-badge').hidden = false;
          publicationStatus($('#publication-status').textContent + ' Model Verifier badge earned!');
        }
      } else
        publicationStatus(
          state === 'unavailable'
            ? 'Publication feed is unavailable. Check again later.'
            : state === 'pending'
              ? 'Publication is not confirmed yet. Submit the issue on GitHub, or check its workflow and try Check publication.'
              : 'Submit the issue on GitHub. Waiting for it to appear on the website…',
        );
    },
    activeReport.offeringId,
  );
}
$('#share-verification').addEventListener('click', () => {
  publicationStatus('The GitHub form is open. Submit new issue there to share your report.');
  $('#check-publication').hidden = false;
  trackPublication();
});
$('#check-publication').addEventListener('click', trackPublication);
const storageKey = 'byokit.inference-verifications.v1';
let records = [],
  storageAvailable = true;
try {
  records = safeRecords(JSON.parse(localStorage.getItem(storageKey) || '[]'));
} catch {
  storageAvailable = false;
}
const models = byokit.getModels(byokit.COMPLETE, {
  filters: { lifecycle: Object.values(byokit.Lifecycle), includeDeprecated: true },
});
function isUnverified(m) {
  if (!m || m.local) return false;
  if (records.some((r) => r.offeringId === m.id)) return false;
  const summary = byokit.verificationSummary({ verifications: publishedReports }, m.id);
  return summary.status !== 'passed';
}
function nextUnverifiedModel(fromModel, list = models) {
  const candidates = list.filter((m) => !m.local && m.callSupport?.textGeneration);
  if (!candidates.length) return null;
  const fromIdx = fromModel ? candidates.findIndex((m) => m.id === fromModel.id) : -1;
  for (let i = fromIdx + 1; i < candidates.length; i++) {
    if (isUnverified(candidates[i])) return candidates[i];
  }
  for (let i = 0; i <= fromIdx && i < candidates.length; i++) {
    if (isUnverified(candidates[i])) return candidates[i];
  }
  return candidates[0];
}
let selected = nextUnverifiedModel(null, models) || filterModels()[0] || models[0],
  shown = 40,
  revision = 0,
  controller = null,
  busy = false,
  requestLanguage = 'javascript';
const batchSelection = new Map();
let batchController = null,
  pendingBatch = null,
  batchSerial = 0;
function settings() {
  const local = !!selected.local;
  return {
    offeringId: selected.id,
    providerId: selected.providerId,
    modelId: local ? $('#local-model').value.trim() : selected.apiModelId,
    endpoint: local ? $('#endpoint').value.trim() : undefined,
    protocol: $('#protocol').value,
    prompt: $('#prompt').value,
    maxTokens: Number($('#max-tokens').value),
  };
}
function status(text, kind) {
  $('#call-status').textContent = text;
  $('#call-status').dataset.state = kind || '';
}
function invalidate() {
  revision++;
  batchController?.abort();
  pendingBatch = null;
  if ($('#batch-confirm').open) $('#batch-confirm').close();
  controller?.abort();
  busy = false;
  $('#verify').disabled = false;
  tracker.stop();
  activeReport = null;
  $('#share-verification').hidden = true;
  $('#next-unverified-advance')?.setAttribute('hidden', '');
  $('#check-publication').hidden = true;
  publicationStatus('');
  $('#earned-badge').hidden = true;
  $('#cancel').hidden = true;
  $('#response-text').hidden = true;
  status('Settings changed. Verify this configuration to check it.');
}
function renderRequest() {
  try {
    $('#request-code').textContent = requestExample(settings(), requestLanguage, {
      authenticated: selected.providerId !== 'local' || !!$('#api-key').value.trim(),
    });
  } catch {
    $('#request-code').textContent = 'Complete valid model settings to see the request.';
  }
}
function destination() {
  renderRequest();
  try {
    $('#destination').textContent = requestFor(
      { ...settings(), prompt: 'check' },
      'display-only',
    ).url;
  } catch {
    $('#destination').textContent = selected.local
      ? 'Enter your server URL and model ID.'
      : ProviderApi[selected.providerId]?.base || 'Unsupported provider';
  }
}
function select(model) {
  const changedProvider = selected?.providerId !== model.providerId;
  invalidate();
  selected = model;
  if (changedProvider) $('#api-key').value = '';
  $('#verify').textContent = model.local ? 'Verify local model ↗' : 'Verify model · earn a badge ↗';
  $('#badge-hint').textContent = model.local
    ? 'Local checks stay private. Publish a hosted-model report to earn a badge.'
    : 'Earn a Model Verifier badge: verify a hosted model, share the success on GitHub, and receive your badge after publication.';
  $('#selected-name').textContent = model.name;
  $('#selected-id').textContent = model.id;
  const api = ProviderApi[model.providerId];
  $('#protocol').replaceChildren(
    ...(api?.protocols || []).map((p) => {
      const option = el('option', ProtocolNames[p]);
      option.value = p;
      return option;
    }),
  );
  $('#local-fields').hidden = !model.local;
  $('#key-optional').textContent = model.local ? '(optional)' : '';
  $('#provider-docs').hidden = !api?.docs;
  if (api?.docs) $('#provider-docs').href = api.docs;
  destination();
  status('Ready to verify. No call has been made.');
}
function filteredModels() {
  return filterModels({
    search: $('#model-search').value,
    provider: $('#provider-filter').value,
    region: $('#region-filter').value,
    excludeTag: $('#exclude-tag-filter').value,
    feature: $('#feature-filter').value,
    modality: $('#modality-filter').value,
    weights: $('#weights-filter').value,
    context: $('#context-filter').value,
    price: $('#price-filter').value,
    sort: $('#sort-filter').value,
    verification: $('#verification-filter')?.value,
    verifications: publishedReports,
    includeOutdated: $('#include-outdated').checked,
  });
}
function renderModels() {
  const filtered = filteredModels();
  $('#model-count').textContent = `${filtered.length} entries`;
  const rows = filtered.slice(0, shown).map((m) => {
    const tr = el('tr'),
      pick = el('td'),
      checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'batch-pick';
    checkbox.setAttribute('aria-label', `Select ${m.provider.name} ${m.name} for batch`);
    checkbox.checked = batchSelection.has(m.id);
    checkbox.disabled =
      !!m.local ||
      !m.callSupport?.textGeneration ||
      busy ||
      !!batchController ||
      (!!batchSelection.size && batchSelection.values().next().value.providerId !== m.providerId);
    checkbox.addEventListener('change', () => toggleBatch(m, checkbox.checked));
    pick.append(checkbox);
    const name = el('td');
    name.append(
      el('span', m.provider.name, 'provider-name'),
      el('div', m.name, 'model-name'),
      el('code', m.apiModelId || 'Configure your local server', 'model-id'),
    );
    const context = el('td');
    context.dataset.label = 'Context';
    context.append(
      el(
        'span',
        m.limits.context ? m.limits.context.toLocaleString() + ' tokens' : 'Unknown',
        'metric-value',
      ),
    );
    const price = el('td');
    price.dataset.label = 'Price / 1M tokens';
    const money = (value) =>
      value == null
        ? 'Unknown'
        : (m.price.currency === byokit.Currency.USD ? '$' : m.price.currency + ' ') +
          value.toLocaleString(undefined, { maximumFractionDigits: 6 });
    price.append(
      el('span', 'Input ' + money(m.price.input), 'metric-value'),
      el('span', 'Output ' + money(m.price.output), 'evidence-note'),
    );
    const performance = el('td');
    performance.dataset.label = 'Speed / release';
    performance.append(
      el(
        'span',
        m.speed?.tokensPerSecond != null
          ? m.speed.tokensPerSecond.toLocaleString() + ' tokens/sec'
          : 'Speed unknown',
        'metric-value',
      ),
      el('span', 'Released ' + (m.releaseDate || 'unknown'), 'evidence-note'),
    );
    const inputCell = el('td');
    inputCell.dataset.label = 'Input';
    const inputTags = el('div', undefined, 'model-tags');
    for (const mod of m.modalities?.input || ['text']) {
      inputTags.append(el('span', mod, 'tag modality-' + mod));
    }
    inputCell.append(inputTags);
    const metadata = el('td');
    metadata.dataset.label = 'Tags & capabilities';
    metadata.append(
      el(
        'span',
        m.model.openWeights === true
          ? 'Open weights'
          : m.model.openWeights === false
            ? 'Closed weights'
            : 'Weights unknown',
        'evidence-note',
      ),
    );
    const tags = el('div', undefined, 'model-tags'),
      tagValues = [...new Set([...m.tags, ...m.model.tags, ...(m.provider.tags || [])])];
    for (const tag of tagValues.slice(0, 4)) tags.append(el('span', tag, 'tag'));
    if (tagValues.length > 4) {
      const details = el('details', undefined, 'table-tags'),
        more = el('div', undefined, 'model-tags');
      details.append(el('summary', tagValues.length - 4 + ' more tags'));
      for (const tag of tagValues.slice(4)) more.append(el('span', tag, 'tag'));
      details.append(more);
      tags.append(details);
    }
    metadata.append(tags);
    const action = el('td');
    action.dataset.label = 'Status / verification';
    action.append(
      el(
        'span',
        m.local ? 'LOCAL SETUP' : m.lifecycle.status,
        'badge ' + (m.lifecycle.status === byokit.Lifecycle.Live ? 'live' : 'uncertain'),
      ),
    );
    const last = records.find((r) => r.offeringId === m.id),
      summary = byokit.verificationSummary({ verifications: publishedReports }, m.id);
    if (last)
      action.append(
        el('span', 'Verified here', 'badge passed'),
        el('span', new Date(last.checkedAt).toLocaleDateString(), 'evidence-note'),
      );
    if (summary.latest) {
      const report = summary.latest,
        isFailure =
          summary.communityStatus === 'verified to be failure' || summary.status === 'failed',
        badgeText = isFailure ? 'Verified to be failure' : 'Community: verified',
        badgeClass = isFailure ? 'badge uncertain' : 'badge passed',
        label =
          summary.status === 'stale'
            ? 'Historical verification'
            : isFailure
              ? 'Verified to be failure'
              : 'Community verified',
        link = el(
          'a',
          `${label} by ${report.contributor.replace('github:', '@')} · ${new Date(report.checkedAt).toLocaleDateString()}`,
          'evidence-note',
        );
      link.href = report.evidence;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      action.append(el('span', badgeText, badgeClass), link);
    } else if (!last) action.append(el('span', 'Community: unverified', 'evidence-note'));
    const button = el('button', 'Verify', 'small-button');
    button.type = 'button';
    button.disabled = !m.local && !m.callSupport?.textGeneration;
    if (!m.local && !m.callSupport?.textGeneration)
      button.title = m.callSupport?.reason || 'No reviewed adapter';
    action.append(
      el(
        'span',
        m.callSupport?.textGeneration
          ? 'Text calls supported'
          : m.callSupport?.reason || 'Local setup',
        'evidence-note',
      ),
    );
    button.addEventListener('click', () => {
      select(m);
      $('#call-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#api-key').focus({ preventScroll: true });
    });
    action.append(button);
    pick.dataset.label = 'Batch';
    tr.append(pick, name, context, price, performance, inputCell, metadata, action);
    return tr;
  });
  $('#models').replaceChildren(...rows);
  if (!rows.length) {
    const tr = el('tr'),
      td = el('td', 'No matching models. Change your search or filter.', 'empty');
    td.colSpan = 8;
    tr.append(td);
    $('#models').append(tr);
  }
  $('#paging-note').textContent =
    `Showing ${Math.min(shown, filtered.length)} of ${filtered.length} entries.`;
  $('#show-more').hidden = shown >= filtered.length;
  updateBatchControls();
}
function updateBatchControls() {
  $('#batch-count').textContent =
    `${batchSelection.size} ${batchSelection.size === 1 ? 'model' : 'models'} selected${batchSelection.size ? ' · ' + batchSelection.values().next().value.provider.name : ''}`;
  $('#batch-open').disabled = !batchSelection.size || busy || !!batchController;
  $('#batch-clear').disabled = !!batchController;
  $('#batch-select-shown').disabled = busy || !!batchController;
}
function toggleBatch(model, checked) {
  if (batchController || busy) return;
  if (checked) {
    if (batchSelection.size >= MAX_BATCH_REQUESTS) {
      $('#batch-status').textContent = 'Choose at most 10 models per batch.';
      renderModels();
      return;
    }
    if (batchSelection.size && batchSelection.values().next().value.providerId !== model.providerId)
      return;
    if (!batchSelection.size) select(model);
    batchSelection.set(model.id, model);
  } else batchSelection.delete(model.id);
  renderModels();
}
$('#batch-select-shown').addEventListener('click', () => {
  const eligible = filteredModels()
    .slice(0, shown)
    .filter((m) => !m.local && m.callSupport?.textGeneration);
  if (!eligible.length) return;
  const provider = batchSelection.size
    ? batchSelection.values().next().value.providerId
    : eligible[0].providerId;
  if (!batchSelection.size) select(eligible.find((m) => m.providerId === provider));
  for (const model of eligible.filter((m) => m.providerId === provider)) {
    if (batchSelection.size >= MAX_BATCH_REQUESTS) break;
    batchSelection.set(model.id, model);
  }
  renderModels();
});
$('#batch-clear').addEventListener('click', () => {
  batchSelection.clear();
  renderModels();
  $('#batch-status').textContent = 'Selection cleared.';
});
$('#batch-open').addEventListener('click', () => {
  const common = settings(),
    jobs = [...batchSelection.values()].map((model) => ({
      ...common,
      offeringId: model.id,
      providerId: model.providerId,
      modelId: model.apiModelId,
      protocol: ProviderApi[model.providerId].protocols[0],
      endpoint: undefined,
    }));
  try {
    validateBatch(jobs, $('#api-key').value.trim());
  } catch (error) {
    $('#batch-status').textContent = error.message;
    return;
  }
  pendingBatch = { jobs, revision };
  $('#batch-confirm-description').textContent =
    `Send up to ${jobs.length} AI ${jobs.length === 1 ? 'request' : 'requests'} to ${ProviderApi[jobs[0].providerId].name}? One request per model, with up to ${common.maxTokens} output tokens each.`;
  $('#batch-confirm-models').replaceChildren(...jobs.map((job) => el('li', job.modelId)));
  $('#batch-confirm-send').textContent =
    `Send ${jobs.length} ${jobs.length === 1 ? 'request' : 'requests'}`;
  $('#batch-confirm').showModal();
});
$('#batch-confirm-cancel').addEventListener('click', () => {
  pendingBatch = null;
  $('#batch-confirm').close();
});
$('#batch-confirm').addEventListener('cancel', () => {
  pendingBatch = null;
});
$('#batch-cancel').addEventListener('click', () => batchController?.abort());
$('#batch-confirm-send').addEventListener('click', async () => {
  const pending = pendingBatch;
  if (!pending || pending.revision !== revision || batchController) return;
  pendingBatch = null;
  $('#batch-confirm').close();
  tracker.stop();
  activeReport = null;
  $('#share-verification').hidden = true;
  $('#check-publication').hidden = true;
  $('#earned-badge').hidden = true;
  publicationStatus('');
  const key = $('#api-key').value.trim(),
    id = ++batchSerial,
    capturedRevision = revision,
    controller = new AbortController();
  batchController = controller;
  $('#batch-cancel').hidden = false;
  $('#verify').disabled = true;
  $('#batch-results').replaceChildren();
  const cards = new Map();
  let sent = 0;
  for (const job of pending.jobs) {
    const card = el('article', undefined, 'report');
    card.append(el('strong', job.modelId), el('p', 'Queued', 'fine'));
    cards.set(job.offeringId, card);
    $('#batch-results').append(card);
  }
  renderModels();
  $('#batch-status').textContent = `Confirmed ${pending.jobs.length} requests. Starting…`;
  try {
    const entries = await runBatch(pending.jobs, key, {
      signal: controller.signal,
      onResult: (entry) => {
        if (id !== batchSerial) return;
        const card = cards.get(entry.offeringId),
          job = pending.jobs.find((j) => j.offeringId === entry.offeringId);
        card.querySelector('p').textContent =
          entry.status === 'running'
            ? 'Calling provider…'
            : entry.status === 'passed'
              ? 'Call succeeded'
              : entry.error;
        if (entry.status === 'running') {
          sent++;
          $('#batch-status').textContent =
            `Request ${sent} of ${pending.jobs.length}: ${job.modelId}`;
        }
        if (
          entry.status === 'passed' &&
          capturedRevision === revision &&
          !controller.signal.aborted
        ) {
          const record = successRecord(job, entry.result, key);
          records = [record, ...records].slice(0, 200);
          try {
            localStorage.setItem(storageKey, JSON.stringify(records));
          } catch {
            storageAvailable = false;
          }
          try {
            const report = createReport(job, entry.result, record.id, key),
              share = el('a', 'Share this success on GitHub · claim badge ↗', 'text-link');
            share.href = issueUrl(report);
            share.target = '_blank';
            share.rel = 'noopener noreferrer';
            share.addEventListener('click', () => {
              activeReport = report;
              $('#check-publication').hidden = false;
              publicationStatus(
                `Submit the GitHub issue for ${job.modelId} to publish this result.`,
              );
              trackPublication();
            });
            card.append(share);
          } catch {
            card.append(
              el('p', 'Call succeeded, but this record cannot be shared safely.', 'fine'),
            );
          }
          renderRecords();
        }
      },
    });
    if (id === batchSerial)
      $('#batch-status').textContent =
        `${controller.signal.aborted ? 'Batch canceled.' : 'Batch finished.'} ${sent} requests sent · ${entries.filter((e) => e.status === 'passed').length} succeeded · ${entries.filter((e) => e.status === 'failed').length} failed · ${entries.filter((e) => e.status === 'skipped').length} skipped. Share successful reports individually on GitHub.`;
  } catch {
    if (id === batchSerial)
      $('#batch-status').textContent =
        'Batch stopped. Review your provider key and request settings.';
  } finally {
    if (id === batchSerial) {
      batchController = null;
      $('#batch-cancel').hidden = true;
      $('#verify').disabled = false;
      renderModels();
    }
  }
});
function renderContributors() {
  const list = $('#contributor-list');
  list.replaceChildren();
  const badges = contributorBadges(publishedReports);
  if (!badges.length) {
    list.append(
      el(
        'p',
        'Be the first to earn a Model Verifier badge by publishing a successful model check.',
        'fine',
      ),
    );
    return;
  }
  for (const badge of badges) {
    const card = el('article', undefined, 'contributor-card');
    card.id = 'contributor-' + badge.identity;
    const profile = el('a', '@' + badge.login, 'contributor-name');
    profile.href = badge.profileUrl;
    profile.target = '_blank';
    profile.rel = 'noopener noreferrer';
    const image = el('img');
    image.src = './' + badge.badgePath;
    image.alt = `byokit Model Verifier — @${badge.login}`;
    image.loading = 'lazy';
    const evidence = el('a', 'View verification ↗', 'text-link');
    evidence.href = badge.evidence;
    evidence.target = '_blank';
    evidence.rel = 'noopener noreferrer';
    const copy = el('button', 'Copy badge Markdown', 'small-button');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(badgeMarkdown(badge));
        copy.textContent = 'Copied';
      } catch {
        code.hidden = false;
        copy.textContent = 'Select Markdown below';
      }
    });
    const code = el('code', badgeMarkdown(badge), 'badge-markdown');
    code.hidden = true;
    const actions = el('div', undefined, 'record-actions');
    actions.append(evidence, copy);
    card.append(
      profile,
      image,
      el(
        'p',
        `${badge.verifiedModels} ${badge.verifiedModels === 1 ? 'model' : 'models'} verified · first contribution ${new Date(badge.firstVerifiedAt).toLocaleDateString()}`,
        'fine',
      ),
      actions,
      code,
    );
    list.append(card);
  }
  const target = window.location.hash.slice(1);
  if (target.startsWith('contributor-'))
    document.getElementById(target)?.scrollIntoView({ block: 'start' });
}
function renderRecords() {
  const list = $('#records');
  list.replaceChildren();
  if (!records.length)
    list.append(el('div', 'No successful inference calls recorded in this browser yet.', 'report'));
  for (const r of records.slice(0, 30)) {
    const card = el('article', undefined, 'report');
    card.append(
      el('strong', r.offeringId),
      el('span', 'Passed', 'badge passed'),
      el('p', `${r.checkedAt} · ${ProtocolNames[r.protocol] || r.protocol} · ${r.latencyMs} ms`),
      el('code', `${r.modelId} · max output ${r.maxTokens}`),
    );
    if (r.returnedModel !== r.modelId)
      card.append(el('p', `Provider returned model: ${r.returnedModel}`));
    list.append(card);
  }
  $('#export-records').disabled = !records.length;
  $('#clear-records').disabled = !records.length;
  $('#storage-note').textContent = storageAvailable
    ? 'Records stay in this browser until you clear or export them.'
    : 'Browser storage is unavailable. Records stay in memory for this visit; export them before leaving.';
}
$('#verify-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || batchController) return;
  const captured = settings(),
    key = $('#api-key').value.trim(),
    id = ++revision;
  busy = true;
  controller = new AbortController();
  $('#verify').disabled = true;
  $('#cancel').hidden = false;
  $('#response-text').hidden = true;
  tracker.stop();
  activeReport = null;
  $('#share-verification').hidden = true;
  $('#check-publication').hidden = true;
  publicationStatus('');
  $('#earned-badge').hidden = true;
  try {
    requestFor(captured, key);
    status('Calling the selected provider…', 'checking');
    const result = await verifyInference(captured, key, { signal: controller.signal });
    if (id !== revision) return;
    const record = successRecord(captured, result, key);
    records = [record, ...records].slice(0, 200);
    try {
      localStorage.setItem(storageKey, JSON.stringify(records));
    } catch {
      storageAvailable = false;
    }
    $('#response-text').textContent = result.text;
    $('#response-text').hidden = false;
    status(
      `Call succeeded in ${result.latencyMs} ms. Recorded ${storageAvailable ? 'in this browser' : 'in memory for this visit'}.`,
      'success',
    );
    renderRecords();
    renderModels();
    if (captured.providerId !== 'local') {
      try {
        activeReport = createReport(captured, result, record.id, key);
        $('#share-verification').href = issueUrl(activeReport);
        $('#share-verification').hidden = false;
        const advanceBtn = $('#next-unverified-advance');
        const nextModel = nextUnverifiedModel(
          captured,
          filteredModels().filter((m) => m.providerId === captured.providerId),
        );
        if (advanceBtn && nextModel && nextModel.id !== captured.id) {
          advanceBtn.textContent = `Next unverified (${nextModel.name}) →`;
          advanceBtn.hidden = false;
        }
        publicationStatus(
          'Your call succeeded! Share the report on GitHub to earn your Model Verifier badge after publication.',
        );
      } catch {
        publicationStatus(
          'The call succeeded, but its report cannot be shared. Your private data was not submitted.',
        );
      }
    } else publicationStatus('Local-server checks stay in this browser and are not published.');
  } catch (e) {
    if (id === revision) {
      status(
        e.code === 'PROVIDER_ERROR' && e.message.includes('HTTP 401')
          ? `${ProviderApi[captured.providerId]?.name || 'The selected provider'} rejected this API key (HTTP 401). Use a key issued by this provider and check that it is active. Your key remains private.`
          : e.code === 'NETWORK_ERROR'
            ? 'The provider could not be reached. Browser/network restrictions may prevent this call. Copy the SDK example to try it locally.'
            : e.message,
        'error',
      );
    }
  } finally {
    if (id === revision) {
      busy = false;
      $('#verify').disabled = false;
      $('#cancel').hidden = true;
    }
  }
});
for (const button of document.querySelectorAll('[data-request-language]'))
  button.addEventListener('click', () => {
    requestLanguage = button.dataset.requestLanguage;
    for (const b of document.querySelectorAll('[data-request-language]')) {
      b.classList.toggle('active', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    }
    renderRequest();
  });
$('#copy-request').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#request-code').textContent);
    $('#copy-request').textContent = 'Copied';
    setTimeout(() => ($('#copy-request').textContent = 'Copy'), 1800);
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('#request-code'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    $('#copy-request').textContent = 'Select to copy';
  }
});
$('#cancel').addEventListener('click', () => controller?.abort());
$('#clear-key').addEventListener('click', () => {
  $('#api-key').value = '';
  invalidate();
  destination();
  status('API key cleared.');
});
for (const id of ['api-key', 'protocol', 'endpoint', 'local-model', 'prompt', 'max-tokens'])
  $('#' + id).addEventListener('input', () => {
    if (id === 'endpoint') $('#api-key').value = '';
    invalidate();
    destination();
  });
// Catalog tags and typed capabilities drive the available selectors.
for (const tag of [
  ...new Set(
    models.flatMap((m) => [...m.tags, ...(m.model.tags || []), ...(m.provider.tags || [])]),
  ),
].sort()) {
  const option = el('option', tag);
  option.value = tag;
  $('#exclude-tag-filter').append(option);
}
for (const [id, values] of [
  ['feature-filter', Object.values(byokit.FeatureName)],
  ['modality-filter', Object.values(byokit.Modality)],
]) {
  const select = $('#' + id);
  select.replaceChildren();
  const any = el('option', 'Any ' + (id === 'feature-filter' ? 'capability' : 'input'));
  any.value = 'any';
  select.append(any);
  for (const value of values) {
    const option = el(
      'option',
      value
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/json/gi, 'JSON')
        .replace(/^./, (c) => c.toUpperCase()),
    );
    option.value = value;
    select.append(option);
  }
}
$('#filter-reference').textContent =
  'Provider; include/exclude tags (including origin:cn); input/output modalities; file formats; capabilities; context; input/output price; open weights; commercial use; parameter count; speed/latency; lifecycle; popularity; contributor and verification freshness. This page exposes common selectors; the library supports the full list documented in README.';
for (const provider of [...new Map(models.map((m) => [m.providerId, m.provider])).values()]) {
  const option = el('option', provider.name);
  option.value = provider.id;
  $('#provider-filter').append(option);
}
for (const id of [
  'model-search',
  'provider-filter',
  'region-filter',
  'exclude-tag-filter',
  'feature-filter',
  'modality-filter',
  'weights-filter',
  'context-filter',
  'price-filter',
  'sort-filter',
  'verification-filter',
  'include-outdated',
])
  $('#' + id).addEventListener('input', () => {
    if (id === 'provider-filter') {
      invalidate();
      $('#api-key').value = '';
      batchSelection.clear();
      const model =
        nextUnverifiedModel(null, filteredModels()) ||
        filteredModels().find((m) => !m.local) ||
        filteredModels()[0];
      if (model) select(model);
    }
    if (batchController) invalidate();
    shown = 40;
    renderModels();
  });
function advanceToNextUnverified() {
  const currentProvider = selected?.providerId;
  const providerModels = filteredModels().filter((m) => m.providerId === currentProvider);
  const next =
    nextUnverifiedModel(selected, providerModels.length > 1 ? providerModels : filteredModels()) ||
    nextUnverifiedModel(selected, models);
  if (next) {
    const keepKey = selected && selected.providerId === next.providerId;
    const currentKey = $('#api-key').value;
    select(next);
    if (keepKey && currentKey) $('#api-key').value = currentKey;
    $('#call-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#api-key').focus({ preventScroll: true });
  }
}
$('#next-unverified')?.addEventListener('click', advanceToNextUnverified);
$('#next-unverified-advance')?.addEventListener('click', advanceToNextUnverified);
$('#show-more').addEventListener('click', () => {
  shown += 40;
  renderModels();
});
$('#clear-records').addEventListener('click', () => {
  records = [];
  try {
    localStorage.removeItem(storageKey);
  } catch {}
  renderRecords();
  renderModels();
});
$('#export-records').addEventListener('click', () => {
  const blob = new Blob(
      [JSON.stringify({ schemaVersion: 1, scope: 'this-browser', records }, null, 2)],
      { type: 'application/json' },
    ),
    url = URL.createObjectURL(blob),
    a = el('a');
  a.href = url;
  a.download = 'byokit-inference-verifications.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) tracker.stop();
  else if (activeReport && !$('#check-publication').hidden) trackPublication();
});
window.addEventListener('pagehide', () => {
  $('#api-key').value = '';
  controller?.abort();
  batchController?.abort();
  tracker.stop();
  batchController?.abort();
  apiVerifyController?.abort();
  revision++;
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    $('#api-key').value = '';
    invalidate();
  }
});

// API verification section: test all models under a chosen API/protocol
let apiVerifyController = null;
const apiSelect = $('#api-verify-select');
if (apiSelect) {
  const protocolGroup = el('optgroup');
  protocolGroup.label = 'API Protocols (Cross-Provider)';
  const protocols = [
    { id: 'chat', label: 'OpenAI-compatible Chat' },
    { id: 'anthropic', label: 'Anthropic Messages' },
    { id: 'gemini', label: 'Gemini GenerateContent' },
  ];
  for (const proto of protocols) {
    const opt = el('option', proto.label);
    opt.value = 'protocol:' + proto.id;
    protocolGroup.append(opt);
  }
  const providerGroup = el('optgroup');
  providerGroup.label = 'Provider APIs';
  const hostedProviders = [
    ...new Map(
      models
        .filter((m) => !m.local && m.callSupport?.textGeneration)
        .map((m) => [m.providerId, m.provider]),
    ).values(),
  ];
  for (const prov of hostedProviders) {
    const opt = el('option', `${prov.name} API`);
    opt.value = 'provider:' + prov.id;
    providerGroup.append(opt);
  }
  apiSelect.append(protocolGroup, providerGroup);

  function getApiModels(value) {
    if (!value) return [];
    const [kind, id] = value.split(':');
    if (kind === 'protocol') {
      return models.filter(
        (m) =>
          !m.local &&
          m.callSupport?.textGeneration &&
          ProviderApi[m.providerId]?.protocols.includes(id),
      );
    }
    if (kind === 'provider') {
      return models.filter((m) => !m.local && m.callSupport?.textGeneration && m.providerId === id);
    }
    return [];
  }

  function renderApiVerification() {
    apiVerifyController?.abort();
    apiVerifyController = null;
    const cancelBtn = $('#api-verify-cancel');
    if (cancelBtn) cancelBtn.hidden = true;
    $('#api-verify-results').replaceChildren();
    const value = apiSelect.value;
    const matching = getApiModels(value);
    $('#api-verify-count').textContent = matching.length ? `${matching.length} models` : '';
    if (!matching.length) {
      $('#api-verify-summary').textContent =
        'Choose an API above to see the matching models and required provider keys.';
      $('#api-verify-keys').replaceChildren();
      $('#api-verify-run').disabled = true;
      $('#api-verify-status').textContent = 'No API verification in progress.';
      return;
    }
    const providerIds = [...new Set(matching.map((m) => m.providerId))];
    $('#api-verify-summary').textContent =
      `Found ${matching.length} models across ${providerIds.length} ${providerIds.length === 1 ? 'provider' : 'providers'}. Enter API keys for the providers you want to test:`;
    const container = $('#api-verify-keys');
    container.replaceChildren();
    for (const pId of providerIds) {
      const pName = ProviderApi[pId]?.name || pId;
      const label = el('label', undefined, 'api-key-item');
      label.append(el('span', `${pName} API key`));
      const input = el('input');
      input.type = 'password';
      input.dataset.provider = pId;
      input.placeholder = `Paste your ${pName} key`;
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      if ($('#api-key').value && selected?.providerId === pId) {
        input.value = $('#api-key').value;
      }
      label.append(input);
      container.append(label);
    }
    $('#api-verify-run').disabled = false;
    $('#api-verify-status').textContent =
      'Ready to test. Enter keys above and click Verify all models under this API.';
  }

  apiSelect.addEventListener('change', renderApiVerification);
  apiSelect.addEventListener('input', renderApiVerification);
  $('#api-verify-clear-keys')?.addEventListener('click', () => {
    for (const input of document.querySelectorAll('#api-verify-keys input')) {
      input.value = '';
    }
    $('#api-verify-status').textContent = 'Keys cleared.';
  });
  $('#api-verify-cancel')?.addEventListener('click', () => {
    apiVerifyController?.abort();
  });

  $('#api-verify-run')?.addEventListener('click', async () => {
    if (apiVerifyController) return;
    const value = apiSelect.value;
    const matching = getApiModels(value);
    if (!matching.length) return;
    const keyInputs = document.querySelectorAll('#api-verify-keys input');
    const keys = new Map();
    for (const inp of keyInputs) {
      if (inp.value.trim()) keys.set(inp.dataset.provider, inp.value.trim());
    }
    if (!keys.size) {
      $('#api-verify-status').textContent =
        'Please enter an API key for at least one provider to verify models.';
      return;
    }

    const controller = new AbortController();
    apiVerifyController = controller;
    $('#api-verify-run').disabled = true;
    $('#api-verify-cancel').hidden = false;
    $('#api-verify-results').replaceChildren();

    const cards = new Map();
    for (const model of matching) {
      const card = el('article', undefined, 'report');
      card.append(
        el('strong', `${model.provider.name} / ${model.name || model.apiModelId}`),
        el('span', 'Queued', 'status badge'),
        el('p', model.apiModelId, 'fine'),
      );
      cards.set(model.id, card);
      $('#api-verify-results').append(card);
    }

    let passedCount = 0,
      failedCount = 0,
      skippedCount = 0;
    const failedAuthProviders = new Set();

    for (let i = 0; i < matching.length; i++) {
      if (controller.signal.aborted) break;
      const model = matching[i];
      const card = cards.get(model.id);
      const pId = model.providerId;
      const key = keys.get(pId);

      if (!key) {
        skippedCount++;
        card.querySelector('.status').textContent = `Skipped (no ${model.provider.name} key)`;
        card.querySelector('.status').className = 'status badge';
        continue;
      }
      if (failedAuthProviders.has(pId)) {
        skippedCount++;
        card.querySelector('.status').textContent =
          `Skipped (${model.provider.name} key failed authentication)`;
        card.querySelector('.status').className = 'status badge uncertain';
        continue;
      }

      card.querySelector('.status').textContent = 'Calling provider…';
      $('#api-verify-status').textContent =
        `Testing model ${i + 1} of ${matching.length}: ${model.name || model.apiModelId} (${model.provider.name})…`;

      const job = {
        offeringId: model.id,
        providerId: model.providerId,
        modelId: model.apiModelId,
        protocol: ProviderApi[model.providerId]?.protocols[0] || 'chat',
        prompt: $('#prompt')?.value || 'Reply with exactly: OK',
        maxTokens: Number($('#max-tokens')?.value) || 256,
      };

      try {
        const result = await verifyInference(job, key, { signal: controller.signal });
        if (controller.signal.aborted) break;
        passedCount++;
        const record = successRecord(job, result, key);
        records = [record, ...records].slice(0, 200);
        try {
          localStorage.setItem(storageKey, JSON.stringify(records));
        } catch {
          storageAvailable = false;
        }
        card.querySelector('.status').textContent = `Passed · ${result.latencyMs} ms`;
        card.querySelector('.status').className = 'status badge passed';
        renderRecords();
        renderModels();
      } catch (err) {
        if (controller.signal.aborted) break;
        failedCount++;
        const safe = String(err.message || 'Call failed.')
          .split(key)
          .join('[redacted]');
        card.querySelector('.status').textContent = `Failed: ${safe}`;
        card.querySelector('.status').className = 'status badge uncertain';
        if (/HTTP (401|403)/.test(safe)) {
          failedAuthProviders.add(pId);
        }
      }
    }

    apiVerifyController = null;
    $('#api-verify-run').disabled = false;
    $('#api-verify-cancel').hidden = true;
    const finalMsg = controller.signal.aborted
      ? `Verification canceled. ${passedCount} passed, ${failedCount} failed, ${skippedCount} skipped.`
      : `API verification finished: ${passedCount} passed, ${failedCount} failed, ${skippedCount} skipped.`;
    $('#api-verify-status').textContent = finalMsg;
    renderModels();
  });
}

select(selected);
renderModels();
renderRecords();
renderContributors();
void tracker.check('').catch(() => {});
