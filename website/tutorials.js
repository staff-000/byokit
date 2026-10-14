export const tutorials={
  "query": {
    "typescript": "import * as byokit from '@byokit/core/catalog';\n\nconst models = byokit.getModels();\nconsole.log(models.map(model => model.provider.id));",
    "python": "import byokit\n\nmodels = byokit.get_models()\nprint([model[\"provider\"][\"id\"] for model in models])"
  },
  "inference": {
    "typescript": "import * as byokit from '@byokit/core/catalog';\n\nconst [model] = byokit.getModels({\n  providerIds: [byokit.ProviderId.DeepSeek],\n});\nconst client = byokit.openAI({\n  model, apiKey: () => process.env.DEEPSEEK_API_KEY ?? '',\n});\nconst completion = await client.chat.completions.create({\n  model: model.apiModelId,\n  messages: [{ role: byokit.Role.User, content: 'Hello' }],\n});\nconsole.log(completion.choices[0].message.content);",
    "python": "import os\nimport byokit\n\nmodel = byokit.get_models({\n    \"providerIds\": [byokit.ProviderId.DEEP_SEEK],\n})[0]\nclient = byokit.OpenAI(\n    model=model, api_key=lambda: os.environ[\"DEEPSEEK_API_KEY\"],\n)\ncompletion = client.chat.completions.create(\n    model=model[\"apiModelId\"],\n    messages=[{\"role\": byokit.Role.USER, \"content\": \"Hello\"}],\n)\nprint(completion[\"choices\"][0][\"message\"][\"content\"])"
  },
  "claude": {
    "typescript": "import * as byokit from '@byokit/core/catalog';\n\nconst [model] = byokit.getModels({\n  providerIds: [byokit.ProviderId.DeepSeek],\n});\nconst client = byokit.claude({\n  model, apiKey: () => process.env.DEEPSEEK_API_KEY ?? '',\n});\nconst completion = await client.messages.create({\n  model: model.apiModelId,\n  messages: [{ role: byokit.Role.User, content: 'Hello' }],\n});\nconsole.log(completion.content);",
    "python": "import os\nimport byokit\n\nmodel = byokit.get_models({\n    \"providerIds\": [byokit.ProviderId.DEEP_SEEK],\n})[0]\nclient = byokit.Anthropic(\n    model=model, api_key=lambda: os.environ[\"DEEPSEEK_API_KEY\"],\n)\ncompletion = client.messages.create(\n    model=model[\"apiModelId\"],\n    messages=[{\"role\": byokit.Role.USER, \"content\": \"Hello\"}],\n)\nprint(completion[\"content\"])"
  }
};
