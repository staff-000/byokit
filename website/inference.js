import { OpenAI, prepareCall, ApiProtocol } from '../packages/byokit/index.js';
// Verification UI: shared library adapters, browser-local records, no stored credentials.
import { providerConnections } from '../packages/byokit/connection.js';
import catalog from '../packages/byokit/catalog.js';
const docs = {
  openai: 'https://developers.openai.com/api/reference',
  anthropic: 'https://platform.claude.com/docs/en/api/messages/create',
  google: 'https://ai.google.dev/api/generate-content',
  openrouter: 'https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request',
  deepseek: 'https://api-docs.deepseek.com/api/create-chat-completion',
  mistral: 'https://docs.mistral.ai/api',
  groq: 'https://console.groq.com/docs/api-reference',
  zhipuai: 'https://docs.bigmodel.cn',
  siliconflow: 'https://docs.siliconflow.cn/docs/api/chat-completions-post',
};
const protocolNames = {
  [ApiProtocol.OpenAI]: 'chat',
  [ApiProtocol.Claude]: 'anthropic',
  [ApiProtocol.Gemini]: 'gemini',
};
export const ProviderApi = Object.freeze({
  ...Object.fromEntries(
    Object.entries(providerConnections).map(([id, connection]) => [
      id,
      {
        name: catalog.providers.find((provider) => provider.id === id)?.name || id,
        base: connection.baseUrl,
        protocols: [protocolNames[connection.protocol]],
        docs: docs[id],
      },
    ]),
  ),
  local: { name: 'Local', protocols: ['chat', 'ollama'] },
});
export const ProtocolNames = {
  responses: 'OpenAI Responses',
  chat: 'OpenAI-compatible Chat Completions',
  anthropic: 'Anthropic Messages',
  gemini: 'Gemini GenerateContent',
  ollama: 'Ollama native Chat',
};
function verificationModel(settings) {
  const provider = ProviderApi[settings.providerId];
  if (!provider || !provider.protocols.includes(settings.protocol))
    throw new Error('Unsupported API for this provider.');
  let base = provider.base;
  if (settings.providerId === 'local') {
    base = settings.endpoint?.replace(/\/$/, '');
    if (settings.protocol === 'chat' && base && !base.endsWith('/v1')) base += '/v1';
    if (settings.protocol === 'ollama') base = base?.replace(/\/v1$/, '');
  }
  return {
    id: settings.offeringId,
    providerId: settings.providerId,
    apiModelId: settings.modelId,
    connection: {
      baseUrl: base,
      protocol: {
        chat: ApiProtocol.OpenAI,
        anthropic: ApiProtocol.Claude,
        gemini: ApiProtocol.Gemini,
        ollama: ApiProtocol.Ollama,
      }[settings.protocol],
    },
    ...(settings.providerId === 'local' ? { local: { endpoint: settings.endpoint } } : {}),
  };
}
function verificationInput(settings) {
  if (
    typeof settings.prompt !== 'string' ||
    !settings.prompt.trim() ||
    settings.prompt.length > 8000
  )
    throw new Error('Enter a prompt of up to 8,000 characters.');
  if (!Number.isInteger(settings.maxTokens) || settings.maxTokens < 16 || settings.maxTokens > 8192)
    throw new Error('Use an output limit from 16 to 8,192 tokens.');
  return {
    messages: [{ role: 'user', content: settings.prompt }],
    max_completion_tokens: settings.maxTokens,
  };
}
export function requestFor(settings, key) {
  if (typeof key !== 'string' || (!key && settings.providerId !== 'local'))
    throw new Error('Enter a provider API key.');
  const request = prepareCall(verificationModel(settings), verificationInput(settings), {
    runtimeChecks: false,
  });
  const headers = { 'Content-Type': 'application/json' };
  if (request.protocol === ApiProtocol.Claude) {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (request.protocol === ApiProtocol.Gemini) headers['x-goog-api-key'] = key;
  else if (key) headers.Authorization = 'Bearer ' + key;
  return { url: request.url, body: request.body, headers };
}
export async function verifyInference(settings, key, options = {}) {
  const { benchmarkSpeed = false, ...clientOptions } = options;
  const model = verificationModel(settings);
  const client = new OpenAI({
    baseURL: model.connection.baseUrl,
    protocol: model.connection.protocol,
    apiKey: key,
    runtimeChecks: false,
  });

  if (benchmarkSpeed) {
    // Query 1: Baseline Overhead Query ("Reply with exactly: OK", maxTokens: 16)
    const baseInput = {
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_completion_tokens: 16,
    };
    const t1Start = Date.now();
    const r1 = await client.chat.completions.create(
      { model: model.apiModelId, ...baseInput },
      clientOptions,
    );
    const t1Latency = Date.now() - t1Start;
    const n1Out = r1.usage?.completion_tokens ?? 1;

    // Query 2: Generation Benchmark Query
    const mainInput = verificationInput(settings);
    const t2Start = Date.now();
    const r2 = await client.chat.completions.create(
      { model: model.apiModelId, ...mainInput },
      clientOptions,
    );
    const t2Latency = Date.now() - t2Start;
    const text = r2.choices[0].message.content;
    if (!text?.trim()) throw new Error('Call returned no visible text. No success recorded.');
    const n2Out = r2.usage?.completion_tokens ?? (text.trim().split(/\s+/).length || 50);

    // Delta calculations to eliminate network/TTFT overhead
    const deltaT = t2Latency - t1Latency;
    const deltaN = n2Out - n1Out;
    let tokensPerSecond = null;
    if (deltaT > 0 && deltaN > 0) {
      tokensPerSecond = Math.round((deltaN / (deltaT / 1000)) * 10) / 10;
    } else if (t2Latency > 0 && n2Out > 0) {
      tokensPerSecond = Math.round((n2Out / (t2Latency / 1000)) * 10) / 10;
    }
    if (
      tokensPerSecond != null &&
      (!Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0 || tokensPerSecond > 10000)
    ) {
      tokensPerSecond = tokensPerSecond > 10000 ? 10000 : null;
    }
    const timeToFirstTokenMs = Math.max(1, t1Latency);

    return {
      text: text.slice(0, 10000),
      checkedAt: new Date().toISOString(),
      latencyMs: t2Latency,
      timeToFirstTokenMs,
      ...(tokensPerSecond != null ? { tokensPerSecond } : {}),
      returnedModel: r2.model,
      usage: {
        ...(r2.usage?.prompt_tokens !== undefined ? { inputTokens: r2.usage.prompt_tokens } : {}),
        outputTokens: n2Out,
      },
      endpoint: prepareCall(model, mainInput, { runtimeChecks: false }).url,
    };
  }

  // Single-query mode (fallback or when benchmarkSpeed is not requested)
  const input = verificationInput(settings);
  const started = Date.now(),
    result = await client.chat.completions.create(
      { model: model.apiModelId, ...input },
      clientOptions,
    );
  const text = result.choices[0].message.content;
  if (!text?.trim()) throw new Error('Call returned no visible text. No success recorded.');
  const latencyMs = Date.now() - started;
  const outputTokens = result.usage?.completion_tokens;
  const tokensPerSecond =
    Number.isInteger(outputTokens) && outputTokens > 0 && latencyMs > 0
      ? Math.round((outputTokens / (latencyMs / 1000)) * 10) / 10
      : null;
  return {
    text: text.slice(0, 10000),
    checkedAt: new Date().toISOString(),
    latencyMs,
    ...(tokensPerSecond != null ? { tokensPerSecond } : {}),
    returnedModel: result.model,
    usage: {
      ...(result.usage?.prompt_tokens !== undefined
        ? { inputTokens: result.usage.prompt_tokens }
        : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
    },
    endpoint: prepareCall(model, input, { runtimeChecks: false }).url,
  };
}
export function successRecord(settings, result, secret = '') {
  const safe = (value) =>
    typeof value === 'string' && secret.trim()
      ? value.split(secret.trim()).join('[redacted]')
      : value;
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    offeringId: safe(settings.offeringId),
    providerId: settings.providerId,
    modelId: safe(settings.modelId),
    returnedModel: safe(result.returnedModel),
    protocol: settings.protocol,
    endpoint: safe(result.endpoint),
    maxTokens: settings.maxTokens,
    checkedAt: result.checkedAt,
    latencyMs: result.latencyMs,
    ...(result.timeToFirstTokenMs != null ? { timeToFirstTokenMs: result.timeToFirstTokenMs } : {}),
    ...(result.tokensPerSecond != null ? { tokensPerSecond: result.tokensPerSecond } : {}),
    result: 'passed',
    checks: ['textGeneration'],
    adapter: 'byokit-website@1',
    usage: { ...result.usage },
    scope: 'this-browser',
  };
}
export function safeRecords(input) {
  if (!Array.isArray(input)) return [];
  const keys = [
    'schemaVersion',
    'id',
    'offeringId',
    'providerId',
    'modelId',
    'returnedModel',
    'protocol',
    'endpoint',
    'maxTokens',
    'checkedAt',
    'latencyMs',
    'timeToFirstTokenMs',
    'tokensPerSecond',
    'result',
    'checks',
    'adapter',
    'usage',
    'scope',
  ];
  return input
    .filter(
      (r) =>
        r &&
        r.schemaVersion === 1 &&
        r.result === 'passed' &&
        r.scope === 'this-browser' &&
        typeof r.offeringId === 'string' &&
        typeof r.checkedAt === 'string' &&
        Number.isFinite(Date.parse(r.checkedAt)) &&
        Object.keys(r).every((k) => keys.includes(k)),
    )
    .slice(0, 200);
}
