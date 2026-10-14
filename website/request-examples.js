import {requestFor} from './inference.js';
const quote=value=>JSON.stringify(value);
const shellQuote=value=>"'"+value.replace(/'/g,"'\"'\"'")+"'";
export function nativeRequestExample(settings,language='javascript',{authenticated=settings.providerId!=='local'}={}){
 const request=requestFor(settings,authenticated?'EXAMPLE_API_KEY':'');
 const jsHeaders=Object.entries(request.headers).map(([name,value])=>`    ${quote(name)}: ${value==='Bearer EXAMPLE_API_KEY'?'`Bearer ${apiKey}`':value==='EXAMPLE_API_KEY'?'apiKey':quote(value)}`).join(',\n');
 const pyHeaders=Object.entries(request.headers).map(([name,value])=>`    ${quote(name)}: ${value==='Bearer EXAMPLE_API_KEY'?'"Bearer " + api_key':value==='EXAMPLE_API_KEY'?'api_key':quote(value)}`).join(',\n');
 if(language==='javascript')return `${authenticated?"const apiKey = process.env.API_KEY;\nif (!apiKey) throw new Error('Set API_KEY first.');\n\n":''}const response = await fetch(${quote(request.url)}, {\n  method: 'POST',\n  headers: {\n${jsHeaders}\n  },\n  body: JSON.stringify(${JSON.stringify(request.body,null,2)}),\n  signal: AbortSignal.timeout(90_000),\n  redirect: 'error',\n});\nif (!response.ok) throw new Error(\`HTTP \${response.status}\`);\nconst data = await response.json();\nconsole.log(data);`;
 if(language==='python')return `import json\n${authenticated?'import os\n':''}import urllib.request\n\n${authenticated?'api_key = os.environ["API_KEY"]\n':''}request = urllib.request.Request(\n    ${quote(request.url)},\n    method="POST",\n    headers={\n${pyHeaders}\n    },\n    data=json.dumps(json.loads(${quote(JSON.stringify(request.body))})).encode(),\n)\nclass NoRedirect(urllib.request.HTTPRedirectHandler):\n    def redirect_request(self, *args, **kwargs):\n        return None\n\nopener = urllib.request.build_opener(NoRedirect)\nwith opener.open(request, timeout=90) as response:\n    data = json.load(response)\nprint(data)`;
 if(language==='curl'){const headers=Object.entries(request.headers).map(([name,value])=>`  -H ${value.includes('EXAMPLE_API_KEY')?'"'+name+': '+value.replace('EXAMPLE_API_KEY','$API_KEY')+'"':shellQuote(name+': '+value)}`).join(' \\\n');return `curl --fail-with-body --max-time 90 ${shellQuote(request.url)} \\\n${headers} \\\n  --data-raw ${shellQuote(JSON.stringify(request.body,null,2))}`;}
 throw new Error('Unknown example language');
}

const providerEnum={openai:['OpenAI','OPEN_AI'],anthropic:['Anthropic','ANTHROPIC'],google:['Google','GOOGLE'],openrouter:['OpenRouter','OPEN_ROUTER'],deepseek:['DeepSeek','DEEP_SEEK'],mistral:['Mistral','MISTRAL'],groq:['Groq','GROQ'],zhipuai:['ZhipuAI','ZHIPU_AI'],siliconflow:['SiliconFlow','SILICON_FLOW']};
export function requestExample(settings,language='javascript',{authenticated=settings.providerId!=='local'}={}){
 if(language==='curl')return nativeRequestExample(settings,language,{authenticated});
 const provider=providerEnum[settings.providerId],local=settings.providerId==='local';
 if(language==='javascript'){
  const query=local?`{ providerIds: [], local: [{ endpoint: ${quote(settings.endpoint)}, api: byokit.LocalApi.${settings.protocol==='ollama'?'Ollama':'OpenAI'}, modelId: ${quote(settings.modelId)} }] }`:`{ providerIds: [byokit.ProviderId.${provider[0]}], local: false }`;
  return `import * as byokit from '@byokit/core/catalog';

const [base] = byokit.getModels(${query});
const model = { ...base, apiModelId: ${quote(settings.modelId)} };
const client = byokit.openAI({
  model, apiKey: () => ${authenticated?'process.env.API_KEY ?? '+quote(''):quote('')}, runtimeChecks: false,
});
const completion = await client.chat.completions.create({
  messages: [{ role: byokit.Role.User, content: ${quote(settings.prompt)} }],
  max_completion_tokens: ${settings.maxTokens},
});
console.log(completion.choices[0].message.content);`;
 }
 if(language==='python'){
  const query=local?`{"providerIds": [], "local": [{"endpoint": ${quote(settings.endpoint)}, "api": byokit.LocalApi.${settings.protocol==='ollama'?'OLLAMA':'OPEN_AI'}, "modelId": ${quote(settings.modelId)}}]}`:`{"providerIds": [byokit.ProviderId.${provider[1]}], "local": False}`;
  return `import byokit
${authenticated?'import os\n':''}import json

model = byokit.get_models(${query})[0]
model = {**model, "apiModelId": ${quote(settings.modelId)}}
client = byokit.OpenAI(
    model=model, api_key=lambda: ${authenticated?'os.environ["API_KEY"]':'""'}, runtime_checks=False,
)
completion = client.chat.completions.create(
    messages=[{"role": byokit.Role.USER, "content": json.loads(${quote(JSON.stringify(settings.prompt))})}],
    max_completion_tokens=${settings.maxTokens},
)
print(completion["choices"][0]["message"]["content"])`;
 }
 throw new Error('Unknown example language');
}
