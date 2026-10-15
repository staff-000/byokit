export const tutorials={
  "query": {
    "typescript": "import * as byokit from '@byokit/core/catalog';\n\nconst models = byokit.getModels();\nconsole.log(models.map(model => model.provider.id));",
    "python": "import byokit\n\nmodels = byokit.get_models()\nprint([model[\"provider\"][\"id\"] for model in models])"
  },
  "inference": {
    "typescript": "import * as byokit from '@byokit/core/catalog';\n\nconst [model] = byokit.getModels({\n  providerIds: [byokit.ProviderId.DeepSeek], limit: 1, local: false,\n});\nif (!model) throw new Error('No matching model');\nconst client = new byokit.Byokit();\nconst completion = await client.chat.completions.create({\n  model,\n  messages: [{ role: byokit.Role.User, content: 'Hello' }],\n}, { apiKey: process.env.DEEPSEEK_API_KEY ?? '' });\nconsole.log(completion.choices[0].message.content);",
    "python": "import os\nimport byokit\n\nmodels = byokit.get_models({\n    \"providerIds\": [byokit.ProviderId.DEEP_SEEK], \"limit\": 1, \"local\": False,\n})\nif not models:\n    raise ValueError(\"No matching model\")\nmodel = models[0]\nclient = byokit.Byokit()\ncompletion = client.chat.completions.create(\n    model=model,\n    messages=[{\"role\": byokit.Role.USER, \"content\": \"Hello\"}],\n    api_key=os.environ[\"DEEPSEEK_API_KEY\"],\n)\nprint(completion[\"choices\"][0][\"message\"][\"content\"])"
  },
  "claude": {
    "typescript": "import * as byokit from '@byokit/core/catalog';\n\nconst [model] = byokit.getModels({\n  providerIds: [byokit.ProviderId.DeepSeek], limit: 1, local: false,\n});\nif (!model) throw new Error('No matching model');\nconst client = new byokit.Byokit();\nconst completion = await client.messages.create({\n  model,\n  messages: [{ role: byokit.Role.User, content: 'Hello' }],\n}, { apiKey: process.env.DEEPSEEK_API_KEY ?? '' });\nconsole.log(completion.content);",
    "python": "import os\nimport byokit\n\nmodels = byokit.get_models({\n    \"providerIds\": [byokit.ProviderId.DEEP_SEEK], \"limit\": 1, \"local\": False,\n})\nif not models:\n    raise ValueError(\"No matching model\")\nmodel = models[0]\nclient = byokit.Byokit()\ncompletion = client.messages.create(\n    model=model,\n    messages=[{\"role\": byokit.Role.USER, \"content\": \"Hello\"}],\n    api_key=os.environ[\"DEEPSEEK_API_KEY\"],\n)\nprint(completion[\"content\"])"
  }
};
