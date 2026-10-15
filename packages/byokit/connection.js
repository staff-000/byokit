import { ApiProtocol } from './enums.js';
export const providerConnections = Object.freeze({
  openai: { baseUrl: 'https://api.openai.com/v1', protocol: ApiProtocol.OpenAI },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', protocol: ApiProtocol.Claude },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: ApiProtocol.Gemini,
  },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', protocol: ApiProtocol.OpenAI },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', protocol: ApiProtocol.OpenAI },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', protocol: ApiProtocol.OpenAI },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', protocol: ApiProtocol.OpenAI },
  zhipuai: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', protocol: ApiProtocol.OpenAI },
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', protocol: ApiProtocol.OpenAI },
});
export function connectionFor(model) {
  if (model.connection) return { ...model.connection };
  if (model.local) {
    let baseUrl = model.local.endpoint?.replace(/\/$/, '') || '';
    const protocol = model.local.api === 'ollama' ? ApiProtocol.Ollama : ApiProtocol.OpenAI;
    if (baseUrl && protocol === ApiProtocol.OpenAI && !baseUrl.endsWith('/v1')) baseUrl += '/v1';
    if (protocol === ApiProtocol.Ollama) baseUrl = baseUrl.replace(/\/v1$/, '');
    return { baseUrl, protocol };
  }
  return providerConnections[model.providerId]
    ? { ...providerConnections[model.providerId] }
    : null;
}
