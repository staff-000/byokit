export const tutorials = {
  query: {
    typescript:
      "import * as byokit from 'byokit/catalog';\n\nconst models = byokit.getModels();\nconsole.log(models.map(model => model.provider.id));",
    python:
      'import byokit\n\nmodels = byokit.get_models()\nprint([model["provider"]["id"] for model in models])',
  },
  matchers: {
    typescript:
      "import * as byokit from 'byokit/catalog';\n\n// Select models with composable matchers (exact, any, contain, exclude, and, or, xor, not)\nconst models = byokit.getModels(byokit.COMPLETE, {\n  providerIds: byokit.any(\n    byokit.ProviderId.OpenAI,\n    byokit.ProviderId.Google,\n    byokit.ProviderId.Anthropic,\n    byokit.ProviderId.DeepSeek,\n  ),\n  filters: {\n    speciality: byokit.exact(byokit.Speciality.General),\n    tier: byokit.or(\n      byokit.exact(byokit.Tier.Flash),\n      byokit.and(\n        byokit.exact(byokit.Tier.Workhorse),\n        byokit.not(byokit.exact(byokit.Tier.Lite)),\n      ),\n    ),\n  },\n  local: false,\n});\nconsole.log(models.map(m => ({ provider: m.provider.name, model: m.apiModelId, tier: m.tier })));",
    python:
      'import byokit\n\n# Select models with composable matchers (exact, any, contain, exclude, and_, or_, xor_, not_)\nmodels = byokit.get_models(\n    byokit.COMPLETE,\n    providerIds=byokit.any(\n        byokit.ProviderId.OPENAI,\n        byokit.ProviderId.GOOGLE,\n        byokit.ProviderId.ANTHROPIC,\n        byokit.ProviderId.DEEP_SEEK,\n    ),\n    filters={\n        "speciality": byokit.exact(byokit.Speciality.GENERAL),\n        "tier": byokit.or_(\n            byokit.exact(byokit.Tier.FLASH),\n            byokit.and_(\n                byokit.exact(byokit.Tier.WORKHORSE),\n                byokit.not_(byokit.exact(byokit.Tier.LITE)),\n            ),\n        ),\n    },\n    local=False,\n)\nprint([{"provider": m["provider"]["name"], "model": m["apiModelId"], "tier": m["tier"]} for m in models])',
  },
  inference: {
    typescript:
      "import * as byokit from 'byokit/catalog';\n\nconst models = byokit.getModels({\n  providerIds: byokit.exact(byokit.ProviderId.DeepSeek), local: false,\n});\nconst model = models[0]; // Or let the user choose.\nif (!model?.connection) throw new Error('No configured model');\nconst client = new byokit.OpenAI({\n  baseURL: model.connection.baseUrl,\n  apiKey: process.env.DEEPSEEK_API_KEY ?? '',\n});\nconst completion = await client.chat.completions.create({\n  model: model.apiModelId,\n  max_tokens: 1024,\n  messages: [{ role: byokit.Role.User, content: 'Hello' }],\n});\nconsole.log(completion.choices[0].message.content);",
    python:
      'import os\nimport byokit\n\nmodels = byokit.get_models({\n    "providerIds": byokit.exact(byokit.ProviderId.DEEP_SEEK), "local": False,\n})\nif not models or not models[0]["connection"]:\n    raise ValueError("No configured model")\nmodel = models[0]  # Or let the user choose.\nclient = byokit.OpenAI(\n    base_url=model["connection"]["baseUrl"],\n    api_key=os.environ["DEEPSEEK_API_KEY"],\n)\ncompletion = client.chat.completions.create(\n    model=model["apiModelId"],\n    max_tokens=1024,\n    messages=[{"role": byokit.Role.USER, "content": "Hello"}],\n)\nprint(completion.choices[0].message.content)',
  },
  claude: {
    typescript:
      "import * as byokit from 'byokit/catalog';\n\nconst models = byokit.getModels({\n  providerIds: byokit.exact(byokit.ProviderId.Anthropic), local: false,\n});\nconst model = models[0]; // Or let the user choose.\nif (!model?.connection) throw new Error('No configured model');\nconst client = new byokit.Anthropic({\n  baseURL: model.connection.baseUrl,\n  apiKey: process.env.ANTHROPIC_API_KEY ?? '',\n});\nconst completion = await client.messages.create({\n  model: model.apiModelId,\n  max_tokens: 1024,\n  messages: [{ role: byokit.Role.User, content: 'Hello' }],\n});\nconsole.log(completion.content);",
    python:
      'import os\nimport byokit\n\nmodels = byokit.get_models({\n    "providerIds": byokit.exact(byokit.ProviderId.ANTHROPIC), "local": False,\n})\nif not models or not models[0]["connection"]:\n    raise ValueError("No configured model")\nmodel = models[0]  # Or let the user choose.\nclient = byokit.Anthropic(\n    base_url=model["connection"]["baseUrl"],\n    api_key=os.environ["ANTHROPIC_API_KEY"],\n)\ncompletion = client.messages.create(\n    model=model["apiModelId"],\n    max_tokens=1024,\n    messages=[{"role": byokit.Role.USER, "content": "Hello"}],\n)\nprint(completion.content)',
  },
};
