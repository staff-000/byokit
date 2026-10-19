"""Explicit application-owned custom offerings; no discovery or credential state."""

import copy, math
from urllib.parse import urlparse
from .enums import ApiProtocol, Deployment, ContextAccounting
from .types import CustomModel


def validate_connection(connection):
    if (
        not isinstance(connection, dict)
        or set(connection) - {"baseUrl", "protocol"}
        or connection.get("protocol") not in {v.value for v in ApiProtocol}
    ):
        raise ValueError("Invalid model connection")
    try:
        url = urlparse(connection.get("baseUrl", ""))
        if (
            url.scheme not in ["http", "https"]
            or not url.netloc
            or url.username
            or url.password
            or url.query
            or url.fragment
        ):
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("Invalid model endpoint")


def append_model(models: list[dict], custom: CustomModel) -> list[dict]:
    if (
        not isinstance(models, list)
        or not isinstance(custom, dict)
        or set(custom)
        - {
            "providerId",
            "providerName",
            "modelId",
            "name",
            "baseUrl",
            "protocol",
            "deployment",
            "limits",
        }
    ):
        raise ValueError("Invalid custom model fields")
    for key in ["providerId", "modelId"]:
        if not isinstance(custom.get(key), str) or not custom[key].strip():
            raise ValueError("Custom provider and model IDs are required")
    for key in ["providerName", "name"]:
        if key in custom and (
            not isinstance(custom[key], str) or not custom[key].strip()
        ):
            raise ValueError("Invalid custom model name")
    connection = {"baseUrl": custom.get("baseUrl"), "protocol": custom.get("protocol")}
    validate_connection(connection)
    deployment = custom.get("deployment", "hosted")
    if deployment not in {v.value for v in Deployment}:
        raise ValueError("Unknown deployment")
    if "limits" in custom and not isinstance(custom["limits"], dict):
        raise ValueError("Invalid custom model limits")
    limits = {
        "context": None,
        "input": None,
        "output": None,
        "contextAccounting": "unknown",
        **custom.get("limits", {}),
    }
    if (
        set(limits) - {"context", "input", "output", "contextAccounting"}
        or limits["contextAccounting"] not in {v.value for v in ContextAccounting}
        or any(
            limits[k] is not None
            and (
                type(limits[k]) not in [int, float]
                or not math.isfinite(limits[k])
                or limits[k] <= 0
            )
            for k in ["context", "input", "output"]
        )
    ):
        raise ValueError("Invalid custom model limits")
    identity = custom["providerId"] + "/" + custom["modelId"]
    if any(m["id"] == identity for m in models):
        raise ValueError("Duplicate model offering")
    name = custom.get("name", custom["modelId"])
    model = {
        "id": identity,
        "providerId": custom["providerId"],
        "modelId": identity,
        "apiModelId": custom["modelId"],
        "name": name,
        "deployment": deployment,
        "connection": connection,
        "callSupport": {"textGeneration": True, "reason": None},
        "speciality": "unknown",
        "tier": "unknown",
        "limits": limits,
        "modalities": {"input": None, "output": None},
        "features": {},
        "price": {"currency": "USD", "input": None, "output": None},
        "tags": [],
        "provider": {
            "id": custom["providerId"],
            "name": custom.get("providerName", custom["providerId"]),
            "deployment": deployment,
            "auth": "optional",
            "tags": [],
        },
        "model": {
            "id": identity,
            "name": name,
            "openWeights": None,
            "commercialUse": "unknown",
            "license": None,
            "speciality": "unknown",
            "tier": "unknown",
            "tags": [],
        },
        "family": None,
        "logos": {"provider": None, "family": None},
        "lifecycle": {"status": "UNCERTAIN", "evidence": None},
        "popularity": {"status": "UNCERTAIN", "evidence": None},
        "verification": {"status": "unverified", "latest": None, "records": []},
    }
    return copy.deepcopy(models + [model])
