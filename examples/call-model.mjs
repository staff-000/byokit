import * as byokit from '@byokit/core/catalog';
const [model] = byokit.getModels({providerIds:[byokit.ProviderId.DeepSeek]});
const client = byokit.openAI({model,apiKey:()=>process.env.DEEPSEEK_API_KEY??''});
const completion = await client.chat.completions.create({model:model.apiModelId,messages:[{role:byokit.Role.User,content:'Reply with exactly: OK'}]});
console.log(completion.choices[0].message.content);
