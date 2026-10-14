import * as byokit from '@byokit/core/catalog';

const [model] = byokit.getModels({
  providerIds: [byokit.ProviderId.DeepSeek], limit: 1,
});
if (!model) throw new Error('No LIVE DeepSeek offering found.');
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error('Set DEEPSEEK_API_KEY first.');

const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: model.apiModelId,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    max_tokens: 256,
    stream: false,
  }),
  signal: AbortSignal.timeout(90_000),
  redirect: 'error',
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const data = await response.json();
console.log(data.choices[0].message.content);
