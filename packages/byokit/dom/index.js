import { Catalog, createMemoryCredentialStore, checkFit, LocalApi } from '../index.js';
const en = {
  provider: 'Provider',
  model: 'Model',
  key: 'API key',
  endpoint: 'Local endpoint',
  api: 'Server API',
  optionalKey: 'API key (optional)',
  custom: 'Custom model ID',
  save: 'Save',
  check: 'Check connection',
  checking: 'Checking…',
  saved: 'Settings saved',
  show: 'Show key',
  hide: 'Hide key',
  search: 'Search models',
  collapse: 'Fewer models',
  empty: 'No models match your requirements.',
  unverified: 'Custom model: limits and capabilities are unverified.',
  discover: 'Find installed models',
  offline: 'Local discovery failed. Enter a custom model ID.',
  missing: 'Enter an API key.',
  select: 'Choose a model.',
  placeholder: 'Paste your API key',
  advanced: 'More models',
};
const zh = {
  provider: '服务商',
  model: '模型',
  key: 'API 密钥',
  endpoint: '本地服务地址',
  api: '服务 API',
  optionalKey: 'API 密钥（可选）',
  custom: '自定义模型 ID',
  save: '保存',
  check: '检查连接',
  checking: '检查中…',
  saved: '设置已保存',
  show: '显示密钥',
  hide: '隐藏密钥',
  search: '搜索模型',
  collapse: '收起模型',
  empty: '没有符合要求的模型。',
  unverified: '自定义模型：上下文限制和功能尚未验证。',
  discover: '查找已安装模型',
  offline: '无法获取本地模型，请输入模型 ID。',
  missing: '请输入 API 密钥。',
  select: '请选择模型。',
  placeholder: '粘贴 API 密钥',
  advanced: '更多模型',
};
/** Credentials are passed only to explicit application callbacks, never put in selection events. */
export function mountByok(container, options) {
  const catalog =
    options.catalog instanceof Catalog ? options.catalog : new Catalog(options.catalog);
  const config = options.config || {},
    groups = catalog.select(config),
    store = options.credentialStore || createMemoryCredentialStore();
  const labels = { ...(options.locale === 'zh' ? zh : en), ...(options.labels || {}) };
  const root = document.createElement('section');
  root.className = 'byokit';
  container.append(root);
  let disposed = false,
    revision = 0,
    choice = options.value || {},
    localChoices = [],
    busy = false,
    controller,
    expanded = false;
  const make = (tag, text, parent = root) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    parent.append(el);
    return el;
  };
  const heading = make('div');
  heading.className = 'byokit-heading';
  const logo = make('img', undefined, heading);
  logo.hidden = true;
  logo.alt = '';
  make('strong', options.title || 'AI connection', heading);
  const form = make('form');
  const field = (text, type) => {
    const label = make('label', undefined, form);
    make('span', text, label);
    const el = make(type, undefined, label);
    return { label, el };
  };
  const provider = field(labels.provider, 'select'),
    model = field(labels.model, 'select');
  const info = make('p');
  model.label.after(info);
  info.className = 'byokit-model-info';
  info.setAttribute('aria-live', 'polite');
  const familyLogo = make('img', undefined, info);
  familyLogo.alt = '';
  familyLogo.hidden = true;
  const infoText = make('span', undefined, info);
  const more = make('button', labels.advanced, form);
  more.type = 'button';
  more.className = 'byokit-link';
  const search = field(labels.search, 'input');
  search.label.hidden = true;
  search.el.type = 'search';
  const budgetHint = make('p', undefined, form);
  budgetHint.className = 'byokit-status';
  budgetHint.setAttribute('aria-live', 'polite');
  budgetHint.hidden = true;
  const custom = field(labels.custom, 'input');
  custom.el.dataset.role = 'custom';
  custom.el.autocomplete = 'off';
  const endpoint = field(labels.endpoint, 'input');
  endpoint.el.type = 'url';
  endpoint.el.value = choice.endpoint || 'http://127.0.0.1:11434/v1';
  const api = field(labels.api, 'select');
  for (const [value, text] of [
    [LocalApi.OpenAI, 'OpenAI-compatible'],
    [LocalApi.Ollama, 'Ollama native'],
  ]) {
    const option = make('option', text, api.el);
    option.value = value;
  }
  api.el.value = choice.api || LocalApi.OpenAI;
  const key = field(labels.key, 'input');
  key.el.type = 'password';
  key.el.autocomplete = 'off';
  key.el.placeholder = labels.placeholder;
  const show = make('button', labels.show, form);
  show.type = 'button';
  show.className = 'byokit-link';
  show.onclick = () => {
    key.el.type = key.el.type === 'password' ? 'text' : 'password';
    show.textContent = key.el.type === 'password' ? labels.show : labels.hide;
  };
  const actions = make('div', undefined, form);
  actions.className = 'byokit-actions';
  const discovery = make('button', labels.discover, actions);
  discovery.type = 'button';
  const check = make('button', labels.check, actions);
  check.type = 'button';
  check.hidden = !options.onCheck;
  const save = make('button', labels.save, actions);
  save.type = 'submit';
  save.className = 'byokit-primary';
  const status = make('p');
  status.className = 'byokit-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const addOption = (select, value, text) => {
    const o = make('option', text, select);
    o.value = value;
  };
  const available = [...groups];
  // Preserve a saved provider even if filters excluded it, without changing the selection.
  if (
    choice.providerId &&
    !available.some((g) => g.provider.id === choice.providerId) &&
    catalog.providers.has(choice.providerId)
  )
    available.push({ provider: catalog.providers.get(choice.providerId), offerings: [] });
  for (const g of available) addOption(provider.el, g.provider.id, g.provider.name);
  provider.el.value = choice.providerId || available[0]?.provider.id || '';
  let activeProvider = provider.el.value;
  const drafts = new Map();
  const current = () => available.find((g) => g.provider.id === provider.el.value);
  function message(text, state = 'idle') {
    status.textContent = text;
    status.dataset.state = state;
  }
  function selection() {
    const o = catalog.get(model.el.value);
    return {
      providerId: provider.el.value,
      offeringId: o?.id,
      modelId:
        model.el.value === '__unavailable'
          ? ''
          : o?.apiModelId ||
            (model.el.value === '__custom' ? custom.el.value.trim() : model.el.value),
      ...(current()?.provider.deployment === 'local'
        ? { endpoint: endpoint.el.value.trim(), api: api.el.value }
        : {}),
    };
  }
  function edit() {
    controller?.abort();
    revision++;
    describeModel();
    check.disabled = false;
    save.disabled = false;
    busy = false;
    custom.label.hidden = model.el.value !== '__custom';
    message(custom.label.hidden ? '' : labels.unverified, 'warning');
    options.onChange?.(selection());
  }
  function describeModel() {
    const o = catalog.get(model.el.value);
    familyLogo.hidden = true;
    if (!o) {
      infoText.textContent = model.el.value === '__custom' ? labels.unverified : '';
      budgetHint.hidden = true;
      return;
    }
    const m = catalog.models.get(o.modelId),
      family = catalog.data.families.find((f) => f.id === m?.familyId);
    const src = options.assets?.[family?.logoId];
    if (src) {
      familyLogo.src = src;
      familyLogo.hidden = false;
      familyLogo.onerror = () => (familyLogo.hidden = true);
    }
    const caps = Object.entries(o.features || {})
      .filter(([, f]) => f.status === 'supported')
      .map(
        ([k]) =>
          ({
            functionCalling: 'Tools',
            jsonSchema: 'JSON schema',
            thinking: 'Thinking',
            promptCaching: 'Prompt caching',
          })[k] || null,
      )
      .filter(Boolean)
      .slice(0, 3);
    if (config.budget) {
      const b = config.budget,
        r = checkFit(o, {
          inputTokens: b.maxInputTokens,
          outputTokens: b.maxOutputTokens,
          overheadTokens: b.overheadTokens,
        });
      budgetHint.hidden = r.diagnostics.length === 0;
      budgetHint.textContent = r.diagnostics.map((d) => d.message).join(' ');
      budgetHint.dataset.state = r.status === 'exceeds' ? 'error' : 'warning';
    }
    infoText.textContent = [
      o.limits.context
        ? `${o.limits.context.toLocaleString()} context tokens`
        : 'Context unverified',
      (o.modalities.input || []).join('/'),
      ...caps,
    ].join(' · ');
  }
  function renderModels(saved) {
    model.el.replaceChildren();
    const g = current();
    const full =
      catalog
        .select({ ...config, ui: { ...config.ui, maxModelsPerProvider: 100 } })
        .find((x) => x.provider.id === g?.provider.id)?.offerings || [];
    more.hidden = g?.provider.deployment === 'local' || full.length <= (g?.offerings.length || 0);
    search.label.hidden = !expanded;
    more.textContent = expanded ? labels.collapse : labels.advanced;
    let choices =
      g?.provider.deployment === 'local' ? localChoices : expanded ? full : g?.offerings || [];
    if (expanded && search.el.value)
      choices = choices.filter((o) =>
        `${o.name} ${o.apiModelId}`.toLowerCase().includes(search.el.value.toLowerCase()),
      );
    for (const o of choices) addOption(model.el, o.id, o.name);
    if (
      saved?.offeringId &&
      !choices.some((o) => o.id === saved.offeringId) &&
      full.some((o) => o.id === saved.offeringId)
    ) {
      const o = catalog.get(saved.offeringId);
      addOption(model.el, o.id, `${o.name} · saved`);
    }
    if (config.ui?.allowCustomModel !== false || (saved?.modelId && !catalog.get(saved.offeringId)))
      addOption(model.el, '__custom', labels.custom);
    if (saved?.offeringId && catalog.get(saved.offeringId)?.providerId === g?.provider.id) {
      if (full.some((o) => o.id === saved.offeringId)) model.el.value = saved.offeringId;
      else {
        addOption(model.el, '__unavailable', 'Saved model unavailable — choose a LIVE model');
        model.el.value = '__unavailable';
        model.el.selectedOptions[0].disabled = true;
      }
    } else if (saved?.modelId && !choices.some((o) => o.id === saved.modelId)) {
      model.el.value = '__custom';
      custom.el.value = saved.modelId;
    } else if (saved?.modelId) model.el.value = saved.modelId;
    const local = g?.provider.deployment === 'local';
    if (
      local &&
      g.offerings[0]?.local?.configured &&
      !drafts.has(g.provider.id) &&
      !saved?.modelId
    ) {
      const entry = g.offerings[0];
      endpoint.el.value = entry.local.endpoint;
      api.el.value = entry.local.api;
      custom.el.value = entry.apiModelId;
    }
    endpoint.label.hidden = !local;
    api.label.hidden = !local;
    discovery.hidden = !local || !options.discoverLocal;
    key.label.querySelector('span').textContent = local ? labels.optionalKey : labels.key;
    key.label.hidden = g?.provider.auth === 'none';
    show.hidden = key.label.hidden;
    custom.label.hidden = model.el.value !== '__custom';
    save.disabled = !g;
    check.disabled = !g;
    logo.hidden = true;
    // Only application-provided local asset mappings are loaded; no catalog remote URLs.
    const src = options.assets?.[g?.provider.logoId];
    if (src) {
      logo.src = src;
      logo.hidden = false;
      logo.onerror = () => {
        logo.hidden = true;
      };
    }
    describeModel();
    if (!g) message(labels.empty, 'warning');
    else if (!custom.label.hidden) message(labels.unverified, 'warning');
    else message('');
  }
  more.onclick = () => {
    const saved = selection();
    expanded = !expanded;
    search.el.value = '';
    renderModels(saved);
  };
  search.el.oninput = () => renderModels(selection());
  provider.el.onchange = () => {
    drafts.set(activeProvider, {
      selection: {
        ...selection(),
        providerId: activeProvider,
        endpoint: endpoint.el.value,
        api: api.el.value,
      },
      secret: key.el.value,
      localChoices,
    });
    controller?.abort();
    revision++;
    expanded = false;
    search.el.value = '';
    activeProvider = provider.el.value;
    const draft = drafts.get(activeProvider);
    localChoices = draft?.localChoices || [];
    key.el.value = draft?.secret || '';
    custom.el.value = '';
    api.el.value = draft?.selection.api || LocalApi.OpenAI;
    endpoint.el.value = draft?.selection.endpoint || 'http://127.0.0.1:11434/v1';
    renderModels(draft?.selection);
    edit();
    if (!draft) {
      const r = revision,
        ref =
          (options.value?.providerId === activeProvider
            ? options.value?.credentialRef
            : undefined) ||
          options.credentialRef ||
          `byokit:${activeProvider}`;
      store
        .get?.(ref)
        .then((secret) => {
          if (!disposed && r === revision) key.el.value = secret || '';
        })
        .catch(() => {});
    }
  };
  model.el.onchange = edit;
  custom.el.oninput = edit;
  api.el.onchange = edit;
  endpoint.el.oninput = edit;
  key.el.oninput = edit;
  async function action(kind) {
    if (busy || disposed) return;
    const s = selection(),
      p = current()?.provider;
    if (!p) {
      message(labels.empty, 'warning');
      return;
    }
    if (!s.modelId) {
      message(labels.select, 'warning');
      return;
    }
    const secret = key.el.value;
    if (p?.auth === 'required' && !secret) {
      message(labels.missing, 'warning');
      return;
    }
    const request = ++revision;
    controller?.abort();
    controller = new AbortController();
    busy = true;
    save.disabled = true;
    check.disabled = true;
    message(labels.checking, 'checking');
    try {
      if (kind === 'check') {
        const result = await bounded(
          options.onCheck({ ...s, apiKey: secret, signal: controller.signal }),
          controller,
          options.checkTimeoutMs ?? 15000,
        );
        if (disposed || request !== revision) return;
        message(
          result.message || (result.ok ? 'Connected' : 'Connection failed'),
          result.ok ? 'ready' : 'error',
        );
      } else {
        const ref =
          (options.value?.providerId === s.providerId ? options.value?.credentialRef : undefined) ||
          options.credentialRef ||
          `byokit:${s.providerId}`;
        await store.set(ref, secret);
        if (disposed || request !== revision) return;
        await options.onSave({ ...s, credentialRef: ref });
        if (disposed || request !== revision) return;
        message(labels.saved, 'ready');
      }
    } catch {
      if (!disposed && request === revision) message('Operation failed. Please retry.', 'error');
    } finally {
      if (!disposed && request === revision) {
        busy = false;
        save.disabled = false;
        check.disabled = false;
      }
    }
  }
  check.onclick = () => action('check');
  form.onsubmit = (e) => {
    e.preventDefault();
    action('save');
  };
  discovery.onclick = async () => {
    const r = ++revision;
    discovery.disabled = true;
    message(labels.checking, 'checking');
    try {
      controller?.abort();
      controller = new AbortController();
      const found = await bounded(
        options.discoverLocal(endpoint.el.value.trim(), controller.signal, { api: api.el.value }),
        controller,
        options.checkTimeoutMs ?? 15000,
      );
      if (disposed || r !== revision) return;
      const saved = selection();
      localChoices = found.map((o) => ({ id: o.apiModelId, name: o.name }));
      renderModels(saved);
      message(`${found.length} installed models`, 'ready');
    } catch {
      if (!disposed && r === revision) message(labels.offline, 'warning');
    } finally {
      if (!disposed) discovery.disabled = false;
    }
  };
  renderModels(choice);
  if (choice.credentialRef) {
    const r = revision;
    store
      .get(choice.credentialRef)
      .then((secret) => {
        if (!disposed && revision === r) key.el.value = secret || '';
      })
      .catch(() => {});
  }
  return {
    destroy() {
      disposed = true;
      controller?.abort();
      revision++;
      drafts.clear();
      key.el.value = '';
      root.remove();
    },
    getSelection: selection,
  };
}

async function bounded(operation, controller, ms) {
  if (!Number.isFinite(ms) || ms < 1) throw new Error('Invalid timeout');
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Timed out'));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export * from '../index.js';
export { discoverLocal } from './local.js';
