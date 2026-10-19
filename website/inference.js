import {
  classifyVerificationError,
  successAttempt,
  validAssessment,
} from '../packages/byokit/verification.js';
import { SPEED_BENCHMARK, isStandardSpeedSettings, speedAdapter } from './speed-measurements.js';
import { OpenAI, prepareCall, ApiProtocol, CallError } from '../packages/byokit/index.js';
import { validateCredentialTransport } from '../packages/byokit/call.js';
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
    throw new CallError('UNSUPPORTED_OPERATION', 'Unsupported API for this provider.');
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
    throw new CallError('INVALID_REQUEST', 'Enter a prompt of up to 8,000 characters.');
  if (!Number.isInteger(settings.maxTokens) || settings.maxTokens < 16 || settings.maxTokens > 8192)
    throw new CallError('INVALID_REQUEST', 'Use an output limit from 16 to 8,192 tokens.');
  return {
    messages: [{ role: 'user', content: settings.prompt }],
    max_completion_tokens: settings.maxTokens,
  };
}
export function requestFor(settings, key) {
  if (typeof key !== 'string' || (!key && settings.providerId !== 'local'))
    throw new CallError('CREDENTIAL_ERROR', 'Enter a provider API key.');
  const request = prepareCall(verificationModel(settings), verificationInput(settings), {
    runtimeChecks: false,
  });
  validateCredentialTransport(request.url, key);
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
  const startedAt = Date.now();
  let baseline = null;
  const phases = [];
  try {
    requestFor(settings, key);
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
      if (!r1.choices[0]?.message?.content?.trim())
        throw new CallError(
          'EMPTY_RESPONSE',
          'Call returned no visible text. No success recorded.',
        );
      baseline = { response: r1, latencyMs: t1Latency };
      phases.push({ phase: 'baseline', attempt: successAttempt() });
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
      if (!text?.trim())
        throw new CallError(
          'EMPTY_RESPONSE',
          'Call returned no visible text. No success recorded.',
        );
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
      const measured =
        Number.isInteger(r1.usage?.completion_tokens) &&
        r1.usage.completion_tokens > 0 &&
        Number.isInteger(r2.usage?.completion_tokens) &&
        deltaT > 0 &&
        deltaN > 0 &&
        deltaN / (deltaT / 1000) <= 10000;
      const standard = isStandardSpeedSettings(settings) && measured;

      return {
        assessment: {
          attempt:
            measured && tokensPerSecond != null
              ? successAttempt()
              : { ...classifyVerificationError({ code: 'INVALID_RESPONSE' }), outcome: 'partial' },
          checks: {
            textGeneration: 'passed',
            speed: measured && tokensPerSecond != null ? 'passed' : 'inconclusive',
          },
          phases: [...phases, { phase: 'generation', attempt: successAttempt() }],
        },
        text: text.slice(0, 10000),
        checkedAt: new Date().toISOString(),
        latencyMs: t2Latency,
        // Baseline call latency is an overhead estimate, not measured streaming TTFT.

        ...(standard && tokensPerSecond != null ? { benchmark: SPEED_BENCHMARK } : {}),
        ...(measured && tokensPerSecond != null ? { tokensPerSecond } : {}),
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
    if (!text?.trim())
      throw new CallError('EMPTY_RESPONSE', 'Call returned no visible text. No success recorded.');
    const latencyMs = Date.now() - started;
    const outputTokens = result.usage?.completion_tokens;
    return {
      assessment: {
        attempt: successAttempt(),
        checks: { textGeneration: 'passed', speed: 'not_run' },
        phases: [{ phase: 'generation', attempt: successAttempt() }],
      },
      text: text.slice(0, 10000),
      checkedAt: new Date().toISOString(),
      latencyMs,
      returnedModel: result.model,
      usage: {
        ...(result.usage?.prompt_tokens !== undefined
          ? { inputTokens: result.usage.prompt_tokens }
          : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
      },
      endpoint: prepareCall(model, input, { runtimeChecks: false }).url,
    };
  } catch (error) {
    const attempt = classifyVerificationError(error);
    const state =
      attempt.outcome === 'blocked'
        ? 'blocked'
        : attempt.outcome === 'canceled'
          ? 'not_run'
          : 'inconclusive';
    const assessment = {
      attempt: baseline ? { ...attempt, outcome: 'partial' } : attempt,
      checks: {
        textGeneration: baseline ? 'passed' : state,
        speed: benchmarkSpeed && baseline ? state : 'not_run',
      },
      phases: [
        ...phases,
        { phase: benchmarkSpeed && !baseline ? 'baseline' : 'generation', attempt },
      ],
    };
    error.assessment = assessment;
    error.checkedAt = new Date().toISOString();
    error.latencyMs = Math.max(0, Date.now() - startedAt);
    if (!baseline) throw error;
    return {
      assessment,
      checkedAt: error.checkedAt,
      latencyMs: error.latencyMs,
      text: baseline.response.choices[0].message.content.slice(0, 10000),
      returnedModel: baseline.response.model,
      usage: {},
      endpoint: requestFor(settings, key).url,
    };
  }
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
    result:
      result.assessment && result.assessment.attempt.outcome !== 'succeeded' ? 'failed' : 'passed',
    ...(result.assessment ? { assessment: structuredClone(result.assessment) } : {}),
    checks: ['textGeneration'],
    adapter:
      result.benchmark === SPEED_BENCHMARK && isStandardSpeedSettings(settings)
        ? speedAdapter(settings.protocol)
        : 'byokit-website@1',
    usage: { ...result.usage },
    scope: 'this-browser',
  };
}
export function safeRecords(input) {
  if (!Array.isArray(input)) return [];
  const keys = [
    'schemaVersion',
    'assessment',
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
        ['passed', 'failed'].includes(r.result) &&
        (!r.assessment || validAssessment(r.assessment)) &&
        r.scope === 'this-browser' &&
        typeof r.offeringId === 'string' &&
        typeof r.checkedAt === 'string' &&
        Number.isFinite(Date.parse(r.checkedAt)) &&
        Object.keys(r).every((k) => keys.includes(k)),
    )
    .slice(0, 200);
}
