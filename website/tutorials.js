export const tutorials = {
  query: {
    typescript:
      "import * as byokit from 'byokit/catalog';\n\nconst models = byokit.getModels();\nconsole.log(models.map(model => model.provider.id));",
    python:
      'import byokit\n\nmodels = byokit.get_models()\nprint([model["provider"]["id"] for model in models])',
  },
  inference: {
    typescript:
      "import * as byokit from 'byokit/catalog';\n\nconst models = byokit.getModels({\n  providerIds: [byokit.ProviderId.DeepSeek], local: false,\n});\nconst model = models[0]; // Or let the user choose.\nif (!model?.connection) throw new Error('No configured model');\nconst client = new byokit.OpenAI({\n  baseURL: model.connection.baseUrl,\n  apiKey: process.env.DEEPSEEK_API_KEY ?? '',\n});\nconst completion = await client.chat.completions.create({\n  model: model.apiModelId,\n  max_tokens: 1024,\n  messages: [{ role: byokit.Role.User, content: 'Hello' }],\n});\nconsole.log(completion.choices[0].message.content);",
    python:
      'import os\nimport byokit\n\nmodels = byokit.get_models({\n    "providerIds": [byokit.ProviderId.DEEP_SEEK], "local": False,\n})\nif not models or not models[0]["connection"]:\n    raise ValueError("No configured model")\nmodel = models[0]  # Or let the user choose.\nclient = byokit.OpenAI(\n    base_url=model["connection"]["baseUrl"],\n    api_key=os.environ["DEEPSEEK_API_KEY"],\n)\ncompletion = client.chat.completions.create(\n    model=model["apiModelId"],\n    max_tokens=1024,\n    messages=[{"role": byokit.Role.USER, "content": "Hello"}],\n)\nprint(completion.choices[0].message.content)',
  },
  claude: {
    typescript:
      "import * as byokit from 'byokit/catalog';\n\nconst models = byokit.getModels({\n  providerIds: [byokit.ProviderId.Anthropic], local: false,\n});\nconst model = models[0]; // Or let the user choose.\nif (!model?.connection) throw new Error('No configured model');\nconst client = new byokit.Anthropic({\n  baseURL: model.connection.baseUrl,\n  apiKey: process.env.ANTHROPIC_API_KEY ?? '',\n});\nconst completion = await client.messages.create({\n  model: model.apiModelId,\n  max_tokens: 1024,\n  messages: [{ role: byokit.Role.User, content: 'Hello' }],\n});\nconsole.log(completion.content);",
    python:
      'import os\nimport byokit\n\nmodels = byokit.get_models({\n    "providerIds": [byokit.ProviderId.ANTHROPIC], "local": False,\n})\nif not models or not models[0]["connection"]:\n    raise ValueError("No configured model")\nmodel = models[0]  # Or let the user choose.\nclient = byokit.Anthropic(\n    base_url=model["connection"]["baseUrl"],\n    api_key=os.environ["ANTHROPIC_API_KEY"],\n)\ncompletion = client.messages.create(\n    model=model["apiModelId"],\n    max_tokens=1024,\n    messages=[{"role": byokit.Role.USER, "content": "Hello"}],\n)\nprint(completion.content)',
  },
};
