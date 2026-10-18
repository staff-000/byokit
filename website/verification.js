import { textWasVerified } from '../packages/byokit/verification.js';
import { assessmentForError, attemptText, retryCountdown } from './attempt-display.js';
import {
  measurementSummary,
  relativeMeasurementTime,
  SPEED_PROMPT,
  SPEED_MAX_TOKENS,
} from './speed-measurements.js';
import { filterModels } from './verification-filters.js';
import { runBatch, validateBatch, MAX_BATCH_REQUESTS } from './batch-verification.js';
import { contributorBadges, badgeMarkdown } from './contributor-badges.js';
import {
  createReport,
  createBatchReport,
  issueUrl,
  issueBody,
  PublicationTracker,
} from './verification-report.js';
import catalog, * as byokit from '../packages/byokit/catalog.js';
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
  if (selected) $('#attempt-community').textContent = communityText(selected.id);
  byokit.addVerifications?.(reports);
  renderModels();
  renderContributors();
});
function trackPublication() {
  if (!activeReport) return;
  tracker.start(
    activeReport.reports
      ? activeReport.reports.map((r) => ({ operationId: r.operationId, offeringId: r.offeringId }))
      : activeReport.operationId,
    (state, record) => {
      if (state === 'published') {
        const published = Array.isArray(record) ? record : [record];
        record = published.find(textWasVerified) || published[0];
        publicationStatus(
          `${published.length > 1 ? `Published: ${published.length} batch results. ` : 'Published: '}${textWasVerified(record) ? 'community verified' : 'issue observation'} by ${record.contributor.replace('github:', '@')} on ${new Date(record.checkedAt).toLocaleDateString()}.`,
        );
        $('#check-publication').hidden = true;
        const badge =
          textWasVerified(record) &&
          contributorBadges(publishedReports).find(
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
              ? 'Publication is not confirmed yet. Submit the issue on GitHub, or check its workflow and try Refresh report status.'
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
let batchReports = [],
  batchDraft = null,
  batchClipboardBody = null;
function resetBatchSharing() {
  batchReports = [];
  batchDraft = null;
  batchClipboardBody = null;
  $('#batch-share-actions').hidden = true;
  $('#batch-report-body').hidden = true;
}
function prepareBatchSharing() {
  if (!batchReports.length) return;
  batchDraft = createBatchReport(batchReports);
  const href = issueUrl(batchDraft),
    eligible = batchReports.some(
      (r) => !r.assessment || r.assessment.checks.textGeneration === 'passed',
    );
  $('#batch-share').textContent = eligible
    ? 'Share batch on GitHub · earn badge ↗'
    : 'Share batch observations on GitHub ↗';
  $('#batch-share').href = href;
  if (href.length > 7800) {
    batchClipboardBody = issueBody(batchDraft);
    const short = new URL(href);
    short.searchParams.delete('body');
    $('#batch-share').href = short.href;
    $('#batch-share').textContent = 'Copy batch report & open GitHub ↗';
  }
  $('#batch-share-note').textContent =
    `One issue includes ${batchReports.length} sanitized observations. ${eligible ? 'A published successful text check earns your badge.' : 'These issue observations do not earn a success badge.'} GitHub asks you to review and submit the issue; we check its status automatically.`;
  $('#batch-share-actions').hidden = false;
}
$('#batch-share').addEventListener('click', () => {
  if (!batchDraft) return;
  activeReport = batchDraft;
  $('#check-publication').hidden = false;
  publicationStatus(
    'Submit the single batch issue on GitHub. We check all included reports automatically; no model calls are repeated.',
  );
  trackPublication();
  if (batchClipboardBody) {
    $('#batch-report-body').value = batchClipboardBody;
    try {
      Promise.resolve(navigator.clipboard.writeText(batchClipboardBody)).then(
        () =>
          publicationStatus(
            'Batch report copied. Paste it into the GitHub issue body and submit. We check the report status automatically.',
          ),
        () => {
          $('#batch-report-body').hidden = false;
          publicationStatus('Copy the report below into the GitHub issue body and submit.');
        },
      );
    } catch {
      $('#batch-report-body').hidden = false;
      publicationStatus('Copy the report below into the GitHub issue body and submit.');
    }
  }
});
if (typeof window !== 'undefined') {
  window.selectVerificationModel = (modelId, prefillKey) => {
    const m = models.find((x) => x.id === modelId) || models.find((x) => x.apiModelId === modelId);
    if (m) {
      openModel(m);
      if (prefillKey && !busy && !batchController && selected.id === m.id) {
        $('#api-key').value = prefillKey;
        providerKeys.set(m.providerId, prefillKey);
      }
    }
  };
  window.trackVerificationPublication = (report) => {
    activeReport = report;
    $('#check-publication').hidden = false;
    publicationStatus(`Submit the GitHub issue for ${report.offeringId} to publish this result.`);
    trackPublication();
  };
}
let drawerOrigin = null,
  drawerOriginModel = null,
  lastRunMode = null;
const providerKeys = new Map();
function openDrawer(mode) {
  $('#batch-status').hidden = mode !== 'batch';
  $('#batch-results').hidden = mode !== 'batch';
  $('#batch-share-actions').hidden = mode !== 'batch' || !batchDraft;
  $('#call-panel').hidden = mode !== 'single';
  $('#batch-confirm').hidden = mode !== 'batch';
  if (!$('#verification-drawer').open) {
    drawerOrigin = document.activeElement;
    drawerOriginModel = drawerOrigin?.closest('tr')?.dataset.offering;
    $('#verification-drawer').showModal();
  }
}
function openModel(model) {
  if (busy || batchController) {
    openDrawer(batchController ? 'batch' : 'single');
    return;
  }
  if (!model.local && !model.callSupport?.textGeneration) return;
  providerKeys.set(selected.providerId, $('#api-key').value);
  $('#prompt').value = SPEED_PROMPT;
  $('#max-tokens').value = SPEED_MAX_TOKENS;
  select(model);
  for (const row of document.querySelectorAll('#models tr'))
    row.classList.toggle('selected', row.dataset.offering === model.id);
  $('#api-key').value = providerKeys.get(model.providerId) || '';
  openDrawer('single');
  $('#api-key').focus({ preventScroll: true });
}
$('#drawer-close').addEventListener('click', () => $('#verification-drawer').close());
$('#verification-drawer').addEventListener('close', () => {
  const target = drawerOrigin?.isConnected
    ? drawerOrigin
    : [...document.querySelectorAll('#models tr')].find(
        (row) => row.dataset.offering === drawerOriginModel,
      ) || $('#batch-open');
  target?.focus({ preventScroll: true });
});
$('#api-key').addEventListener('input', () =>
  providerKeys.set(selected.providerId, $('#api-key').value),
);
const storageKey = 'byokit.inference-verifications.v1';
let records = [],
  storageAvailable = true;
try {
  records = safeRecords(JSON.parse(localStorage.getItem(storageKey) || '[]'));
} catch {
  storageAvailable = false;
}
const models = byokit.getModels(byokit.COMPLETE, {
  filters: { lifecycle: byokit.any(...Object.values(byokit.Lifecycle)), includeDeprecated: true },
});
function isUnverified(m) {
  if (!m || m.local) return false;
  if (records.some((r) => r.offeringId === m.id && textWasVerified(r))) return false;
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
  retryCountdown($('#retry-guidance'), null);
  revision++;
  batchController?.abort();
  pendingBatch = null;
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
function updateCostEstimate() {
  const costEl = $('#cost-estimate');
  if (!costEl || !selected) return;
  if (selected.local) {
    costEl.textContent = 'Local models use your server resources and have no API token cost.';
    return;
  }
  try {
    const est = byokit.estimatePrice(selected, { inputTokens: 18, outputTokens: 60 });
    if (est.status === 'estimated' && est.amount != null) {
      const cents = est.amount * 100;
      if (cents < 0.01) {
        costEl.textContent = 'Are you willing to spend < 0.01 cents to help us verify this model?';
      } else {
        costEl.textContent = `Are you willing to spend ~${cents.toFixed(2)} cents to help us verify this model?`;
      }
    } else {
      costEl.textContent = 'Token pricing for this model is unknown or custom.';
    }
  } catch {
    costEl.textContent = '';
  }
}
function select(model) {
  const changedProvider = selected?.providerId !== model.providerId;
  invalidate();
  selected = model;
  $('#attempt-community').textContent = communityText(model.id);
  if (changedProvider) {
    $('#api-key').value = '';
    $('#api-key').placeholder = `Paste your ${model.provider?.name || model.providerId} key`;
  }
  const coverage = modelMeasurements(model);
  const previouslyTested = coverage.checks > 0 || records.some((r) => r.offeringId === model.id);
  $('#verify').textContent = model.local
    ? 'Test speed · 2 requests'
    : `${previouslyTested ? 'Add your speed result' : 'Test speed'} · 2 requests`;
  $('#measurement-context').textContent = model.local
    ? 'Local measurements stay in your browser.'
    : `${coverage.checks} published checks · ${coverage.contributors} known contributors. ${coverage.nudge}`;
  $('#badge-hint').textContent = model.local
    ? 'Local checks stay private.'
    : 'Already verified? Your measurement still helps. Every published contribution counts, including repeat tests of the same model. Share on GitHub to earn a Model Verifier badge.';
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
  if (!model.local && !model.callSupport?.textGeneration) {
    $('#verify').disabled = true;
    $('#verify').title = model.callSupport?.reason || 'No reviewed browser adapter';
    status(
      `Selected: ${model.provider?.name || model.providerId} ${model.name}. Text calls are unsupported directly in browser (${model.callSupport?.reason || 'No reviewed adapter'}). You can test this model via the playground below.`,
      'error',
    );
  } else {
    $('#verify').disabled = false;
    $('#verify').title = '';
    status(
      `Ready to verify ${model.provider?.name || model.providerId} ${model.name}. Enter your API key and click Verify model.`,
    );
  }
  updateCostEstimate();
}
function filteredModels() {
  const filtered = filterModels({
    search: $('#model-search').value,
    provider: $('#provider-filter').value,
    region: $('#region-filter').value,
    excludeTag: $('#exclude-tag-filter').value,
    feature: $('#feature-filter').value,
    modality: $('#modality-filter').value,
    weights: $('#weights-filter').value,
    speciality: $('#speciality-filter')?.value,
    tier: $('#tier-filter')?.value,
    context: $('#context-filter').value,
    price: $('#price-filter').value,
    sort: $('#sort-filter').value,
    verification: $('#verification-filter')?.value,
    verifications: publishedReports,
    callableOnly: $('#callable-filter')?.checked,
    includeOutdated: $('#include-outdated').checked,
  });
  const sort = $('#sort-filter').value;
  if (['speed', 'speedAscend', 'speedDescend'].includes(sort)) {
    const speeds = new Map(filtered.map((m) => [m.id, modelMeasurements(m).median]));
    filtered.sort((a, b) => {
      const av = speeds.get(a.id),
        bv = speeds.get(b.id);
      if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
      return sort === 'speedAscend' ? av - bv : bv - av;
    });
  }
  return filtered;
}
let measurementIndexSource = null;
const measurementIndex = new Map();
function modelMeasurements(model) {
  if (measurementIndexSource !== publishedReports) {
    measurementIndex.clear();
    for (const report of publishedReports) {
      if (!measurementIndex.has(report.offeringId)) measurementIndex.set(report.offeringId, []);
      measurementIndex.get(report.offeringId).push(report);
    }
    measurementIndexSource = publishedReports;
  }
  return measurementSummary(
    measurementIndex.get(model.id) || [],
    model.id,
    ProviderApi[model.providerId]?.protocols[0],
  );
}
const speedNumber = (value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
$('#standard-speed').addEventListener('click', () => {
  if (busy || batchController) return;
  $('#prompt').value = SPEED_PROMPT;
  $('#max-tokens').value = SPEED_MAX_TOKENS;
  invalidate();
  destination();
  status(
    'Standard speed benchmark selected: fixed counting prompt, 128 output tokens, two requests.',
  );
});
function renderModels() {
  const focusedRow = document.activeElement?.closest('#models tr'),
    focusedId = focusedRow?.dataset.offering;
  const focusedControl = focusedRow ? document.activeElement.tagName.toLowerCase() : null;
  const filtered = filteredModels();
  $('#model-count').textContent = `${filtered.length} entries`;
  const rows = filtered.slice(0, shown).map((m) => {
    const tr = el('tr'),
      pick = el('td'),
      checkbox = el('input');
    if (selected && selected.id === m.id) {
      tr.classList.add('selected');
    }
    tr.style.cursor = 'pointer';
    tr.tabIndex = 0;
    tr.dataset.offering = m.id;
    tr.addEventListener('keydown', (e) => {
      if (e.target === tr && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openModel(m);
      }
    });
    tr.addEventListener('click', (e) => {
      if (e.target.closest('input, a, button, summary')) return;
      openModel(m);
    });
    checkbox.type = 'checkbox';
    checkbox.className = 'batch-pick';
    checkbox.setAttribute('aria-label', `Select ${m.provider.name} ${m.name} for batch`);
    checkbox.checked = batchSelection.has(m.id);
    if (m.local || !m.callSupport?.textGeneration)
      checkbox.title = m.local
        ? 'Local servers support single-model verification.'
        : m.callSupport?.reason || 'No reviewed adapter.';
    checkbox.disabled = !!m.local || !m.callSupport?.textGeneration;
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
    const coverage = modelMeasurements(m);
    if (coverage.median != null) {
      performance.append(
        el('span', `${speedNumber(coverage.median)} tokens/sec`, 'metric-value'),
        el(
          'span',
          `Median · ${coverage.samples} standard ${coverage.samples === 1 ? 'measurement' : 'measurements'} · ${coverage.speedContributors} known contributors · last 30 days`,
          'evidence-note',
        ),
      );
      if (coverage.samples >= 3)
        performance.append(
          el(
            'span',
            `Middle 50%: ${speedNumber(coverage.p25)}–${speedNumber(coverage.p75)} tokens/sec`,
            'evidence-note',
          ),
        );
      else performance.append(el('span', 'Small sample · provisional estimate', 'evidence-note'));
    } else {
      performance.append(el('span', 'Speed needs measurements', 'metric-value'));
      if (m.speed?.tokensPerSecond != null)
        performance.append(
          el(
            'span',
            `Historical estimate: ${speedNumber(m.speed.tokensPerSecond)} tokens/sec · benchmark unrecorded`,
            'evidence-note',
          ),
        );
    }
    performance.append(el('span', 'Released ' + (m.releaseDate || 'unknown'), 'evidence-note'));
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
        el(
          'span',
          textWasVerified(last) ? 'Verified here' : 'Attempt recorded here',
          textWasVerified(last) ? 'badge passed' : 'badge uncertain',
        ),
        ...(last.assessment
          ? [el('span', `Your attempt: ${attemptText(last.assessment)}`, 'evidence-note')]
          : []),
        el('span', new Date(last.checkedAt).toLocaleDateString(), 'evidence-note'),
      );
    if (summary.latest) {
      const report = summary.latest,
        isFailure = summary.communityStatus === 'issues_reported',
        badgeText =
          summary.communityStatus === 'stale'
            ? 'Community: stale'
            : isFailure
              ? 'Community: issues reported'
              : 'Community: verified',
        badgeClass = summary.communityStatus === 'verified' ? 'badge passed' : 'badge uncertain',
        label =
          summary.status === 'stale'
            ? 'Historical observation'
            : isFailure
              ? 'Reported issue'
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
      for (const [reason, count] of Object.entries(summary.community.recentIssues))
        action.append(
          el(
            'span',
            `${count} ${reason.replaceAll('_', ' ')} observations · last 7 days`,
            'evidence-note',
          ),
        );
    } else if (!last) action.append(el('span', 'Community: unverified', 'evidence-note'));
    if (!m.local)
      action.append(
        el(
          'span',
          `${coverage.checks} published checks · ${coverage.contributors} known contributors`,
          'evidence-note',
        ),
        el(
          'span',
          coverage.latestAt
            ? `Last tested ${relativeMeasurementTime(coverage.latestAt)}`
            : 'No published checks yet',
          'evidence-note',
        ),
        el('span', coverage.nudge, 'contribution-nudge'),
      );
    const button = el(
      'button',
      last || coverage.checks ? 'Add your speed result' : 'Test speed',
      'small-button action-highlight',
    );
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
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      openModel(m);
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
  if (focusedId) {
    const row = [...$('#models').rows].find((row) => row.dataset.offering === focusedId);
    const target = focusedControl === 'tr' ? row : row?.querySelector(focusedControl);
    target?.focus({ preventScroll: true });
  }
}
function updateBatchControls() {
  $('#batch-count').textContent =
    `${batchSelection.size} ${batchSelection.size === 1 ? 'model' : 'models'} selected`;
  $('#batch-open').disabled = !batchSelection.size && !batchController && !busy && !lastRunMode;
  $('#batch-cancel').hidden = !busy && !batchController;
  $('#batch-open').textContent =
    batchController || busy
      ? 'View verification progress'
      : !batchSelection.size && lastRunMode
        ? 'View verification results'
        : 'Verify selected';
  $('#batch-clear').disabled = !batchSelection.size;
  $('#batch-select-shown').disabled = batchSelection.size >= MAX_BATCH_REQUESTS;
}
function toggleBatch(model, checked) {
  if (checked) {
    if (batchSelection.size >= MAX_BATCH_REQUESTS) {
      $('#selection-status').textContent = 'Choose at most 10 models per batch.';
      renderModels();
      return;
    }
    batchSelection.set(model.id, model);
  } else batchSelection.delete(model.id);
  renderModels();
}
$('#batch-select-shown').addEventListener('click', () => {
  const eligible = filteredModels()
    .slice(0, shown)
    .filter((m) => !m.local && m.callSupport?.textGeneration);
  if (!eligible.length) return;
  for (const model of eligible) {
    if (batchSelection.size >= MAX_BATCH_REQUESTS) break;
    batchSelection.set(model.id, model);
  }
  renderModels();
});
new window.MutationObserver(() => {
  $('#selection-status').textContent = $('#batch-status').textContent;
}).observe($('#batch-status'), { childList: true, characterData: true, subtree: true });
$('#batch-clear').addEventListener('click', () => {
  batchSelection.clear();
  renderModels();
  if (!batchController) $('#selection-status').textContent = 'Selection cleared.';
});
$('#batch-open').addEventListener('click', () => {
  if (busy || batchController) {
    openDrawer(batchController ? 'batch' : 'single');
    return;
  }
  if (!batchSelection.size) {
    if (lastRunMode) openDrawer(lastRunMode);
    return;
  }
  if (
    pendingBatch &&
    pendingBatch.models.map((m) => m.id).join() === [...batchSelection.keys()].join()
  ) {
    openDrawer('batch');
    return;
  }
  pendingBatch = { models: [...batchSelection.values()] };
  $('#batch-confirm-description').textContent =
    `Send up to ${pendingBatch.models.length} AI requests, one per model. This may use provider credits.`;
  const batchProviders = [
    ...new Map(pendingBatch.models.map((m) => [m.providerId, m.provider])).values(),
  ].sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }),
  );
  $('#batch-confirm-models').replaceChildren(
    ...batchProviders.map((provider) => {
      const group = pendingBatch.models.filter((m) => m.providerId === provider.id);
      const item = el('li', group[0].provider.name),
        list = el('ul');
      list.append(...group.map((m) => el('li', m.apiModelId)));
      item.append(list);
      return item;
    }),
  );
  $('#batch-keys').replaceChildren();
  for (const provider of batchProviders) {
    const label = el('label', `${provider.name} API key`),
      input = el('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.provider = provider.id;
    input.value =
      providerKeys.get(provider.id) ||
      (selected.providerId === provider.id ? $('#api-key').value : '');
    input.addEventListener('input', () => providerKeys.set(provider.id, input.value));
    label.append(input);
    $('#batch-keys').append(label);
  }
  $('#batch-confirm-send').textContent = `Send ${pendingBatch.models.length} requests`;
  $('#batch-results').replaceChildren();
  resetBatchSharing();
  $('#batch-status').textContent = '';
  openDrawer('batch');
});
$('#batch-confirm-cancel').addEventListener('click', () => {
  $('#verification-drawer').close();
});
$('#batch-cancel').addEventListener('click', () => {
  batchController?.abort();
  controller?.abort();
});
$('#drawer-batch-cancel').addEventListener('click', () => batchController?.abort());
$('#batch-confirm-send').addEventListener('click', async () => {
  if (!pendingBatch || batchController || busy) return;
  const keys = Object.fromEntries(
    [...$('#batch-keys').querySelectorAll('input')].map((input) => [
      input.dataset.provider,
      input.value.trim(),
    ]),
  );
  const jobs = pendingBatch.models.map((model) => ({
    offeringId: model.id,
    providerId: model.providerId,
    modelId: model.apiModelId,
    protocol: ProviderApi[model.providerId]?.protocols[0],
    prompt: $('#batch-prompt').value,
    maxTokens: Number($('#batch-max-tokens').value),
  }));
  try {
    validateBatch(jobs, keys);
  } catch (error) {
    $('#batch-status').textContent = error.message;
    return;
  }
  const pending = { jobs };
  tracker.stop();
  activeReport = null;
  $('#share-verification').hidden = true;
  $('#check-publication').hidden = true;
  $('#earned-badge').hidden = true;
  publicationStatus('');
  const id = ++batchSerial,
    controller = new AbortController();
  batchController = controller;
  lastRunMode = 'batch';
  $('#batch-cancel').hidden = false;
  $('#drawer-batch-cancel').hidden = false;
  $('#verify').disabled = true;
  $('#batch-confirm-send').disabled = true;
  for (const field of $('#batch-confirm').querySelectorAll('input, textarea'))
    field.disabled = true;
  $('#batch-results').replaceChildren();
  resetBatchSharing();
  const cards = new Map();
  let sent = 0;
  for (const job of pending.jobs) {
    const card = el('article', undefined, 'report');
    card.append(
      el('strong', `${ProviderApi[job.providerId].name} · ${job.modelId}`),
      el('p', 'Queued', 'fine'),
    );
    cards.set(job.offeringId, card);
    $('#batch-results').append(card);
  }
  renderModels();
  $('#batch-status').textContent = `Confirmed ${pending.jobs.length} requests. Starting…`;
  try {
    const entries = await runBatch(pending.jobs, keys, {
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
              : entry.assessment
                ? attemptText(entry.assessment)
                : entry.error;
        if (entry.assessment?.attempt.retry.afterSeconds != null) {
          const guidance = el('p', undefined, 'fine');
          card.append(guidance);
          retryCountdown(guidance, entry.assessment.attempt);
        }
        if (entry.status === 'running') {
          sent++;
          $('#batch-status').textContent =
            `Request ${sent} of ${pending.jobs.length}: ${job.modelId}`;
        }
        if (['passed', 'partial', 'failed'].includes(entry.status) && !controller.signal.aborted) {
          const observed = entry.result || {
            assessment: entry.assessment,
            checkedAt: entry.checkedAt,
            latencyMs: entry.latencyMs,
            usage: {},
          };
          const record = successRecord(job, observed, keys[job.providerId]);
          records = [record, ...records].slice(0, 200);
          try {
            localStorage.setItem(storageKey, JSON.stringify(records));
          } catch {
            storageAvailable = false;
          }
          try {
            const report = createReport(job, observed, record.id, keys[job.providerId]);
            if (
              [...Object.values(keys)].some(
                (key) => key.trim() && JSON.stringify(report).includes(key.trim()),
              )
            )
              throw new Error('Private batch data');
            batchReports.push(report);
          } catch {
            card.append(el('p', 'This observation cannot be shared safely.', 'fine'));
          }
          renderRecords();
        }
      },
    });
    if (id === batchSerial)
      $('#batch-status').textContent =
        `${controller.signal.aborted ? 'Batch canceled.' : 'Batch finished.'} ${sent} requests sent · ${entries.filter((e) => e.status === 'passed').length} succeeded · ${entries.filter((e) => e.assessment?.attempt.outcome === 'blocked').length} blocked · ${entries.filter((e) => e.assessment?.attempt.outcome === 'inconclusive').length} inconclusive · ${entries.filter((e) => e.status === 'partial').length} partial · ${entries.filter((e) => e.status === 'skipped').length} skipped. Share the batch in one GitHub issue using the highlighted button below.`;
  } catch {
    if (id === batchSerial)
      $('#batch-status').textContent =
        'Batch stopped. Review your provider key and request settings.';
  } finally {
    if (id === batchSerial) {
      batchController = null;
      prepareBatchSharing();
      $('#batch-confirm-send').disabled = false;
      for (const field of $('#batch-confirm').querySelectorAll('input, textarea'))
        field.disabled = false;
      $('#batch-cancel').hidden = true;
      $('#drawer-batch-cancel').hidden = true;
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
        `${badge.verificationCount} published contributions · ${badge.verifiedModels} ${badge.verifiedModels === 1 ? 'model' : 'models'} verified${badge.verificationCount > 1 ? ' · Repeat contributor' : ''} · first contribution ${new Date(badge.firstVerifiedAt).toLocaleDateString()}`,
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
    let timing = `${r.checkedAt} · ${ProtocolNames[r.protocol] || r.protocol} · ${r.latencyMs} ms`;
    if (r.tokensPerSecond != null) {
      timing += ` · ${r.tokensPerSecond.toFixed(1)} tokens/sec`;
    }
    card.append(
      el('strong', r.offeringId),
      el(
        'span',
        r.assessment ? r.assessment.attempt.outcome : 'Passed',
        textWasVerified(r) ? 'badge passed' : 'badge uncertain',
      ),
      ...(r.assessment ? [el('p', attemptText(r.assessment), 'fine')] : []),
      el('p', timing),
      el('code', `${r.modelId} · max output ${r.maxTokens}`),
    );
    if (r.returnedModel && r.returnedModel !== r.modelId)
      card.append(el('p', `Provider returned model: ${r.returnedModel}`));
    list.append(card);
  }
  $('#export-records').disabled = !records.length;
  $('#clear-records').disabled = !records.length;
  $('#storage-note').textContent = storageAvailable
    ? 'Records stay in this browser until you clear or export them.'
    : 'Browser storage is unavailable. Records stay in memory for this visit; export them before leaving.';
}
function saveObservation(job, result, key) {
  const record = successRecord(job, result, key);
  records = [record, ...records].slice(0, 200);
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
  } catch {
    storageAvailable = false;
  }
  renderRecords();
  renderModels();
  return record;
}
function communityText(id) {
  const c = byokit.verificationSummary({ verifications: publishedReports }, id).community;
  return c.status === 'verified'
    ? `Community: successful calls reported · ${c.successfulContributors} contributors · last success ${new Date(c.lastSuccessAt).toLocaleDateString()}`
    : `Community: ${c.status.replaceAll('_', ' ')}. This attempt does not establish universal model availability.`;
}
$('#verify-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || batchController) return;
  const captured = settings(),
    key = $('#api-key').value.trim(),
    id = ++revision;
  busy = true;
  lastRunMode = 'single';
  updateBatchControls();
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
    const result = await verifyInference(captured, key, {
      signal: controller.signal,
      benchmarkSpeed: true,
    });
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
    let statusMsg =
      result.assessment?.attempt.outcome === 'partial'
        ? `Call succeeded for text generation. ${attemptText(result.assessment)}`
        : `Call succeeded in ${result.latencyMs} ms`;
    retryCountdown($('#retry-guidance'), result.assessment?.attempt);
    if (result.tokensPerSecond != null) {
      statusMsg += ` · ${result.tokensPerSecond.toFixed(1)} tokens/sec`;
      if (result.timeToFirstTokenMs != null) {
        statusMsg += ` (~${result.timeToFirstTokenMs} ms baseline latency estimate)`;
      }
    }
    const communitySpeed = modelMeasurements(selected);
    if (result.benchmark) {
      statusMsg +=
        communitySpeed.median != null
          ? `. Recent community median: ${speedNumber(communitySpeed.median)} tokens/sec (${communitySpeed.samples} measurements, last 30 days)`
          : '. Yours can be the first recent standard speed contribution';
    } else
      statusMsg +=
        '. Timing excluded from the standard speed median (custom settings or insufficient comparable timing/token data)';
    statusMsg += `. Recorded ${storageAvailable ? 'in this browser' : 'in memory for this visit'}.`;
    status(statusMsg, result.assessment?.attempt.outcome === 'partial' ? 'partial' : 'success');
    $('#attempt-community').textContent = communityText(captured.offeringId);
    renderRecords();
    renderModels();
    if (captured.providerId !== 'local') {
      try {
        activeReport = createReport(captured, result, record.id, key);
        $('#share-verification').href = issueUrl(activeReport);
        $('#share-verification').textContent = result.benchmark
          ? 'Contribute your speed result on GitHub ↗'
          : 'Share verification on GitHub ↗';
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
          'Your result stays private until you share it on GitHub. Another measurement helps even when this model is already verified; published repeat contributions count toward your contributor profile.',
        );
      } catch {
        publicationStatus(
          'The call succeeded, but its report cannot be shared. Your private data was not submitted.',
        );
      }
    } else publicationStatus('Local-server checks stay in this browser and are not published.');
  } catch (e) {
    if (id === revision) {
      const assessment = assessmentForError(e);
      status(attemptText(assessment), 'error');
      $('#attempt-community').textContent = communityText(captured.offeringId);
      retryCountdown($('#retry-guidance'), assessment.attempt);
      if (!['canceled', 'skipped'].includes(assessment.attempt.outcome)) {
        const observation = {
          assessment,
          checkedAt: e.checkedAt || new Date().toISOString(),
          latencyMs: e.latencyMs || 0,
          usage: {},
        };
        const record = saveObservation(captured, observation, key);
        if (captured.providerId !== 'local') {
          try {
            activeReport = createReport(captured, observation, record.id, key);
            $('#share-verification').href = issueUrl(activeReport);
            $('#share-verification').textContent = 'Share sanitized issue category on GitHub ↗';
            $('#share-verification').hidden = false;
            publicationStatus(
              'Only the normalized issue category and safe metadata are shared when you click Share. Raw provider errors and account details are excluded.',
            );
          } catch {
            publicationStatus('This observation cannot be shared safely.');
          }
        }
      }
    }
  } finally {
    if (id === revision) {
      busy = false;
      updateBatchControls();
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
  providerKeys.delete(selected.providerId);
  invalidate();
  destination();
  status('API key cleared.');
});
for (const id of ['api-key', 'protocol', 'endpoint', 'local-model', 'prompt', 'max-tokens'])
  $('#' + id).addEventListener('input', () => {
    if (id === 'endpoint') {
      $('#api-key').value = '';
      providerKeys.delete(selected.providerId);
    }
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
  ['speciality-filter', Object.values(byokit.Speciality)],
  ['tier-filter', Object.values(byokit.Tier)],
]) {
  const select = $('#' + id);
  if (!select) continue;
  select.replaceChildren();
  const label =
    id === 'feature-filter'
      ? 'capability'
      : id === 'modality-filter'
        ? 'input'
        : id === 'speciality-filter'
          ? 'speciality'
          : 'tier';
  const any = el('option', 'Any ' + label);
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
const providers = [...new Map(models.map((m) => [m.providerId, m.provider])).values()].sort(
  (a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }),
);
for (const provider of providers) {
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
  'speciality-filter',
  'tier-filter',
  'context-filter',
  'price-filter',
  'sort-filter',
  'verification-filter',
  'callable-filter',
  'include-outdated',
])
  $('#' + id).addEventListener('input', () => {
    tracker.stop();
    shown = 40;
    renderModels();
  });
function advanceToNextUnverified() {
  if (busy || batchController) return;
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
    openDrawer('single');
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
  retryCountdown($('#retry-guidance'), null);
  for (const node of $('#batch-results').querySelectorAll('p'))
    if (node._retryTimer) retryCountdown(node, null);
  $('#api-key').value = '';
  providerKeys.clear();
  for (const input of $('#batch-keys').querySelectorAll('input')) input.value = '';
  controller?.abort();
  batchController?.abort();
  tracker.stop();
  revision++;
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    $('#api-key').value = '';
    invalidate();
  }
});

select(selected);
renderModels();
renderRecords();
renderContributors();
void tracker.check('').catch(() => {});
