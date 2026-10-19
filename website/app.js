import * as byokit from './lib/core/catalog.js';
import { tutorials } from './tutorials.js';
const $ = (selector) => document.querySelector(selector);
const modes = {
  default: byokit.DEFAULT,
  complete: byokit.COMPLETE,
  china: byokit.CHINA,
  global: byokit.GLOBAL,
  official: byokit.OFFICIAL_FLAGSHIP,
};
let mode = 'default',
  shown = 12;
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const compact = (n) =>
  n == null
    ? 'Unknown'
    : n >= 1e6
      ? `${Number((n / 1e6).toFixed(2))}M`
      : n >= 1000
        ? `${Number((n / 1000).toFixed(1))}K`
        : String(n);
function query() {
  const config = { sort: byokit.ModelSort.ProviderOrder };
  if (!$('#local').checked) config.local = false;
  const filters = {};
  if ($('#output').value) filters.output = [$('#output').value];
  if ($('#speciality').value) filters.speciality = byokit.exact($('#speciality').value);
  if ($('#tier').value) filters.tier = byokit.exact($('#tier').value);
  if ($('#tools').checked) filters.requiredFeatures = [byokit.FeatureName.FunctionCalling];
  const excluded = [];
  if ($('#premium').checked) excluded.push(byokit.Tag.PricePremium);
  if ($('#exclude-china').checked) excluded.push(byokit.Tag.OriginChina);
  if (excluded.length) filters.excludeTags = excluded;
  if (Object.keys(filters).length) config.filters = filters;
  return config;
}
function snippet(config) {
  const name =
    mode === 'default'
      ? ''
      : mode === 'official'
        ? 'byokit.OFFICIAL_FLAGSHIP'
        : `byokit.${mode.toUpperCase()}`;
  const parts = ['sort: byokit.ModelSort.ProviderOrder'],
    filters = [];
  if (config.local === false) parts.push('local: false');
  if (config.filters?.output)
    filters.push(
      `output: [byokit.Modality.${config.filters.output[0][0].toUpperCase() + config.filters.output[0].slice(1)}]`,
    );
  if (config.filters?.speciality) {
    const val = config.filters.speciality.value || config.filters.speciality;
    const enumKey =
      Object.keys(byokit.Speciality).find((k) => byokit.Speciality[k] === val) ||
      val[0].toUpperCase() + val.slice(1);
    filters.push(`speciality: byokit.exact(byokit.Speciality.${enumKey})`);
  }
  if (config.filters?.tier) {
    const val = config.filters.tier.value || config.filters.tier;
    const enumKey =
      Object.keys(byokit.Tier).find((k) => byokit.Tier[k] === val) ||
      val[0].toUpperCase() + val.slice(1);
    filters.push(`tier: byokit.exact(byokit.Tier.${enumKey})`);
  }
  if (config.filters?.requiredFeatures)
    filters.push('requiredFeatures: [byokit.FeatureName.FunctionCalling]');
  if (config.filters?.excludeTags)
    filters.push(
      'excludeTags: [' +
        config.filters.excludeTags
          .map(
            (tag) => 'byokit.Tag.' + Object.keys(byokit.Tag).find((key) => byokit.Tag[key] === tag),
          )
          .join(', ') +
        ']',
    );
  if (filters.length) parts.push('filters: { ' + filters.join(', ') + ' }');
  return `byokit.getModels(${[name, parts.length ? `{ ${parts.join(', ')} }` : ''].filter(Boolean).join(', ')});`;
}
function row(model) {
  const tr = el('tr'),
    cell = el('td'),
    group = el('div', undefined, 'model-cell');
  const icon = model.local
    ? el('span', '↳', 'provider-icon icon-fallback')
    : el('img', undefined, 'provider-icon');
  if (!model.local) {
    icon.alt = '';
    icon.src = `./assets/${model.providerId}.svg`;
    icon.addEventListener(
      'error',
      () =>
        icon.replaceWith(
          el('span', model.provider.name.slice(0, 2), 'provider-icon icon-fallback'),
        ),
      { once: true },
    );
  }
  const title = el('div');
  title.append(
    el('span', model.provider.name, 'provider-name'),
    el('div', model.name, 'model-name'),
    el('code', model.apiModelId || 'URL + API protocol + model ID', 'model-id'),
  );
  group.append(icon, title);
  cell.append(group);
  tr.append(cell, el('td', compact(model.limits.context)));
  const price = el(
    'td',
    model.price.input == null ? 'Unknown' : `$${model.price.input} in`,
    'price',
  );
  if (model.price.output != null) price.append(el('span', `$${model.price.output} out`));
  tr.append(price);
  const evidence = el('td');
  evidence.append(
    el(
      'span',
      model.callSupport?.textGeneration
        ? 'Text calls supported'
        : model.callSupport?.reason || 'Setup required',
      'call-support',
    ),
  );
  evidence.append(
    el(
      'span',
      model.local ? 'LOCAL SETUP' : model.lifecycle.status,
      `badge ${model.local ? 'uncertain' : model.lifecycle.status.toLowerCase()}`,
    ),
    el(
      'span',
      model.local
        ? 'User-configured server'
        : model.lifecycle.evidence?.basis === 'catalog-listing'
          ? 'Catalog listing'
          : 'Provider evidence',
      'evidence-note',
    ),
  );
  tr.append(evidence);
  return tr;
}
let currentQueryKey = null;
let currentModels = [];
function getFilteredModels() {
  const config = query();
  const key = JSON.stringify({ mode, config });
  if (key !== currentQueryKey) {
    currentQueryKey = key;
    currentModels = byokit.getModels(modes[mode], config);
  }
  return { config, models: currentModels };
}
function render() {
  try {
    const { config, models } = getFilteredModels(),
      search = $('#search').value.trim().toLowerCase(),
      matches = search
        ? models.filter((m) =>
            `${m.name} ${m.apiModelId} ${m.provider.name}`.toLowerCase().includes(search),
          )
        : models;
    $('#query').textContent = snippet(config);
    $('#results').replaceChildren(...matches.slice(0, shown).map(row));
    if (!matches.length) {
      const tr = el('tr'),
        td = el('td', 'No matching results. Try Complete or change your filters.', 'empty');
      td.colSpan = 4;
      tr.append(td);
      $('#results').append(tr);
    }
    $('#count').textContent =
      `${matches.length} ${matches.length === 1 ? 'entry' : 'entries'}${search ? ' match your search' : ''}`;
    $('#more').hidden = matches.length <= shown;
    $('#more').textContent = `Show more (${matches.length - shown} remaining)`;
    $('#result-note').textContent =
      `Showing ${Math.min(shown, matches.length)} of ${matches.length}. Availability is evidence-based; call support describes adapter compatibility.`;
    $('#catalog-error').hidden = true;
  } catch {
    $('#catalog-error').hidden = false;
  }
}
for (const button of document.querySelectorAll('[data-mode]'))
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    shown = 12;
    for (const b of document.querySelectorAll('[data-mode]')) {
      b.classList.toggle('active', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    }
    render();
  });
for (const id of [
  'output',
  'speciality',
  'tier',
  'search',
  'tools',
  'premium',
  'exclude-china',
  'local',
])
  $('#' + id).addEventListener('input', () => {
    if (
      (id === 'output' &&
        mode === 'default' &&
        $('#output').value &&
        $('#output').value !== 'text') ||
      (id === 'speciality' && mode === 'default' && $('#speciality').value) ||
      (id === 'tier' && mode === 'default' && $('#tier').value)
    ) {
      mode = 'complete';
      for (const b of document.querySelectorAll('[data-mode]')) {
        b.classList.toggle('active', b.dataset.mode === mode);
        b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      }
    }
    shown = 12;
    render();
  });
$('#more').addEventListener('click', () => {
  shown += 24;
  render();
});
for (const button of document.querySelectorAll('[data-copy]'))
  button.addEventListener('click', async () => {
    const text = $(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
      setTimeout(
        () => (button.textContent = button.dataset.copy === '#query' ? 'Copy query' : 'Copy'),
        1800,
      );
    } catch {
      button.textContent = 'Select to copy';
      const range = document.createRange();
      range.selectNodeContents($(button.dataset.copy));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
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
$('#explorer-save-config')?.addEventListener('click', () => {
  const config = byokit.getConfig(modes[mode], query());
  downloadJson('byok.config.json', config);
  const button = $('#explorer-save-config');
  if (button) {
    const originalText = button.textContent;
    button.textContent = 'Saved!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 1800);
  }
});
let language = 'typescript',
  example = 'direct',
  format = 'openai';
function renderExample() {
  $('#start-code').textContent =
    tutorials[example === 'inference' && format === 'claude' ? 'claude' : example][language];
  const sdk = example === 'inference';
  const local = example === 'local';
  const inference = sdk || local || example === 'direct';
  const formatTabs = document.querySelector('.language-tabs[aria-label="Response format"]');
  if (formatTabs) formatTabs.hidden = !sdk;
  $('#example-note').textContent = local
    ? 'Set the URL, protocol, and served model ID. Configuration is offline; call() needs your running server. The empty key means no authentication.'
    : inference
      ? `Server-side example: set ${sdk && format === 'claude' ? 'ANTHROPIC_API_KEY' : 'DEEPSEEK_API_KEY'}. Displaying or copying code sends no requests. Use the selected provider’s own key.`
      : 'Catalog queries run offline. No API key or provider request is needed.';
  $('#return-label').textContent = inference
    ? 'EXAMPLE GENERATED TEXT'
    : 'RETURN (SELECTED FIELDS)';
  $('#expected-return').textContent = inference
    ? sdk && format === 'claude'
      ? '[{ type: "text", text: "Hello!" }] — actual model output varies.'
      : 'Hello! — actual model output varies.'
    : example === 'matchers'
      ? JSON.stringify(
          byokit
            .getModels(byokit.COMPLETE, {
              providerIds: byokit.any(
                byokit.ProviderId.OpenAI,
                byokit.ProviderId.Google,
                byokit.ProviderId.Anthropic,
                byokit.ProviderId.DeepSeek,
              ),
              filters: {
                speciality: byokit.exact(byokit.Speciality.General),
                tier: byokit.or(
                  byokit.exact(byokit.Tier.Flash),
                  byokit.and(
                    byokit.exact(byokit.Tier.Workhorse),
                    byokit.not(byokit.exact(byokit.Tier.Lite)),
                  ),
                ),
              },
              local: false,
            })
            .slice(0, 2)
            .map((model) => ({
              provider: model.provider.id,
              model: model.apiModelId,
              speciality: model.speciality,
              tier: model.tier,
            })),
          null,
          2,
        )
      : JSON.stringify(
          byokit
            .getModels()
            .slice(0, 2)
            .map((model) => ({
              providerId: model.providerId,
              apiModelId: model.apiModelId,
              callable: model.callSupport.textGeneration,
            })),
          null,
          2,
        );
}
for (const button of document.querySelectorAll('[data-language]'))
  button.addEventListener('click', () => {
    language = button.dataset.language;
    for (const b of document.querySelectorAll('[data-language]')) {
      b.classList.toggle('active', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    }
    renderExample();
  });
for (const button of document.querySelectorAll('[data-example]'))
  button.addEventListener('click', () => {
    example = button.dataset.example;
    for (const b of document.querySelectorAll('[data-example]')) {
      b.classList.toggle('active', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    }
    renderExample();
  });
for (const button of document.querySelectorAll('[data-format]'))
  button.addEventListener('click', () => {
    format = button.dataset.format;
    for (const b of document.querySelectorAll('[data-format]')) {
      b.classList.toggle('active', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    }
    renderExample();
  });
$('#hero-providers').replaceChildren(
  ...byokit.getModels().map((model) => el('span', model.provider.name)),
);
renderExample();
render();
