import {requestFor,ProviderApi} from './inference.js';
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
  const base=local?settings.endpoint:ProviderApi[settings.providerId].base;
  const protocol={chat:'OpenAI',anthropic:'Claude',gemini:'Gemini',ollama:'Ollama'}[settings.protocol];
  return `import * as byokit from '@byokit/core/catalog';

const models = byokit.getModels(${query});
const model = models.find(m => m.apiModelId === ${quote(settings.modelId)})
  ?? byokit.appendModel([], {
    providerId: ${local?"byokit.customProviderId('local')":'byokit.ProviderId.'+provider[0]},
    modelId: ${quote(settings.modelId)},
    baseUrl: ${quote(base)},
    protocol: byokit.ApiProtocol.${protocol},
  })[0];
const client = new byokit.Byokit({ runtimeChecks: false });
const completion = await client.chat.completions.create({
  model,
  messages: [{ role: byokit.Role.User, content: ${quote(settings.prompt)} }],
  max_completion_tokens: ${settings.maxTokens},
}, { apiKey: ${authenticated?'process.env.API_KEY ?? '+quote(''):quote('')} });
console.log(completion.choices[0].message.content);`;
 }
 if(language==='python'){
  const query=local?`{"providerIds": [], "local": [{"endpoint": ${quote(settings.endpoint)}, "api": byokit.LocalApi.${settings.protocol==='ollama'?'OLLAMA':'OPEN_AI'}, "modelId": ${quote(settings.modelId)}}]}`:`{"providerIds": [byokit.ProviderId.${provider[1]}], "local": False}`;
  const base=settings.providerId==='local'?settings.endpoint:ProviderApi[settings.providerId].base;
  const protocol={chat:'OPEN_AI',anthropic:'CLAUDE',gemini:'GEMINI',ollama:'OLLAMA'}[settings.protocol];
  return `import byokit
${authenticated?'import os\n':''}import json

models = byokit.get_models(${query})
model = next((m for m in models if m["apiModelId"] == ${quote(settings.modelId)}), None)
if model is None:
    model = byokit.append_model([], {
        "providerId": ${local?"byokit.custom_provider_id('local')":'byokit.ProviderId.'+provider[1]},
        "modelId": ${quote(settings.modelId)},
        "baseUrl": ${quote(base)},
        "protocol": byokit.ApiProtocol.${protocol},
    })[0]
client = byokit.Byokit(runtime_checks=False)
completion = client.chat.completions.create(
    model=model,
    messages=[{"role": byokit.Role.USER, "content": json.loads(${quote(JSON.stringify(settings.prompt))})}],
    max_completion_tokens=${settings.maxTokens},
    api_key=${authenticated?'os.environ["API_KEY"]':'""'},
)
print(completion["choices"][0]["message"]["content"])`;
 }
 throw new Error('Unknown example language');
}
