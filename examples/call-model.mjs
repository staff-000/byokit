import * as byokit from '@byokit/core/catalog';

const [model] = byokit.getModels({
  providerIds: [byokit.ProviderId.DeepSeek], limit: 1, local: false,
});
if (!model) throw new Error('No matching model');
const client = new byokit.Byokit();
const completion = await client.chat.completions.create({
  model,
  messages: [{ role: byokit.Role.User, content: 'Reply with exactly: OK' }],
}, { apiKey: process.env.DEEPSEEK_API_KEY ?? '' });
console.log(completion.choices[0].message.content);
