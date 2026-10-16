"""Offline discovery and stateless, explicitly invoked inference."""

from .enums import *
import copy
import math
from datetime import date

FEATURE_STATES = {"supported", "unsupported", "conditional", "unknown"}


def finite(n):
    return (
        isinstance(n, (int, float))
        and not isinstance(n, bool)
        and math.isfinite(n)
        and n >= 0
    )


def positive(n):
    return finite(n) and n > 0


def diagnostic(code, message, severity="warning", offering_id=None):
    return dict(
        code=code,
        message=message,
        severity=severity,
        **({"offeringId": offering_id} if offering_id else {}),
    )


def validate_catalog(data):
    errors = []
    if not isinstance(data, dict) or data.get("schemaVersion") != 1:
        return ["Unsupported schemaVersion"]
    for key in ["providers", "models", "families", "offerings", "presets"]:
        if not isinstance(data.get(key), list):
            errors.append(f"{key} must be an array")
    if errors:
        return errors
    for key in ["providers", "models", "families", "offerings", "presets"]:
        seen = set()
        for item in data[key]:
            item_id = item.get("id")
            if not isinstance(item_id, str) or not item_id or item_id in seen:
                errors.append(f"{key}: invalid or duplicate id")
            seen.add(item_id)
    providers = {p["id"] for p in data["providers"]}
    models = {m["id"] for m in data["models"]}
    for o in data["offerings"]:
        errors.extend(_validate_signals(o))
        support = o.get("callSupport")
        if "callSupport" in o and (
            not isinstance(support, dict)
            or not isinstance(support.get("textGeneration"), bool)
            or "reason" not in support
            or support["reason"] is not None and not isinstance(support["reason"], str)
        ):
            errors.append(f"{o['id']}: invalid callSupport")
        if o.get("releaseDate") is not None:
            try:
                value = o["releaseDate"]
                normalized = date.fromisoformat(value + ("-01" if len(value) == 7 else ""))
                if normalized.isoformat()[:len(value)] != value:
                    raise ValueError()
            except (ValueError, TypeError):
                errors.append(f"{o['id']}: invalid releaseDate")
        if "connection" in o:
            try:
                validate_connection(o["connection"])
            except ValueError:
                errors.append(o["id"] + ": invalid connection")
        if o.get("providerId") not in providers or o.get("modelId") not in models:
            errors.append(f"{o['id']}: unresolved reference")
        if o.get("deployment") not in ["hosted", "local", "self-hosted"]:
            errors.append(f"{o['id']}: invalid deployment")
        for key, value in o.get("limits", {}).items():
            if key != "contextAccounting" and value is not None and not positive(value):
                errors.append(f"{o['id']}: invalid {key}")
        for feature in o.get("features", {}).values():
            if feature.get("status") not in FEATURE_STATES:
                errors.append(f"{o['id']}: invalid feature status")
        for value in o.get("price", {}).values():
            if isinstance(value, (int, float)) and not finite(value):
                errors.append(f"{o['id']}: invalid price")
    for p in data["presets"]:
        if not isinstance(p.get("providerIds"), list) or any(
            i not in providers for i in p["providerIds"]
        ):
            errors.append(f"{p['id']}: unresolved provider")
    for preset in data["presets"]:
        ids = preset.get("offeringIds")
        if ids is not None and (
            not isinstance(ids, list)
            or any(
                not any(
                    o["id"] == offering_id and o["providerId"] in (preset.get("providerIds") or [])
                    for o in data["offerings"]
                )
                for offering_id in ids
            )
        ):
            errors.append(f"{preset['id']}: unresolved recommended offering")
    import re
    recommended = set()
    for r in data.get("recommendations", []):
        if (
            not isinstance(r, dict)
            or not isinstance(r.get("offeringId"), str)
            or r["offeringId"] in recommended
            or not _signal_source(r.get("source"))
            or not isinstance(r.get("reviewedAt"), str)
            or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", r["reviewedAt"])
            or not isinstance(r.get("rationale"), str)
            or not r["rationale"].strip()
        ):
            errors.append("Invalid recommendation evidence")
        if isinstance(r, dict) and isinstance(r.get("offeringId"), str):
            recommended.add(r["offeringId"])
    errors.extend(validate_verifications(data.get("verifications", []), data))
    return errors


def validate_config(config):
    errors = []
    if "sort" in config and config["sort"] not in {v.value for v in ModelSort}:
        errors.append("Unknown model sort")
    if "list" in config and config["list"] not in {v.value for v in ModelList}:
        errors.append("Unknown model list")
    if "local" in config and config["local"] is not False:
        if not isinstance(config["local"], list):
            errors.append("local must be false or an array")
        else:
            for entry in config["local"]:
                try:
                    _validate_local(entry)
                except ValueError as error:
                    errors.append(str(error))
    allowed = {
        "root": [
            "sort",
            "list",
            "local",
            "limit",
            "asOf",
            "unknownPolicy",
            "schemaVersion",
            "catalog",
            "preset",
            "providerIds",
            "filters",
            "prefer",
            "ui",
            "budget",
            "tasks",
        ],
        "filters": [
            "deployment",
            "origin",
            "openWeights",
            "commercialUse",
            "input",
            "output",
            "requiredFeatures",
            "minContextTokens",
            "maxInputPricePerM",
            "maxOutputPricePerM",
            "maxParameters",
            "maxTimeToFirstTokenMs",
            "minTokensPerSecond",
            "fileFormats",
            "includeTags",
            "excludeTags",
            "lifecycle",
            "popularity",
            "includeDeprecated",
            "callable",
            "verified",
            "verifiedBy",
            "verifiedWithinDays",
        ],
        "prefer": ["features", "lowerCost"],
        "ui": ["maxProviders", "maxModelsPerProvider", "allowCustomModel"],
        "budget": ["maxInputTokens", "maxOutputTokens", "overheadTokens"],
    }
    for group, keys in allowed.items():
        for key in config if group == "root" else config.get(group, {}) or {}:
            if key not in keys:
                errors.append(f"Unknown {group}.{key}")
    for key in [
        "deployment",
        "origin",
        "input",
        "output",
        "requiredFeatures",
        "fileFormats",
        "includeTags",
        "excludeTags",
        "lifecycle",
        "popularity",
    ]:
        if key in config.get("filters", {}) and (
            not isinstance(config["filters"][key], list)
            or any(not isinstance(v, str) for v in config["filters"][key])
        ):
            errors.append(f"filters.{key} must be a string array")
    for key in [
        "minContextTokens",
        "maxInputPricePerM",
        "maxOutputPricePerM",
        "maxParameters",
        "maxTimeToFirstTokenMs",
        "minTokensPerSecond",
    ]:
        if key in config.get("filters", {}) and not finite(config["filters"][key]):
            errors.append(f"filters.{key} must be a nonnegative finite number")
    for key in ["maxProviders", "maxModelsPerProvider"]:
        value = config.get("ui", {}).get(key)
        if value is not None and (
            not isinstance(value, int)
            or isinstance(value, bool)
            or not 1 <= value <= 100
        ):
            errors.append(f"ui.{key} must be an integer from 1 to 100")
    import re

    if "limit" in config and (
        not isinstance(config["limit"], int)
        or isinstance(config["limit"], bool)
        or not 1 <= config["limit"] <= 1000
    ):
        errors.append("limit must be an integer from 1 to 1000")
    if "asOf" in config:
        try:
            if not isinstance(config["asOf"], str) or not re.fullmatch(
                r"\d{4}-\d{2}-\d{2}T.*Z", config["asOf"]
            ):
                raise ValueError("UTC timestamp required")
            _timestamp(config["asOf"])
        except (ValueError, TypeError):
            errors.append("asOf must be an ISO timestamp")
    f = config.get("filters", {})
    for key in ["callable", "includeDeprecated"]:
        if key in f and not isinstance(f[key], bool):
            errors.append(f"filters.{key} must be boolean")
    if "verified" in f and not isinstance(f["verified"], bool):
        errors.append("filters.verified must be boolean")
    if "verifiedBy" in f and (
        not isinstance(f["verifiedBy"], str)
        or not re.fullmatch(r"github:[a-z0-9-]+", f["verifiedBy"], re.I)
    ):
        errors.append("verifiedBy must identify a GitHub contributor")
    if "verifiedWithinDays" in f and (
        not finite(f["verifiedWithinDays"]) or f["verifiedWithinDays"] < 1
    ):
        errors.append("verifiedWithinDays must be positive")
    vocab = {
        "input": Modality,
        "output": Modality,
        "requiredFeatures": FeatureName,
        "deployment": Deployment,
        "lifecycle": Lifecycle,
        "popularity": Popularity,
    }
    for key, enum in vocab.items():
        values = f.get(key)
        if isinstance(values, list) and any(
            v not in {m.value for m in enum} for v in values
        ):
            errors.append(f"Unknown filters.{key} value")
    preferred = config.get("prefer", {}).get("features")
    if preferred is not None and (
        not isinstance(preferred, list)
        or any(v not in {m.value for m in FeatureName} for v in preferred)
    ):
        errors.append("Unknown preferred feature")
    if "commercialUse" in f and f["commercialUse"] not in {
        m.value for m in CommercialUse
    }:
        errors.append("Unknown commercialUse value")
    if config.get("unknownPolicy", "exclude") not in ["include", "exclude"]:
        errors.append("Invalid unknownPolicy")
    for key in ["maxInputTokens", "maxOutputTokens", "overheadTokens"]:
        if key in config.get("budget", {}) and not finite(config["budget"][key]):
            errors.append(f"budget.{key} must be a nonnegative finite number")
    return errors


def matches(o, m, config, provider_tags=None):
    f = config.get("filters", {})
    unknown = config.get("unknownPolicy") == "include"
    if "deployment" in f and o["deployment"] not in f["deployment"]:
        return False
    if "origin" in f and m.get("origin") not in f["origin"]:
        return False
    if "openWeights" in f:
        value = m.get("openWeights")
        if (value is None and not unknown) or (
            value is not None and value != f["openWeights"]
        ):
            return False
    if "commercialUse" in f:
        value = m.get("commercialUse", "unknown")
        if (value == "unknown" and not unknown) or (
            value != "unknown" and value != f["commercialUse"]
        ):
            return False
    for direction in ["input", "output"]:
        required = f.get(direction, [])
        values = o.get("modalities", {}).get(direction)
        if required and (
            (values is None and not unknown)
            or (values is not None and not all(v in values for v in required))
        ):
            return False
    if f.get("fileFormats") and (
        (o.get("fileFormats") is None and not unknown)
        or (
            o.get("fileFormats") is not None
            and not all(v in o["fileFormats"] for v in f["fileFormats"])
        )
    ):
        return False
    for feature in f.get("requiredFeatures", []):
        state = o.get("features", {}).get(feature, {}).get("status", "unknown")
        if state != "supported" and not (state == "unknown" and unknown):
            return False
    constraints = [
        ("minContextTokens", o.get("limits", {}).get("context"), "min"),
        ("maxInputPricePerM", o.get("price", {}).get("input"), "max"),
        ("maxOutputPricePerM", o.get("price", {}).get("output"), "max"),
        ("maxParameters", m.get("size", {}).get("totalParameters"), "max"),
        ("maxTimeToFirstTokenMs", o.get("speed", {}).get("timeToFirstTokenMs"), "max"),
        ("minTokensPerSecond", o.get("speed", {}).get("tokensPerSecond"), "min"),
    ]
    for key, value, op in constraints:
        if key in f and (
            (not finite(value) and not unknown)
            or (finite(value) and (value < f[key] if op == "min" else value > f[key]))
        ):
            return False
    support = o.get("callSupport") or call_support_for(o)
    if "callable" in f and support["textGeneration"] != f["callable"]:
        return False
    include_retired = f.get("includeDeprecated") is True or (
        config.get("list") == ModelList.COMPLETE and f.get("includeDeprecated") is not False
    )
    lifecycle = f.get(
        "lifecycle",
        list(Lifecycle) if include_retired else [Lifecycle.LIVE, Lifecycle.UNCERTAIN],
    )
    if o["lifecycle"]["status"] not in lifecycle:
        return False
    if "popularity" in f and o["popularity"]["status"] not in f["popularity"]:
        return False
    tags = set(
        [
            t
            for t in m.get("tags", []) + (provider_tags or [])
            if not t.startswith(("lifecycle:", "popularity:"))
        ]
        + o.get("tags", [])
    )
    if any(t not in tags for t in f.get("includeTags", [])) or any(
        t in tags for t in f.get("excludeTags", [])
    ):
        return False
    return True


class Catalog:
    def __init__(self, data):
        errors = validate_catalog(data)
        if errors:
            raise ValueError("; ".join(errors))
        self.data = copy.deepcopy(data)
        self.providers = {p["id"]: p for p in self.data["providers"]}
        self.models = {m["id"]: m for m in self.data["models"]}
        self.offerings = {o["id"]: o for o in self.data["offerings"]}

    def get(self, offering_id):
        return self.offerings.get(offering_id)

    def get_models(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
    ) -> list[dict]:
        config = _normalize_query(config, options)
        groups = self._select(config, True)
        result = []
        for g in groups:
            for o in g["offerings"]:
                model = self.models.get(
                    o["modelId"],
                    {
                        "id": o["modelId"],
                        "name": o["name"],
                        "openWeights": None,
                        "commercialUse": "unknown",
                        "license": None,
                        "tags": [],
                    },
                )
                family = next(
                    (
                        f
                        for f in self.data["families"]
                        if f["id"] == model.get("familyId")
                    ),
                    None,
                )
                assets = self.data.get("assets", [])
                result.append(
                    dict(
                        o,
                        connection=connection_for(o),
                        callSupport=o.get("callSupport", call_support_for(o)),
                        provider=g["provider"],
                        model=model,
                        family=family,
                        logos={
                            "provider": next(
                                (
                                    a
                                    for a in assets
                                    if a["id"] == g["provider"].get("logoId")
                                ),
                                None,
                            ),
                            "family": next(
                                (
                                    a
                                    for a in assets
                                    if family and a["id"] == family.get("logoId")
                                ),
                                None,
                            ),
                        },
                        verification=verification_summary(
                            self.data,
                            o["id"],
                            as_of=config.get("asOf"),
                            max_age_days=config.get("filters", {}).get(
                                "verifiedWithinDays", 90
                            ),
                            contributor=config.get("filters", {}).get("verifiedBy"),
                        ),
                    )
                )
        hosted = [o for o in result if o["deployment"] != "local"]
        sort = config.get("sort", ModelSort.ALPHABETICAL_ASCEND)
        sort = {
            "alphabetical": ModelSort.ALPHABETICAL_ASCEND,
            "price": ModelSort.PRICE_ASCEND,
            "speed": ModelSort.SPEED_DESCEND,
        }.get(sort, sort)
        if sort != ModelSort.PROVIDER_ORDER:
            from functools import cmp_to_key

            def ordering(a, b):
                def compare(x, y):
                    return (x > y) - (x < y)

                result = 0
                if sort in [
                    ModelSort.PRICE_ASCEND,
                    ModelSort.PRICE_DESCEND,
                    ModelSort.SPEED_ASCEND,
                    ModelSort.SPEED_DESCEND,
                ]:
                    price = sort in [ModelSort.PRICE_ASCEND, ModelSort.PRICE_DESCEND]

                    def value(o):
                        return (
                            o.get("price", {}).get("input")
                            if o.get("price", {}).get("currency") == "USD"
                            else None
                        )

                    x = (
                        value(a)
                        if price
                        else (a.get("speed") or {}).get("tokensPerSecond")
                    )
                    y = (
                        value(b)
                        if price
                        else (b.get("speed") or {}).get("tokensPerSecond")
                    )
                    if x is None or y is None:
                        result = -1 if x is not None else 1 if y is not None else 0
                    else:
                        result = compare(x, y) * (
                            1
                            if sort in [ModelSort.PRICE_ASCEND, ModelSort.SPEED_ASCEND]
                            else -1
                        )
                return (
                    result
                    or compare(a["name"].lower(), b["name"].lower())
                    * (-1 if sort == ModelSort.ALPHABETICAL_DESCEND else 1)
                    or compare(a["providerId"], b["providerId"])
                    or compare(a["id"], b["id"])
                )

            hosted.sort(key=cmp_to_key(ordering))
        return copy.deepcopy(
            hosted[: config.get("limit", len(result))]
            + [o for o in result if o["deployment"] == "local"]
        )

    def select(self, config=None, options=None):
        return self._select(_normalize_query(config, options))

    def _select(self, config=None, uncapped=False):
        config = config or {}
        errors = validate_config(config)
        if errors:
            raise ValueError("; ".join(errors))
        preset = next(
            (
                p
                for p in self.data["presets"]
                if p["id"]
                == config.get(
                    "preset",
                    "default" if config.get("list") == ModelList.DEFAULT else "global",
                )
            ),
            None,
        )
        if not preset and config.get("list") == ModelList.DEFAULT:
            preset = next(
                (p for p in self.data["presets"] if p["id"] == "global"), None
            )
        if not preset:
            raise ValueError("Unknown preset")
        ids = config.get(
            "providerIds",
            list(self.providers)
            if config.get("list") == ModelList.COMPLETE
            else preset["providerIds"],
        )
        if any(i not in self.providers for i in ids):
            raise ValueError("Unknown provider in providerIds")
        groups = []
        recommended = (
            set(preset["offeringIds"])
            if config.get("list") == ModelList.DEFAULT and "offeringIds" in preset
            else None
        )

        def order(o):
            count = sum(
                o.get("features", {}).get(f, {}).get("status") == "supported"
                for f in config.get("prefer", {}).get("features", [])
            )
            price = o.get("price", {}).get("input")
            return (
                -int(o["lifecycle"]["status"] == Lifecycle.LIVE),
                -count,
                (price if price is not None else math.inf)
                if config.get("prefer", {}).get("lowerCost")
                else 0,
                o.get("rank", 100),
                o["id"],
            )

        for provider_id in ids:
            if self.providers[provider_id]["deployment"] == "local":
                continue
            choices = sorted(
                (
                    o
                    for o in (
                        _with_signals(item, config.get("asOf"))
                        for item in self.data["offerings"]
                        if item["providerId"] == provider_id and (recommended is None or item["id"] in recommended)
                    )
                    if matches(
                        o,
                        self.models[o["modelId"]],
                        config,
                        self.providers[provider_id].get("tags", []),
                    )
                    and matches_verification(self.data, o["id"], config)
                ),
                key=order,
            )
            cap = (
                (
                    len(choices)
                    if config.get("list") == ModelList.COMPLETE
                    or "providerIds" in config
                    or recommended is not None
                    else config.get("ui", {}).get("maxModelsPerProvider", 1)
                )
                if uncapped
                else config.get("ui", {}).get("maxModelsPerProvider", 4)
            )
            if choices:
                groups.append(
                    {
                        "provider": self.providers[provider_id],
                        "offerings": choices[:cap],
                    }
                )
        locals_ = _local_groups(config, self)
        return (
            groups
            if uncapped
            else groups[
                : max(0, config.get("ui", {}).get("maxProviders", 8) - len(locals_))
            ]
        ) + locals_


def check_fit(offering, budget, options=None):
    options = options or {}
    if not offering:
        return {
            "status": "unknown",
            "certainty": "unknown",
            "diagnostics": [
                diagnostic(
                    "MODEL_UNVERIFIED",
                    "Custom model limits and capabilities are unverified.",
                )
            ],
        }
    for key in ["inputTokens", "outputTokens", "overheadTokens"]:
        if key in budget and budget[key] is not None and not finite(budget[key]):
            raise ValueError(f"Invalid {key}")
    input_tokens = (budget.get("inputTokens") or 0) + (
        budget.get("overheadTokens") or 0
    )
    output = budget.get("outputTokens") or 0
    limits = offering.get("limits", {})
    diagnostics = []
    oid = offering["id"]
    for f in options.get("requiredFeatures", []):
        state = offering.get("features", {}).get(f, {}).get("status", "unknown")
        if state != "supported":
            diagnostics.append(
                diagnostic(
                    "CAPABILITY_UNSUPPORTED"
                    if state == "unsupported"
                    else "CAPABILITY_UNVERIFIED",
                    f"{f}: {state}",
                    "error" if state == "unsupported" else "warning",
                    oid,
                )
            )
    for direction in ["input", "output"]:
        for modality in options.get("modalities", {}).get(direction, []):
            values = offering.get("modalities", {}).get(direction)
            if values is None or modality not in values:
                diagnostics.append(
                    diagnostic(
                        "MODALITY_UNVERIFIED"
                        if values is None
                        else "MODALITY_UNSUPPORTED",
                        f"{direction} modality {modality} is {'unverified' if values is None else 'unsupported'}.",
                        "warning" if values is None else "error",
                        oid,
                    )
                )
    if positive(limits.get("input")) and input_tokens > limits["input"]:
        diagnostics.append(
            diagnostic(
                "INPUT_BUDGET_EXCEEDED",
                f"Input {input_tokens} exceeds {limits['input']}.",
                "error",
                oid,
            )
        )
    if positive(limits.get("output")) and output > limits["output"]:
        diagnostics.append(
            diagnostic(
                "OUTPUT_BUDGET_EXCEEDED",
                f"Output {output} exceeds {limits['output']}.",
                "error",
                oid,
            )
        )
    used = (
        input_tokens + output
        if limits.get("contextAccounting") == "combined"
        else input_tokens
    )
    ratio = None
    if positive(limits.get("context")) and limits.get("contextAccounting") in [
        "combined",
        "input-only",
    ]:
        ratio = used / limits["context"]
        if ratio > 1:
            diagnostics.append(
                diagnostic(
                    "CONTEXT_BUDGET_EXCEEDED",
                    f"Required {used} exceeds context {limits['context']}.",
                    "error",
                    oid,
                )
            )
        elif ratio >= 0.8:
            diagnostics.append(
                diagnostic(
                    "CONTEXT_NEAR_LIMIT",
                    f"Context budget uses {math.floor(ratio * 100 + 0.5)}%.",
                    "warning",
                    oid,
                )
            )
    else:
        if positive(limits.get("context")) and input_tokens > limits["context"]:
            diagnostics.append(
                diagnostic(
                    "CONTEXT_BUDGET_EXCEEDED",
                    f"Input {input_tokens} exceeds context {limits['context']}.",
                    "error",
                    oid,
                )
            )
        diagnostics.append(
            diagnostic(
                "LOCAL_CONTEXT_UNKNOWN"
                if offering.get("deployment") == "local"
                else "CONTEXT_UNVERIFIED",
                "Effective context or its accounting rules are unknown.",
                offering_id=oid,
            )
        )
    if output > 0 and not positive(limits.get("output")):
        diagnostics.append(
            diagnostic(
                "OUTPUT_LIMIT_UNKNOWN", "Output limit is unknown.", offering_id=oid
            )
        )
    if options.get("estimate"):
        diagnostics.append(
            diagnostic(
                "TOKEN_ESTIMATE",
                "Token count is estimated; this is not an exact fit guarantee.",
                offering_id=oid,
            )
        )
    if offering.get("status") == "deprecated":
        diagnostics.append(
            diagnostic(
                "MODEL_DEPRECATED", "Selected model is deprecated.", offering_id=oid
            )
        )
    unknown_codes = {
        "CONTEXT_UNVERIFIED",
        "LOCAL_CONTEXT_UNKNOWN",
        "OUTPUT_LIMIT_UNKNOWN",
        "CAPABILITY_UNVERIFIED",
        "MODALITY_UNVERIFIED",
        "TOKEN_ESTIMATE",
    }
    status = (
        "exceeds"
        if any(d["severity"] == "error" for d in diagnostics)
        else "unknown"
        if any(d["code"] in unknown_codes for d in diagnostics)
        else "fits"
    )
    return dict(
        status=status,
        certainty="estimated"
        if options.get("estimate")
        else options.get("certainty", "declared"),
        inputTokens=input_tokens,
        outputTokens=output,
        diagnostics=diagnostics,
        **({"ratio": ratio} if ratio is not None else {}),
    )


def check_task(catalog, task):
    if not task.get("offeringIds"):
        return [
            diagnostic("NO_MODELS", "Task requires at least one offering.", "error")
        ]
    result = []
    b = task.get("budget", {})
    r = task.get("requires", {})
    if b.get("maxInputTokens") is None or b.get("maxOutputTokens") is None:
        result.append(
            diagnostic(
                "BUDGET_UNDECLARED",
                "Declare input and output token budgets for build-time checks.",
            )
        )
    for oid in task["offeringIds"]:
        fit = check_fit(
            catalog.get(oid),
            {
                "inputTokens": b.get("maxInputTokens"),
                "outputTokens": b.get("maxOutputTokens"),
                "overheadTokens": b.get("overheadTokens"),
            },
            {
                "requiredFeatures": r.get("features", []),
                "modalities": r.get("modalities", {}),
            },
        )
        result.extend(dict(d, offeringId=oid) for d in fit["diagnostics"])
    return result


def estimate_price(offering, budget):
    i = budget["inputTokens"]
    o = budget["outputTokens"]
    if not finite(i) or not finite(o):
        raise ValueError("Invalid token counts")
    p = offering.get("price", {})
    if (
        p.get("currency") != "USD"
        or not finite(p.get("input"))
        or not finite(p.get("output"))
        or p.get("tiers")
    ):
        return {"status": "unknown"}
    return {
        "status": "estimated",
        "currency": "USD",
        "amount": (i * p["input"] + o * p["output"]) / 1e6,
        "excludes": [
            "cache pricing",
            "additional reasoning charges",
            "tax",
            "tier changes",
        ],
    }


def load_catalog():
    """Load the packaged offline snapshot. No network or Node dependency."""
    import json
    from importlib.resources import files

    return Catalog(
        json.loads(files("byokit").joinpath("data/catalog.json").read_text())
    )


def derive_tags(offering, model=None):
    model = model or {}
    prefixes = (
        "cap:",
        "input:",
        "output:",
        "price:",
        "context:",
        "weights:",
        "origin:",
        "deployment:",
        "lifecycle:",
        "popularity:",
    )
    tags = [t for t in offering.get("tags", []) if not t.startswith(prefixes)]
    tags.extend(
        "cap:" + name
        for name, f in offering.get("features", {}).items()
        if f.get("status") == "supported"
    )
    for direction in ["input", "output"]:
        tags.extend(
            direction + ":" + m
            for m in offering.get("modalities", {}).get(direction, []) or []
        )
    if model.get("openWeights") is True:
        tags.append("weights:open")
    if model.get("origin"):
        tags.append("origin:" + model["origin"])
    tags.append("deployment:" + offering["deployment"])
    ctx = offering.get("limits", {}).get("context")
    if positive(ctx):
        tags.append(
            "context:"
            + (
                "1m+"
                if ctx >= 1000000
                else "128k+"
                if ctx >= 128000
                else "32k+"
                if ctx >= 32000
                else "under-32k"
            )
        )
    p = offering.get("price", {})
    if (
        p.get("currency") == "USD"
        and finite(p.get("input"))
        and finite(p.get("output"))
        and not p.get("tiers")
    ):
        cost = (p["input"] + p["output"]) / 1000
        tags.append(
            "price:"
            + (
                "zero-token-rate"
                if cost == 0
                else "budget"
                if cost <= 0.002
                else "mid"
                if cost <= 0.02
                else "premium"
            )
        )
    return sorted(set(tags))


async def preflight(
    offering,
    messages,
    *,
    count_tokens=None,
    output_tokens=0,
    overhead_tokens=0,
    options=None,
):
    if count_tokens is None:
        return {
            "status": "unknown",
            "certainty": "unknown",
            "diagnostics": [
                diagnostic(
                    "TOKEN_COUNT_UNKNOWN",
                    "Supply a provider-aware token counter for actual requests.",
                )
            ],
        }
    import inspect

    count = count_tokens(messages, offering)
    if inspect.isawaitable(count):
        count = await count
    return check_fit(
        offering,
        {
            "inputTokens": count["tokens"],
            "outputTokens": output_tokens,
            "overheadTokens": overhead_tokens,
        },
        {
            **(options or {}),
            "estimate": count.get("certainty") != "measured",
            "certainty": count.get("certainty", "estimated"),
        },
    )


def _timestamp(value):
    from datetime import datetime

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timezone required")
    return parsed.timestamp()


def validate_verifications(records, data):
    import re
    from urllib.parse import urlparse

    if not isinstance(records, list):
        return ["verifications must be an array"]
    errors = []
    ids = set()
    offerings = {o["id"] for o in data["offerings"]}
    for r in records:
        if not isinstance(r, dict):
            errors.append("Invalid verification record")
            continue
        if not isinstance(r.get("id"), str) or not r["id"] or r["id"] in ids:
            errors.append("Invalid or duplicate verification ID")
        ids.add(r.get("id"))
        if r.get("offeringId") not in offerings:
            errors.append("Verification target is missing")
        if not isinstance(r.get("contributor"), str) or not re.fullmatch(
            r"github:[a-z0-9-]+", r["contributor"], re.I
        ):
            errors.append("Invalid verification contributor")
        try:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T.*Z", r.get("checkedAt", "")):
                raise ValueError("Invalid date")
            _timestamp(r["checkedAt"])
        except (ValueError, TypeError):
            errors.append("Invalid verification timestamp")
        if r.get("result") not in ["passed", "failed"]:
            errors.append("Invalid verification result")
        if (
            not isinstance(r.get("checks"), list)
            or not r["checks"]
            or any(c not in {m.value for m in VerificationCheck} for c in r["checks"])
        ):
            errors.append("Verification must name its checks")
        try:
            u = urlparse(r.get("evidence", ""))
            if u.scheme != "https" or not u.hostname or u.username or u.password:
                raise ValueError("Invalid URL")
        except (ValueError, TypeError):
            errors.append("Verification evidence is required")
        if not isinstance(r.get("adapter"), str) or not r["adapter"]:
            errors.append("Verification adapter and version are required")
        if set(r) - {
            "id",
            "offeringId",
            "contributor",
            "checkedAt",
            "result",
            "checks",
            "evidence",
            "adapter",
            "notes",
        }:
            errors.append(
                "Unknown verification field; do not record keys or request payloads"
            )
    return errors


def verification_summary(
    data, offering_id, *, as_of=None, max_age_days=90, contributor=None
):
    from datetime import datetime, timezone

    now = _timestamp(as_of) if as_of else datetime.now(timezone.utc).timestamp()
    records = [
        r
        for r in data.get("verifications", [])
        if r["offeringId"] == offering_id
        and (not contributor or r["contributor"].lower() == contributor.lower())
    ]
    calls = sorted(
        (
            r
            for r in records
            if "textGeneration" in r["checks"] and _timestamp(r["checkedAt"]) <= now
        ),
        key=lambda r: (
            -_timestamp(r["checkedAt"]),
            0 if r["result"] == "failed" else 1,
            r["id"],
        ),
    )
    latest = calls[0] if calls else None
    status = (
        "unverified"
        if latest is None
        else "stale"
        if now - _timestamp(latest["checkedAt"]) > max_age_days * 86400
        else latest["result"]
    )
    return {"status": status, "latest": latest, "records": records}


def matches_verification(data, oid, config):
    f = config.get("filters", {})
    if not any(k in f for k in ["verified", "verifiedBy", "verifiedWithinDays"]):
        return True
    status = verification_summary(
        data,
        oid,
        as_of=config.get("asOf"),
        max_age_days=f.get("verifiedWithinDays", 90),
        contributor=f.get("verifiedBy"),
    )["status"]
    return status != "passed" if f.get("verified") is False else status == "passed"


def get_models(
    config: "PickerConfig | ModelList | None" = None,
    options: "PickerConfig | None" = None,
) -> list[dict]:
    return load_catalog().get_models(config, options)


from .types import (
    PickerConfig,
    ContributorId,
    CustomTag,
    CustomProviderId,
    CustomCountryCode,
    CustomFileFormat,
)


def github_contributor(handle: str) -> ContributorId:
    import re

    if not re.fullmatch(r"[a-z0-9-]{1,39}", handle, re.I):
        raise ValueError("Invalid GitHub handle")
    return ContributorId("github:" + handle)


def custom_tag(value: str) -> CustomTag:
    import re

    if not re.fullmatch(r"[a-z][a-z0-9_-]*:[^\s]+", value):
        raise ValueError("Use a namespaced tag")
    return CustomTag(value)


def custom_provider_id(value: str) -> CustomProviderId:
    import re

    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", value):
        raise ValueError("Invalid custom provider ID")
    return CustomProviderId(value)


def custom_country_code(value: str) -> CustomCountryCode:
    import re

    if not re.fullmatch(r"[a-z]{2}", value):
        raise ValueError("Use a two-letter country code")
    return CustomCountryCode(value)


def custom_file_format(value: str) -> CustomFileFormat:
    import re

    if not re.fullmatch(r"[a-z0-9][a-z0-9.+-]{0,63}", value):
        raise ValueError("Invalid custom file format")
    return CustomFileFormat(value)


def _signal_date(value):
    import re

    try:
        return (
            isinstance(value, str)
            and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T.*Z", value))
            and math.isfinite(_timestamp(value))
        )
    except (ValueError, TypeError):
        return False


def _signal_source(v):
    from urllib.parse import urlparse

    try:
        return (
            isinstance(v, str)
            and urlparse(v).scheme == "https"
            and bool(urlparse(v).netloc)
        )
    except ValueError:
        return False


def _validate_signals(o):
    errors = []

    def record(v, keys):
        return isinstance(v, dict) and set(v) <= set(keys)

    l = o.get("lifecycleEvidence")
    p = o.get("popularityEvidence")
    if "lifecycleEvidence" in o and (
        not record(l, ["status", "source", "checkedAt", "basis"])
        or l.get("status") not in {v.value for v in Lifecycle}
        or ("basis" in l and l["basis"] not in {v.value for v in LifecycleBasis})
        or not _signal_source(l.get("source"))
        or not _signal_date(l.get("checkedAt"))
    ):
        errors.append(o["id"] + ": invalid lifecycle evidence")
    if "popularityEvidence" in o and (
        not record(
            p,
            [
                "metric",
                "rank",
                "population",
                "scope",
                "source",
                "windowStart",
                "windowEnd",
            ],
        )
        or p.get("metric") not in {v.value for v in PopularityMetric}
        or type(p.get("rank")) is not int
        or p["rank"] < 1
        or type(p.get("population")) is not int
        or p["population"] < p["rank"]
        or not isinstance(p.get("scope"), str)
        or not p["scope"].strip()
        or not _signal_source(p.get("source"))
        or not _signal_date(p.get("windowStart"))
        or not _signal_date(p.get("windowEnd"))
        or _timestamp(p["windowStart"]) >= _timestamp(p["windowEnd"])
    ):
        errors.append(o["id"] + ": invalid popularity evidence")
    return errors


def _with_signals(o, as_of=None):
    import time

    now = _timestamp(as_of) if as_of else time.time()

    def fresh(date, days):
        return _signal_date(date) and 0 <= now - _timestamp(date) <= days * 86400

    l = o.get("lifecycleEvidence")
    p = o.get("popularityEvidence")
    lifecycle = {
        "status": (
            "OUTDATED"
            if o.get("status") == "deprecated" or l and l["status"] == "OUTDATED"
            else l["status"]
            if l and fresh(l["checkedAt"], 90) and l.get("basis") == "provider"
            else "UNCERTAIN"
        ),
        "evidence": l,
    }
    popularity = {
        "status": (
            "POPULAR"
            if p["rank"] <= math.ceil(p["population"] * 0.1)
            else "NOT_POPULAR"
        )
        if p and fresh(p["windowEnd"], 30)
        else "UNCERTAIN",
        "evidence": p,
    }
    tags = [
        t for t in o.get("tags", []) if not t.startswith(("lifecycle:", "popularity:"))
    ]
    return dict(
        o,
        lifecycle=lifecycle,
        popularity=popularity,
        tags=tags
        + ["lifecycle:" + lifecycle["status"], "popularity:" + popularity["status"]],
    )


def _normalize_query(input=None, options=None):
    if isinstance(input, str):
        if input not in {v.value for v in ModelList}:
            raise ValueError("Unknown model list")
        config = dict(options or {}, list=input)
    else:
        if input is not None and not isinstance(input, dict) or options is not None:
            raise ValueError("Use get_models(options) or get_models(list, options)")
        config = dict(input or {})
    if not any(k in config for k in ["list", "preset", "providerIds"]):
        config["list"] = ModelList.DEFAULT
    if config.get("list") == ModelList.CHINA:
        config["preset"] = "china"
    if config.get("list") == ModelList.GLOBAL:
        config["preset"] = "global"
    return config


def _validate_local(entry):
    from urllib.parse import urlparse

    if not isinstance(entry, dict) or set(entry) - {
        "endpoint",
        "api",
        "modelId",
        "name",
    }:
        raise ValueError("Invalid local entry")
    try:
        url = urlparse(entry.get("endpoint", ""))
        if (
            not isinstance(entry.get("endpoint"), str)
            or url.scheme not in ["http", "https"]
            or not url.netloc
            or url.username
            or url.password
            or url.query
            or url.fragment
        ):
            raise ValueError(
                "Use a local HTTP(S) URL without credentials, query, or fragment"
            )
    except (ValueError, TypeError):
        raise ValueError("Local entry needs an HTTP(S) endpoint")
    if "api" in entry and entry["api"] not in {v.value for v in LocalApi}:
        raise ValueError("Unknown local API")
    for key in ["modelId", "name"]:
        if key in entry and (not isinstance(entry[key], str) or not entry[key].strip()):
            raise ValueError("Invalid local " + key)


def _local_groups(config, catalog):
    if (
        config.get("filters", {}).get("input")
        or config.get("filters", {}).get("output")
        or "callable" in config.get("filters", {})
        or config.get("local") is False
        or "deployment" in config.get("filters", {})
        and "local" not in config["filters"]["deployment"]
    ):
        return []
    preset = next(
        (p for p in catalog.data["presets"] if p["id"] == config.get("preset")), None
    )
    ids = config.get("providerIds", preset["providerIds"] if preset else None)
    if (
        "local" not in config
        and ids is not None
        and not any(catalog.providers[id]["deployment"] == "local" for id in ids)
    ):
        return []
    entries = config.get("local", [{}])
    if not entries:
        return []
    provider = dict(
        catalog.providers.get(
            "local",
            {"id": "local", "auth": "optional", "deployment": "local", "tags": []},
        ),
        name="Local",
    )
    offerings = []
    for i, entry in enumerate(entries):
        offerings.append(
            {
                "id": "local/custom"
                if len(entries) == 1
                else "local/endpoint-" + str(i),
                "providerId": "local",
                "modelId": entry.get("modelId", "local/custom"),
                "apiModelId": entry.get("modelId", ""),
                "name": entry.get(
                    "name", entry.get("modelId", "Local — enter your server URL")
                ),
                "deployment": "local",
                "local": {
                    "endpoint": entry.get("endpoint", ""),
                    "api": entry.get("api", "openai-compatible"),
                    "configured": bool(entry.get("endpoint")),
                },
                "modalities": {"input": None, "output": None},
                "limits": {
                    "context": None,
                    "input": None,
                    "output": None,
                    "contextAccounting": "unknown",
                },
                "features": {},
                "price": {"currency": "USD", "input": None, "output": None},
                "tags": ["deployment:local"],
                "lifecycle": {"status": "UNCERTAIN", "evidence": None},
                "popularity": {"status": "UNCERTAIN", "evidence": None},
            }
        )
    return [{"provider": provider, "offerings": offerings}]


from .inference import call, call_claude, prepare_call, connection_for, call_support_for, CallError

from .sdk import Byokit, OpenAI, Anthropic, openAI, claude

from .custom_model import append_model, validate_connection
