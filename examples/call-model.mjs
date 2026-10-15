import * as byokit from '@staff-000/byokit/catalog';

const models = byokit.getModels({
  providerIds: [byokit.ProviderId.DeepSeek],
  local: false,
});
const model = models[0]; // Or let the user choose.
if (!model?.connection) throw new Error('No configured model');
const client = new byokit.OpenAI({
  baseURL: model.connection.baseUrl,
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
});
const completion = await client.chat.completions.create({
  model: model.apiModelId,
  max_tokens: 1024,
  messages: [{ role: byokit.Role.User, content: 'Hello' }],
});
console.log(completion.choices[0].message.content);
