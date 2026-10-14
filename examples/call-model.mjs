import * as byokit from '@byokit/core/catalog';

const [model] = byokit.getModels({ providerIds: [byokit.ProviderId.DeepSeek] });
const key = process.env.DEEPSEEK_API_KEY;
if (!model || !key) throw new Error('Select a LIVE model and set DEEPSEEK_API_KEY.');
const result = await byokit.call(model, 'Reply with exactly: OK', key);
console.log(result.choices[0].message.content);
