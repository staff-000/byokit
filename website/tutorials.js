export const tutorials={
  "query": {
    "typescript": "import * as byokit from '@byokit/core/catalog';\n\nconst models = byokit.getModels();\nconsole.log(models.map(model => model.provider.id));",
    "python": "import byokit\n\nmodels = byokit.get_models()\nprint([model[\"provider\"][\"id\"] for model in models])"
  },
  "inference": {
    "typescript": "import * as byokit from '@byokit/core/catalog';\n\nconst [model] = byokit.getModels({\n  providerIds: [byokit.ProviderId.DeepSeek],\n});\nconst key = process.env.DEEPSEEK_API_KEY;\nif (!key) throw new Error('Set DEEPSEEK_API_KEY first.');\nconst result = await byokit.call(\n  model, 'Reply with exactly: OK', key,\n);\nconsole.log(result.choices[0].message.content);",
    "python": "import os\nimport byokit\n\nmodel = byokit.get_models({\n    \"providerIds\": [byokit.ProviderId.DEEP_SEEK],\n})[0]\nresult = byokit.call(\n    model, \"Reply with exactly: OK\", os.environ[\"DEEPSEEK_API_KEY\"],\n)\nprint(result[\"choices\"][0][\"message\"][\"content\"])"
  },
  "claude": {
    "typescript": "import * as byokit from '@byokit/core/catalog';\n\nconst [model] = byokit.getModels({\n  providerIds: [byokit.ProviderId.DeepSeek],\n});\nconst key = process.env.DEEPSEEK_API_KEY;\nif (!key) throw new Error('Set DEEPSEEK_API_KEY first.');\nconst result = await byokit.callClaude(\n  model, 'Reply with exactly: OK', key,\n);\nconsole.log(result.content);",
    "python": "import os\nimport byokit\n\nmodel = byokit.get_models({\n    \"providerIds\": [byokit.ProviderId.DEEP_SEEK],\n})[0]\nresult = byokit.call_claude(\n    model, \"Reply with exactly: OK\", os.environ[\"DEEPSEEK_API_KEY\"],\n)\nprint(result[\"content\"])"
  }
};
