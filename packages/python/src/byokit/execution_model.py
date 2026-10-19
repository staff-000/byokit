"""Official execution projection, without catalog evidence or credentials."""

import copy


def compact_models(models: list[dict]) -> list[dict]:
    if not isinstance(models, list):
        raise ValueError("Provide a list of model offerings.")
    fields = [
        "id", "providerId", "modelId", "apiModelId", "name", "deployment", "connection",
        "callSupport", "limits", "modalities", "local", "status", "providerShape",
        "requiresProviderOverride", "speciality", "tier",
    ]
    result = []
    for model in models:
        if not isinstance(model, dict) or not isinstance(model.get("apiModelId"), str):
            raise ValueError("Provide model offerings with API model IDs.")
        compact = {k: model[k] for k in fields if k in model}
        compact["features"] = {k: {"status": v["status"]} for k, v in (model.get("features") or {}).items()}
        if model.get("provider"):
            compact["provider"] = {k: model["provider"][k] for k in ["id", "name", "auth", "deployment"] if k in model["provider"]}
        result.append(copy.deepcopy(compact))
    return result
