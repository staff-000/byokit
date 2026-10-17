// Included in the generated offline worker with the real byokit library/catalog.
self.onmessage = async ({ data }) => {
  const { code, id, verifications } = data;
  if (typeof code !== 'string' || code.length > 30000) return;
  if (Array.isArray(verifications) && typeof byokit.addVerifications === 'function') {
    try {
      byokit.addVerifications(verifications);
    } catch {}
  }
  let messages = 0,
    characters = 0;
  let capturedModels = [];
  const track = (item) => {
    if (Array.isArray(item)) {
      if (
        item.length > 0 &&
        item[0] &&
        typeof item[0] === 'object' &&
        ('providerId' in item[0] || 'provider' in item[0])
      ) {
        capturedModels = item;
      }
    } else if (
      item &&
      typeof item === 'object' &&
      ('providerId' in item || 'provider' in item) &&
      (item.id || item.apiModelId || item.modelId)
    ) {
      capturedModels = [item];
    }
  };
  const trackedByokit = {
    ...byokit,
    getModels(...args) {
      const res = byokit.getModels(...args);
      track(res);
      return res;
    },
    getModelsByProvider(...args) {
      const res = byokit.getModelsByProvider(...args);
      if (res && typeof res === 'object') {
        track(Object.values(res).flat());
      }
      return res;
    },
    select(...args) {
      const res = byokit.select ? byokit.select(...args) : undefined;
      track(res);
      return res;
    },
    appendModel(...args) {
      const res = byokit.appendModel(...args);
      track(res);
      return res;
    },
  };
  const emit = (level, values) => {
    if (messages >= 100 || characters >= 24000) return;
    const seen = new WeakSet();
    let text = values
      .map((value) => {
        if (typeof value === 'string') return value;
        try {
          return (
            JSON.stringify(
              value,
              (_key, item) => {
                if (typeof item === 'bigint') return String(item) + 'n';
                if (item && typeof item === 'object') {
                  if (seen.has(item)) return '[Circular]';
                  seen.add(item);
                }
                return item;
              },
              2,
            ) ?? String(value)
          );
        } catch {
          return String(value);
        }
      })
      .join(' ');
    if (text.length > 24000 - characters)
      text = text.slice(0, 24000 - characters) + '\n… output truncated';
    characters += text.length;
    messages++;
    self.postMessage({
      kind: 'byokit-playground',
      id,
      type: 'log',
      text: level === 'log' ? text : level + ': ' + text,
    });
  };
  const output = Object.freeze(
    Object.fromEntries(
      ['log', 'info', 'warn', 'error', 'table', 'debug'].map((level) => [
        level,
        (...values) => emit(level, values),
      ]),
    ),
  );
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const value = await new AsyncFunction('byokit', 'console', '"use strict";\n' + code)(
      trackedByokit,
      output,
    );
    if (value !== undefined) {
      emit('log', [value]);
      track(value);
    }
    const modelsPayload = capturedModels.map((m) => {
      const pId = m.providerId || (typeof m.provider === 'object' ? m.provider?.id : m.provider);
      return {
        id: m.id || `${pId}/${m.modelId || m.apiModelId}`,
        name: m.name || m.apiModelId || m.modelId || m.id,
        providerId: pId,
        providerName:
          (typeof m.provider === 'object' ? m.provider?.name : m.provider) || pId || 'Provider',
        apiModelId: m.apiModelId || m.modelId,
        protocol:
          m.connection?.protocol ||
          (pId === 'anthropic' ? 'anthropic' : pId === 'google' ? 'gemini' : 'chat'),
        endpoint: m.connection?.baseUrl || m.baseUrl,
        local: !!m.local,
        callSupport: m.callSupport || { textGeneration: true },
        verification: m.verification,
      };
    });
    self.postMessage({
      kind: 'byokit-playground',
      id,
      type: 'done',
      empty: messages === 0,
      models: modelsPayload,
    });
  } catch (error) {
    self.postMessage({
      kind: 'byokit-playground',
      id,
      type: 'error',
      text: String(error.name || 'Error') + ': ' + String(error.message || error).slice(0, 2000),
    });
  }
};
