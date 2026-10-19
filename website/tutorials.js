export const tutorials = {
  query: {
    typescript:
      "import * as byokit from 'byokit';\n\nconst models = byokit.getModels();\nconsole.log(models.slice(0, 2).map(model => ({\n  providerId: model.providerId,\n  apiModelId: model.apiModelId,\n  callable: model.callSupport.textGeneration,\n})));",
    python:
      'import byokit\n\nmodels = byokit.get_models()\nprint([{\n    "providerId": model["providerId"],\n    "apiModelId": model["apiModelId"],\n    "callable": model["callSupport"]["textGeneration"],\n} for model in models[:2]])',
  },
  matchers: {
    typescript:
      "import * as byokit from 'byokit/catalog';\n\n// Select models with composable matchers (exact, any, contain, exclude, and, or, xor, not)\nconst models = byokit.getModels(byokit.COMPLETE, {\n  providerIds: byokit.any(\n    byokit.ProviderId.OpenAI,\n    byokit.ProviderId.Google,\n    byokit.ProviderId.Anthropic,\n    byokit.ProviderId.DeepSeek,\n  ),\n  filters: {\n    speciality: byokit.exact(byokit.Speciality.General),\n    tier: byokit.or(\n      byokit.exact(byokit.Tier.Flash),\n      byokit.and(\n        byokit.exact(byokit.Tier.Workhorse),\n        byokit.not(byokit.exact(byokit.Tier.Lite)),\n      ),\n    ),\n  },\n  local: false,\n});\nconsole.log(models.map(m => ({ provider: m.provider.name, model: m.apiModelId, tier: m.tier })));",
    python:
      'import byokit\n\nmodels = byokit.get_models(byokit.COMPLETE, {\n    "providerIds": byokit.any(\n        byokit.ProviderId.OPEN_AI,\n        byokit.ProviderId.GOOGLE,\n        byokit.ProviderId.ANTHROPIC,\n        byokit.ProviderId.DEEP_SEEK,\n    ),\n    "filters": {\n        "speciality": byokit.exact(byokit.Speciality.GENERAL),\n        "tier": byokit.or_(\n            byokit.exact(byokit.Tier.FLASH),\n            byokit.and_(\n                byokit.exact(byokit.Tier.WORKHORSE),\n                byokit.not_(byokit.exact(byokit.Tier.LITE)),\n            ),\n        ),\n    },\n    "local": False,\n})\nprint([{"provider": m["provider"]["name"], "model": m["apiModelId"], "tier": m["tier"]} for m in models])',
  },
  inference: {
    typescript:
      "import * as byokit from 'byokit';\n\nconst key = process.env.DEEPSEEK_API_KEY;\nif (!key) throw new Error('Set DEEPSEEK_API_KEY');\n\nconst [model] = byokit.getModels(byokit.DEFAULT, {\n  providerIds: [byokit.ProviderId.DeepSeek],\n  local: false,\n  limit: 1,\n  filters: { callable: true },\n});\nif (!model?.connection) throw new Error('No matching callable model');\n\nconst client = new byokit.OpenAI({\n  baseURL: model.connection.baseUrl,\n  protocol: model.connection.protocol,\n  apiKey: key,\n  models: [model], // Optional metadata; also preserves the offering's call-support checks.\n});\nconst response = await client.chat.completions.create({\n  model: model.apiModelId,\n  max_tokens: 128,\n  messages: [{ role: byokit.Role.User, content: 'Hello!' }],\n});\nconsole.log(response.choices[0].message.content);",
    python:
      'import os\nimport byokit\n\nkey = os.environ["DEEPSEEK_API_KEY"]\nmodels = byokit.get_models(byokit.DEFAULT, {\n    "providerIds": [byokit.ProviderId.DEEP_SEEK],\n    "local": False,\n    "limit": 1,\n    "filters": {"callable": True},\n})\nif not models or not models[0]["connection"]:\n    raise ValueError("No matching callable model")\nmodel = models[0]\n\nclient = byokit.OpenAI(\n    base_url=model["connection"]["baseUrl"],\n    protocol=model["connection"]["protocol"],\n    api_key=key,\n    models=[model],\n)\nresponse = client.chat.completions.create(\n    model=model["apiModelId"],\n    max_tokens=128,\n    messages=[{"role": byokit.Role.USER, "content": "Hello!"}],\n)\nprint(response.choices[0].message.content)',
  },
  claude: {
    typescript:
      "import * as byokit from 'byokit';\n\nconst key = process.env.ANTHROPIC_API_KEY;\nif (!key) throw new Error('Set ANTHROPIC_API_KEY');\n\nconst [model] = byokit.getModels(byokit.DEFAULT, {\n  providerIds: [byokit.ProviderId.Anthropic],\n  local: false,\n  limit: 1,\n  filters: { callable: true },\n});\nif (!model?.connection) throw new Error('No matching callable model');\n\nconst client = new byokit.Anthropic({\n  baseURL: model.connection.baseUrl,\n  protocol: model.connection.protocol,\n  apiKey: key,\n  models: [model], // Optional metadata; also preserves the offering's call-support checks.\n});\nconst response = await client.messages.create({\n  model: model.apiModelId,\n  max_tokens: 128,\n  messages: [{ role: byokit.Role.User, content: 'Hello!' }],\n});\nconsole.log(response.content);",
    python:
      'import os\nimport byokit\n\nkey = os.environ["ANTHROPIC_API_KEY"]\nmodels = byokit.get_models(byokit.DEFAULT, {\n    "providerIds": [byokit.ProviderId.ANTHROPIC],\n    "local": False,\n    "limit": 1,\n    "filters": {"callable": True},\n})\nif not models or not models[0]["connection"]:\n    raise ValueError("No matching callable model")\nmodel = models[0]\n\nclient = byokit.Anthropic(\n    base_url=model["connection"]["baseUrl"],\n    protocol=model["connection"]["protocol"],\n    api_key=key,\n    models=[model],\n)\nresponse = client.messages.create(\n    model=model["apiModelId"],\n    max_tokens=128,\n    messages=[{"role": byokit.Role.USER, "content": "Hello!"}],\n)\nprint(response.content)',
  },
  direct: {
    typescript:
      "import * as byokit from 'byokit';\n\nconst key = process.env.DEEPSEEK_API_KEY;\nif (!key) throw new Error('Set DEEPSEEK_API_KEY');\n\nconst [model] = byokit.getModels(byokit.DEFAULT, {\n  providerIds: [byokit.ProviderId.DeepSeek],\n  local: false,\n  limit: 1,\n  filters: { callable: true },\n});\nif (!model?.connection) throw new Error('No matching callable model');\n\nconst response = await byokit.call(model, 'Hello!', key);\nconsole.log(response.choices[0].message.content);",
    python:
      'import os\nimport byokit\n\nkey = os.environ["DEEPSEEK_API_KEY"]\nmodels = byokit.get_models(byokit.DEFAULT, {\n    "providerIds": [byokit.ProviderId.DEEP_SEEK],\n    "local": False,\n    "limit": 1,\n    "filters": {"callable": True},\n})\nif not models or not models[0]["connection"]:\n    raise ValueError("No matching callable model")\nmodel = models[0]\n\nresponse = byokit.call(model, "Hello!", key)\nprint(response["choices"][0]["message"]["content"])',
  },
  local: {
    typescript:
      "import * as byokit from 'byokit';\n\nconst [model] = byokit.getModels({\n  providerIds: [], // Return only the configured Local entry.\n  local: [\n    {\n      endpoint: 'http://localhost:11434',\n      api: byokit.LocalApi.Ollama,\n      modelId: 'my-installed-model',\n    },\n  ],\n});\nconst response = await byokit.call(model, 'Hello!', '');\nconsole.log(response.choices[0].message.content);",
    python:
      'import byokit\n\nmodel = byokit.get_models({\n    "providerIds": [],\n    "local": [{\n        "endpoint": "http://localhost:11434",\n        "api": byokit.LocalApi.OLLAMA,\n        "modelId": "my-installed-model",\n    }],\n})[0]\nresponse = byokit.call(model, "Hello!", "")\nprint(response["choices"][0]["message"]["content"])',
  },
};
