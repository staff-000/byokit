"""Offline discovery and stateless, explicitly invoked inference."""

from .enums import *
from .types import FilterMatcher
from typing import Any as TypingAny
import builtins as _builtins
_any = _builtins.any
import copy
import functools
import math
import re
import time
from datetime import date, datetime, timezone

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


def _normalize_values_list(values):
    if values is None:
        return []
    if isinstance(values, (list, tuple, set)):
        return [v.value if hasattr(v, "value") else str(v) for v in values]
    return [values.value if hasattr(values, "value") else str(values)]


def _normalize_args(args):
    if len(args) == 1 and isinstance(args[0], (list, tuple, set)):
        return [
            v if isinstance(v, dict) else (v.value if hasattr(v, "value") else str(v))
            for v in args[0]
        ]
    return [
        v if isinstance(v, dict) else (v.value if hasattr(v, "value") else str(v))
        for v in args
    ]


def exact(*args) -> FilterMatcher[TypingAny]:
    return {"mode": "exact", "values": _normalize_args(args)}


def contain(*args) -> FilterMatcher[TypingAny]:
    return {"mode": "contain", "values": _normalize_args(args)}


contains = contain


def any(*args) -> FilterMatcher[TypingAny]:
    return {"mode": "any", "values": _normalize_args(args)}


def exclude(*args) -> FilterMatcher[TypingAny]:
    return {"mode": "exclude", "values": _normalize_args(args)}


def and_(*args) -> FilterMatcher[TypingAny]:
    return {"op": "and", "values": _normalize_args(args)}


def or_(*args) -> FilterMatcher[TypingAny]:
    return {"op": "or", "values": _normalize_args(args)}


def xor(*args) -> FilterMatcher[TypingAny]:
    return {"op": "xor", "values": _normalize_args(args)}


def not_(*args) -> FilterMatcher[TypingAny]:
    return {"op": "not", "values": _normalize_args(args)}


Exact = exact
Contain = contain
Contains = contains
Any = ANY = any_ = any
Exclude = exclude
And = AND = and_
Or = OR = or_
Xor = XOR = xor
Not = NOT = not_


def normalize_list_filter(value, field_name="filter"):
    if value is None:
        return None
    if isinstance(value, (list, tuple, set, str)) or hasattr(value, "value"):
        field = field_name.removeprefix("filters.")
        mode = "exact" if field == "output" else "contain" if field in ("input", "modality", "requiredFeatures", "fileFormats", "includeTags") else "any"
        return {"mode": mode, "values": _normalize_values_list(value)}
    if isinstance(value, dict):
        op = None
        mode = None
        values = None
        if "op" in value:
            op = str(value["op"]).lower()
            values = value.get("values", value.get("list", value.get("items")))
        elif "and" in value:
            op = "and"
            values = value["and"]
        elif "or" in value:
            op = "or"
            values = value["or"]
        elif "xor" in value:
            op = "xor"
            values = value["xor"]
        elif "not" in value:
            op = "not"
            values = value["not"]
        elif "mode" in value:
            mode = str(value["mode"]).lower()
            if mode == "contains":
                mode = "contain"
            values = value.get("values", value.get("list", value.get("items")))
        elif "exact" in value:
            mode = "exact"
            values = value["exact"]
        elif "contain" in value:
            mode = "contain"
            values = value["contain"]
        elif "contains" in value:
            mode = "contain"
            values = value["contains"]
        elif "any" in value:
            mode = "any"
            values = value["any"]
        elif "exclude" in value:
            mode = "exclude"
            values = value["exclude"]

        if op:
            items = values if isinstance(values, (list, tuple)) else [values]
            if op == "not" and len(items) != 1:
                raise ValueError("not requires exactly one expression")
            return {
                "op": op,
                "values": [
                    normalize_list_filter(child, field_name)
                    if isinstance(child, dict)
                    else (child.value if hasattr(child, "value") else str(child))
                    for child in items
                ],
            }
        if mode:
            items = values if isinstance(values, (list, tuple)) else [values]
            return {
                "mode": mode,
                "values": [
                    normalize_list_filter(child, field_name)
                    if isinstance(child, dict)
                    else (child.value if hasattr(child, "value") else str(child))
                    for child in items
                ],
            }
    raise ValueError(f"Invalid matcher for '{field_name}'")


def _normalize_modality_filter(value, field_name="modality"):
    name = "input" if field_name == "contain" else "output" if field_name == "exact" else field_name
    return normalize_list_filter(value, name)


def evaluate_filter_node(target_set, node, is_exact_set_match=False):
    if node is None:
        return True
    if isinstance(node, str):
        return node in target_set
    if hasattr(node, "value"):
        return node.value in target_set
    if not isinstance(node, dict):
        return False
    values = node.get("values", node.get("items", []))
    if "op" in node:
        op = str(node["op"]).lower()
        items = values if isinstance(values, (list, tuple)) else [values]
        if op == "and":
            return all(
                evaluate_filter_node(target_set, child, is_exact_set_match)
                for child in items
            )
        if op == "or":
            return _any(
                evaluate_filter_node(target_set, child, is_exact_set_match)
                for child in items
            )
        if op == "xor":
            return (
                sum(
                    1
                    for child in items
                    if evaluate_filter_node(target_set, child, is_exact_set_match)
                )
                == 1
            )
        if op == "not":
            return len(items) == 1 and not evaluate_filter_node(target_set, items[0])
        return False
    if "mode" in node:
        mode = str(node["mode"]).lower()
        if mode == "contains":
            mode = "contain"
        items = values if isinstance(values, (list, tuple)) else [values]
        literals = []
        sub_matchers = []
        for child in items:
            if isinstance(child, dict):
                sub_matchers.append(child)
            elif hasattr(child, "value"):
                literals.append(child.value)
            elif isinstance(child, str):
                literals.append(child)
        if mode == "any":
            if not items:
                return False
            return _any(lit in target_set for lit in literals) or _any(
                evaluate_filter_node(target_set, sub, is_exact_set_match)
                for sub in sub_matchers
            )
        if mode == "exclude":
            return all(lit not in target_set for lit in literals) and all(
                not evaluate_filter_node(target_set, sub) for sub in sub_matchers
            )
        for sub in sub_matchers:
            if not evaluate_filter_node(target_set, sub, is_exact_set_match):
                return False
        if mode == "exact":
            if not literals and sub_matchers:
                return True
            return target_set == set(literals)
        # contain
        return all(lit in target_set for lit in literals)
    return False


def matches_list_filter(
    target_values, filter_spec, allow_unknown=False, is_exact_set_match=False
):
    if filter_spec is None:
        return True
    if target_values is None:
        return allow_unknown
    if isinstance(target_values, set):
        target_set = target_values
    elif isinstance(target_values, (list, tuple)):
        target_set = {
            v.value if hasattr(v, "value") else str(v) for v in target_values
        }
    else:
        target_set = {
            target_values.value
            if hasattr(target_values, "value")
            else str(target_values)
        }
    return evaluate_filter_node(target_set, filter_spec, is_exact_set_match)


def _matches_modality(model_values, filter_spec, allow_unknown=False):
    return matches_list_filter(model_values, filter_spec, allow_unknown)


def get_release_channel(offering):
    if offering.get("releaseChannel"):
        return offering["releaseChannel"]
    model_id = offering.get("apiModelId") or offering.get("id", "")
    if re.search(r"(?:^|[-_./])(experimental|exp)(?:$|[-_./])", model_id, re.I):
        return "experimental"
    if re.search(r"(?:^|[-_./])(preview|beta|alpha)(?:$|[-_./])", model_id, re.I):
        return "preview"
    status = offering.get("status")
    if status in ("preview", "beta", "alpha"):
        return "preview"
    if status in ("experimental", "exp"):
        return "experimental"
    return "stable" if status == "stable" else "unknown"


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
    valid_specialities = {s.value for s in Speciality}
    valid_tiers = {t.value for t in Tier}
    for m in data["models"]:
        spec = m.get("speciality")
        spec_val = spec.value if hasattr(spec, "value") else spec
        if not spec_val or spec_val not in valid_specialities:
            errors.append(f"{m.get('id')}: invalid or missing speciality")
        tier = m.get("tier")
        tier_val = tier.value if hasattr(tier, "value") else tier
        if not tier_val or tier_val not in valid_tiers:
            errors.append(f"{m.get('id')}: invalid or missing tier")
    for o in data["offerings"]:
        spec = o.get("speciality")
        spec_val = spec.value if hasattr(spec, "value") else spec
        if not spec_val or spec_val not in valid_specialities:
            errors.append(f"{o.get('id')}: invalid or missing speciality")
        tier = o.get("tier")
        tier_val = tier.value if hasattr(tier, "value") else tier
        if not tier_val or tier_val not in valid_tiers:
            errors.append(f"{o.get('id')}: invalid or missing tier")
        errors.extend(_validate_signals(o))
        support = o.get("callSupport")
        if "callSupport" in o and (
            not isinstance(support, dict)
            or not isinstance(support.get("textGeneration"), bool)
            or "reason" not in support
            or support["reason"] is not None and not isinstance(support["reason"], str)
        ):
            errors.append(f"{o['id']}: invalid callSupport")
        if "releaseChannel" in o and o["releaseChannel"] not in ("stable", "preview", "experimental", "unknown"):
            errors.append(f"{o['id']}: invalid release channel")
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
        if not isinstance(p.get("providerIds"), list) or _any(
            i not in providers for i in p["providerIds"]
        ):
            errors.append(f"{p['id']}: unresolved provider")
    for preset in data["presets"]:
        ids = preset.get("offeringIds")
        if ids is not None and (
            not isinstance(ids, list)
            or _any(
                not _any(
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


def parse_released_within_days(val):
    if hasattr(val, "value"):
        val = val.value
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return val if val > 0 and math.isfinite(val) else None
    if isinstance(val, str):
        s = re.sub(r"^released?:", "", val.strip().lower())
        if s in ("1m", "1month", "1-month", "30d"):
            return 30
        if s in ("3m", "3months", "3-months", "90d"):
            return 90
        if s in ("6m", "6months", "6-months", "180d"):
            return 180
        if s in ("1y", "1year", "1-year", "365d"):
            return 365
        if s in ("2y", "2years", "2-years", "730d"):
            return 730
        try:
            num = float(s)
            if num > 0 and math.isfinite(num):
                return num
        except ValueError:
            pass
    return None


def _parse_release_timestamp(value):
    if not isinstance(value, str):
        return None
    val = value.strip()
    if len(val) == 7 and re.fullmatch(r"\d{4}-\d{2}", val):
        val = val + "-01"
    try:
        if "T" in val:
            return _timestamp(val)
        d = date.fromisoformat(val)
        return datetime.combine(d, datetime.min.time(), timezone.utc).timestamp()
    except (ValueError, TypeError):
        return None


def get_release_tags(release_date, as_of=None):
    epoch = _parse_release_timestamp(release_date)
    if epoch is None:
        return []
    now = _timestamp(as_of) if as_of else time.time()
    age_days = (now - epoch) / 86400.0
    if age_days < -1.0:
        return []
    tags = []
    if age_days <= 30.0:
        tags.extend(["release:1m", "released:1m"])
    if age_days <= 90.0:
        tags.extend(["release:3m", "released:3m"])
    if age_days <= 180.0:
        tags.extend(["release:6m", "released:6m"])
    if age_days <= 365.0:
        tags.extend(["release:1y", "released:1y"])
    if age_days <= 730.0:
        tags.extend(["release:2y", "released:2y"])
    return tags


def validate_config(config):
    errors = []
    if "sort" in config and config["sort"] not in {v.value for v in ModelSort}:
        errors.append("Unknown model sort")
    if "list" in config and config["list"] not in ({v.value for v in ModelList} | {"official"}):
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
            "includePreviews",
        ],
        "filters": [
            "speciality",
            "tier",
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
            "includePreviews",
            "callable",
            "verified",
            "verifiedBy",
            "verifiedWithinDays",
            "official",
            "releasedWithin",
            "releaseChannel",
        ],
        "prefer": ["features", "lowerCost"],
        "ui": ["maxProviders", "maxModelsPerProvider", "allowCustomModel"],
        "budget": ["maxInputTokens", "maxOutputTokens", "overheadTokens"],
    }
    for group, keys in allowed.items():
        for key in config if group == "root" else config.get(group, {}) or {}:
            if key not in keys:
                errors.append(f"Unknown {group}.{key}")

    vocabs = {
        "releaseChannel": {"stable", "preview", "experimental", "unknown"},
        "speciality": {s.value for s in Speciality},
        "tier": {t.value for t in Tier},
        "deployment": {d.value for d in Deployment},
        "origin": {c.value for c in Country},
        "input": {m.value for m in Modality},
        "output": {m.value for m in Modality},
        "requiredFeatures": {f.value for f in FeatureName},
        "lifecycle": {l.value for l in Lifecycle},
        "popularity": {p.value for p in Popularity},
    }

    def validate_selector_node(node, path, vocab=None):
        if node is None:
            return
        if isinstance(node, (list, tuple, set)):
            for child in node:
                validate_selector_node(child, path, vocab)
            return
        if isinstance(node, str) or hasattr(node, "value"):
            val_str = node.value if hasattr(node, "value") else str(node)
            if vocab is not None and val_str not in vocab:
                errors.append(f"Unknown {path} value")
            return
        if isinstance(node, dict):
            op = None
            mode = None
            values = None
            if "op" in node:
                op = node["op"]
                values = node.get("values", node.get("list", node.get("items")))
            elif "and" in node:
                op = "and"
                values = node["and"]
            elif "or" in node:
                op = "or"
                values = node["or"]
            elif "xor" in node:
                op = "xor"
                values = node["xor"]
            elif "not" in node:
                op = "not"
                values = node["not"]
            elif "mode" in node:
                mode = node["mode"]
                values = node.get("values", node.get("list", node.get("items")))
            elif "exact" in node:
                mode = "exact"
                values = node["exact"]
            elif "contain" in node:
                mode = "contain"
                values = node["contain"]
            elif "contains" in node:
                mode = "contain"
                values = node["contains"]
            elif "any" in node:
                mode = "any"
                values = node["any"]
            elif "exclude" in node:
                mode = "exclude"
                values = node["exclude"]
            else:
                errors.append(f"{path} matcher must specify mode or op")
                return

            if op and str(op).lower() not in ["and", "or", "xor", "not"]:
                errors.append(f"{path} operator must be and, or, xor, or not")
            if (
                mode
                and str(mode).lower()
                not in ["exact", "contain", "contains", "any", "exclude"]
            ):
                errors.append(
                    f"{path} matcher mode must be exact, contain, any, or exclude"
                )
            if op == "not" and isinstance(values, (list, tuple)) and len(values) != 1:
                errors.append("not requires exactly one expression")
            if values is not None:
                items = values if isinstance(values, (list, tuple, set)) else [values]
                for child in items:
                    validate_selector_node(child, path, vocab)
            return
        errors.append(f"{path} must be a string or matcher")

    if "providerIds" in config and config["providerIds"] is not None:
        validate_selector_node(config["providerIds"], "providerIds")

    filter_selectors = [
        "releaseChannel",
        "speciality",
        "tier",
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
    ]
    f = config.get("filters", {})
    for key in filter_selectors:
        if key in f and f[key] is not None:
            validate_selector_node(f[key], f"filters.{key}", vocabs.get(key))

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
    for key in ["callable", "includeDeprecated", "includePreviews", "official"]:
        if key in f and not isinstance(f[key], bool):
            errors.append(f"filters.{key} must be boolean")
    if "includePreviews" in config and not isinstance(config["includePreviews"], bool):
        errors.append("includePreviews must be boolean")
    valid_verified = {"verified", "unverified", "verified to be failure"}
    if "verified" in f and not isinstance(f["verified"], bool) and f["verified"] not in valid_verified:
        errors.append("filters.verified must be boolean or verification status")
    if "verifiedBy" in f and (
        not isinstance(f["verifiedBy"], str)
        or not re.fullmatch(r"github:[a-z0-9-]+", f["verifiedBy"], re.I)
    ):
        errors.append("verifiedBy must identify a GitHub contributor")
    if "verifiedWithinDays" in f and (
        not finite(f["verifiedWithinDays"]) or f["verifiedWithinDays"] < 1
    ):
        errors.append("verifiedWithinDays must be positive")
    if "releasedWithin" in f and parse_released_within_days(f["releasedWithin"]) is None:
        errors.append(
            "filters.releasedWithin must be a valid duration (e.g. 1m, 3m, 6m, 1y, 2y) or positive number of days"
        )
    preferred = config.get("prefer", {}).get("features")
    if preferred is not None and (
        not isinstance(preferred, list)
        or _any(v not in {m.value for m in FeatureName} for v in preferred)
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


def _has_channel_preview_tag(node):
    if not node:
        return False
    if isinstance(node, str):
        return node == "channel:preview"
    if hasattr(node, "value"):
        return getattr(node, "value") == "channel:preview"
    if isinstance(node, (list, tuple, set)):
        return _any(_has_channel_preview_tag(t) for t in node)
    if isinstance(node, dict):
        vals = (
            node.get("values")
            or node.get("items")
            or node.get("any")
            or node.get("exact")
        )
        if isinstance(vals, (list, tuple, set)):
            return _any(_has_channel_preview_tag(t) for t in vals)
        if "or" in node and isinstance(node["or"], list):
            return _any(_has_channel_preview_tag(t) for t in node["or"])
        if "and" in node and isinstance(node["and"], list):
            return _any(_has_channel_preview_tag(t) for t in node["and"])
    return False


def matches(o, m, config, provider_tags=None, is_curated=False):
    f = config.get("filters", {})
    unknown = config.get("unknownPolicy") == "include"

    if f.get("releaseChannel") is not None:
        if not matches_list_filter(
            get_release_channel(o),
            normalize_list_filter(f["releaseChannel"], "releaseChannel"),
        ):
            return False
    else:
        channel = get_release_channel(o)
        allow_preview = (
            is_curated
            or f.get("includePreviews") is True
            or config.get("includePreviews") is True
            or _has_channel_preview_tag(f.get("includeTags"))
            or (
                config.get("list") == "complete"
                and f.get("includePreviews") is not False
                and config.get("includePreviews") is not False
            )
        )
        if not allow_preview and channel in ("preview", "experimental"):
            return False
    if "speciality" in f and f["speciality"] is not None:
        spec = normalize_list_filter(f["speciality"], "speciality")
        actual = o.get("speciality") or get_model_speciality(o, m)
        if not matches_list_filter(actual, spec, unknown):
            return False
    if "tier" in f and f["tier"] is not None:
        spec = normalize_list_filter(f["tier"], "tier")
        actual = o.get("tier") or get_model_tier(o, m)
        if not matches_list_filter(actual, spec, unknown):
            return False
    if "deployment" in f and f["deployment"] is not None:
        spec = normalize_list_filter(f["deployment"], "deployment")
        if not matches_list_filter(o.get("deployment"), spec, unknown):
            return False
    if "origin" in f and f["origin"] is not None:
        spec = normalize_list_filter(f["origin"], "origin")
        orig = m.get("origin") if m else None
        if not orig:
            if not unknown:
                return False
        elif not matches_list_filter(orig, spec, unknown):
            return False
    if "openWeights" in f:
        value = m.get("openWeights") if m else None
        if (value is None and not unknown) or (
            value is not None and value != f["openWeights"]
        ):
            return False
    if "commercialUse" in f:
        value = m.get("commercialUse", "unknown") if m else "unknown"
        if (value == "unknown" and not unknown) or (
            value != "unknown" and value != f["commercialUse"]
        ):
            return False
    if "input" in f and f["input"] is not None:
        spec = normalize_list_filter(f["input"], "input")
        if not _matches_modality(o.get("modalities", {}).get("input"), spec, unknown):
            return False
    if "output" in f and f["output"] is not None:
        spec = normalize_list_filter(f["output"], "output")
        if not _matches_modality(o.get("modalities", {}).get("output"), spec, unknown):
            return False
    if "fileFormats" in f and f["fileFormats"] is not None:
        spec = normalize_list_filter(f["fileFormats"], "fileFormats")
        ff = o.get("fileFormats")
        if ff is None:
            if not unknown:
                return False
        elif not matches_list_filter(ff, spec, unknown):
            return False
    if "requiredFeatures" in f and f["requiredFeatures"] is not None:
        spec = normalize_list_filter(f["requiredFeatures"], "requiredFeatures")
        supported = [
            k
            for k, feat in o.get("features", {}).items()
            if feat.get("status") == "supported" or (feat.get("status") == "unknown" and unknown)
        ]
        if not matches_list_filter(supported, spec, unknown):
            return False

    constraints = [
        ("minContextTokens", o.get("limits", {}).get("context"), "min"),
        ("maxInputPricePerM", o.get("price", {}).get("input"), "max"),
        ("maxOutputPricePerM", o.get("price", {}).get("output"), "max"),
        ("maxParameters", m.get("size", {}).get("totalParameters") if m else None, "max"),
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
    callable_filter = (
        f.get("callable")
        if "callable" in f
        else (None if config.get("list") in (ModelList.COMPLETE, "complete") else True)
    )
    if callable_filter is not None and support["textGeneration"] != callable_filter:
        return False

    if "lifecycle" in f and f["lifecycle"] is not None:
        spec = normalize_list_filter(f["lifecycle"], "lifecycle")
        if not matches_list_filter(o["lifecycle"]["status"], spec, unknown):
            return False
    else:
        include_retired = f.get("includeDeprecated") is True or (
            config.get("list") == ModelList.COMPLETE and f.get("includeDeprecated") is not False
        )
        allowed_lifecycle = list(Lifecycle) if include_retired else [Lifecycle.LIVE, Lifecycle.UNCERTAIN]
        if o["lifecycle"]["status"] not in allowed_lifecycle:
            return False

    if "popularity" in f and f["popularity"] is not None:
        spec = normalize_list_filter(f["popularity"], "popularity")
        if not matches_list_filter(o["popularity"]["status"], spec, unknown):
            return False

    if "releasedWithin" in f:
        max_days = parse_released_within_days(f["releasedWithin"])
        if max_days is None:
            return False
        r_date = o.get("releaseDate") or (m.get("releaseDate") if m else None)
        if not r_date:
            if not unknown:
                return False
        else:
            epoch = _parse_release_timestamp(r_date)
            if epoch is None:
                if not unknown:
                    return False
            else:
                now = _timestamp(config["asOf"]) if config.get("asOf") else time.time()
                age_days = (now - epoch) / 86400.0
                if age_days < -1.0 or age_days > max_days:
                    return False
    tags = set(
        [
            t
            for t in (m.get("tags", []) if m else []) + (provider_tags or [])
            if not t.startswith(
                ("lifecycle:", "popularity:", "release:", "released:")
            )
        ]
        + o.get("tags", [])
    )
    spec_val = o.get("speciality") or get_model_speciality(o, m)
    if spec_val:
        tags.add(f"speciality:{spec_val}")
    tier_val = o.get("tier") or get_model_tier(o, m)
    if tier_val:
        tags.add(f"tier:{tier_val}")
    if is_flash_model(o, m):
        tags.add("model:flash")
    channel = get_release_channel(o)
    if channel in ("preview", "experimental"):
        tags.add("channel:preview")
    if o.get("releaseDate"):
        for t in get_release_tags(o["releaseDate"], config.get("asOf")):
            tags.add(t)
    elif m and m.get("releaseDate"):
        for t in get_release_tags(m["releaseDate"], config.get("asOf")):
            tags.add(t)

    if "includeTags" in f and f["includeTags"] is not None:
        spec = normalize_list_filter(f["includeTags"], "includeTags")
        if not matches_list_filter(tags, spec, unknown):
            return False
    if "excludeTags" in f and f["excludeTags"] is not None:
        spec = normalize_list_filter(f["excludeTags"], "excludeTags")
        matches_exclusion = evaluate_filter_node(tags, spec)
        if (not matches_exclusion) if spec.get("mode") == "exclude" else matches_exclusion:
            return False

    if "official" in f:
        if is_official_offering(o, m, provider_tags) != f["official"]:
            return False
    return True


def get_model_speciality(offering, model=None):
    model = model or {}
    if offering and offering.get("speciality"):
        return getattr(offering["speciality"], "value", offering["speciality"])
    if model.get("speciality"):
        return getattr(model["speciality"], "value", model["speciality"])
    prov = offering.get("providerId", "") if offering else ""
    api_id = (
        offering.get("apiModelId", offering.get("id", model.get("id", "")))
        if offering
        else model.get("id", "")
    )
    full_id = f"{prov}/{api_id}".lower()
    name = (
        f"{offering.get('name', '') if offering else ''} {model.get('name', '')}".lower()
    )
    text = f"{full_id} {name}"

    if (
        "daybreak" in text
        or "cybersecurity" in text
        or "security" in text
        or "red-team" in text
        or "blue-team" in text
    ):
        return Speciality.CYBERSECURITY.value
    if re.search(r"codex|codestral|devstral|(?:^|[-_./\s])coder(?:$|[-_./\s])|starcoder|code-llama", text, re.I):
        return Speciality.CODING.value
    if "lyria" in text or "music" in text:
        return Speciality.MUSIC.value
    if "guard" in text or "safety" in text or "shield" in text or "moderation" in text:
        return Speciality.SAFETY.value
    if "customtools" in text or "deep-research" in text or "computer-use" in text:
        return Speciality.AGENT.value
    if "live-translate" in text or "translate" in text:
        return Speciality.TRANSLATION.value
    if "embed" in text or "embedding" in text or "bge-" in text:
        return Speciality.EMBEDDING.value
    out_mods = offering.get("modalities", {}).get("output", []) if offering else []
    if len(out_mods) == 1 and out_mods[0] == "image" and "text" not in out_mods:
        return Speciality.IMAGE.value
    if len(out_mods) == 1 and out_mods[0] == "audio" and "text" not in out_mods:
        return Speciality.AUDIO.value
    if len(out_mods) == 1 and out_mods[0] == "video" and "text" not in out_mods:
        return Speciality.VIDEO.value
    if (
        "dall-e" in text
        or "imagen" in text
        or "flux" in text
        or "midjourney" in text
        or "image-latest" in text
    ):
        return Speciality.IMAGE.value
    if "whisper" in text or "tts" in text or "speech" in text:
        return Speciality.AUDIO.value
    if "sora" in text or "veo" in text or "gen-3" in text or "video-latest" in text:
        return Speciality.VIDEO.value
    return Speciality.GENERAL.value if re.search(r"gpt|claude|gemini|deepseek|llama|qwen|mistral|gemma|glm|grok|kimi|minimax", text, re.I) else Speciality.UNKNOWN.value


def get_model_tier(offering, model=None):
    model = model or {}
    if offering and offering.get("tier"):
        return getattr(offering["tier"], "value", offering["tier"])
    if model.get("tier"):
        return getattr(model["tier"], "value", model["tier"])
    api_id = (
        offering.get("apiModelId", offering.get("id", model.get("id", "")))
        if offering
        else model.get("id", "")
    )
    name = (
        f"{offering.get('name', '') if offering else ''} {model.get('name', '')}".lower()
    )
    text = f"{api_id} {name}".lower()

    if (
        "flash-lite" in text
        or "flash_lite" in text
        or "nano" in text
        or bool(re.search(r"(?:^|[-_./\s])lite(?:$|[-_./\s])", text, re.IGNORECASE))
    ):
        return Tier.LITE.value
    if bool(re.search(r"(?:^|[-_./\s])mini(?:$|[-_./\s])", text, re.IGNORECASE)) or "gemma" in text or "micro" in text:
        return Tier.MINI.value
    if is_flash_model(offering, model) or "luna" in text or "haiku" in text:
        return Tier.FLASH.value
    if (
        "astra" in text
        or "opus" in text
        or "fable" in text
        or "argon" in text
        or bool(re.search(r"(?:^|[-_./\s])pro(?:$|[-_./\s])", text, re.IGNORECASE))
    ):
        return Tier.FLAGSHIP.value
    return Tier.WORKHORSE.value if re.search(r"gpt|claude|gemini|deepseek|llama|qwen|mistral|glm|grok|kimi|minimax", text, re.I) else Tier.UNKNOWN.value


def is_flash_model(offering, model=None):
    model = model or {}
    o_tags = offering.get("tags") or []
    m_tags = model.get("tags") or []
    if "model:flash" in o_tags or "model:flash" in m_tags:
        return True
    pattern = re.compile(r"(?:^|[-_./\s])flashx?(?:$|[-_./\s])", re.IGNORECASE)
    return bool(
        (offering.get("apiModelId") and pattern.search(offering["apiModelId"]))
        or (offering.get("name") and pattern.search(offering["name"]))
        or (offering.get("modelId") and pattern.search(offering["modelId"]))
        or (model.get("id") and pattern.search(model["id"]))
        or (model.get("name") and pattern.search(model["name"]))
    )


def is_official_offering(o, m, provider_tags=None):
    tags = provider_tags or []
    if "provider:official" in tags:
        creator = (m.get("id") or o.get("modelId", "")).split("/")[0]
        return o.get("providerId") == creator or o.get("providerId", "").startswith(
            creator + "-"
        )
    aggregators = {
        "openrouter",
        "groq",
        "siliconflow",
        "302ai",
        "aihubmix",
        "deepinfra",
        "togetherai",
        "fireworks-ai",
        "azure",
        "amazon-bedrock",
        "local",
        "ollama",
    }
    if o.get("providerId") in aggregators:
        return False
    creator = (m.get("id") or o.get("modelId", "")).split("/")[0]
    return o.get("providerId") == creator or o.get("providerId", "").startswith(
        creator + "-"
    )


class Catalog:
    def __init__(self, data, trusted=False):
        if not trusted:
            errors = validate_catalog(data)
            if errors:
                raise ValueError("; ".join(errors))
            self.data = copy.deepcopy(data)
        else:
            self.data = data
        self.providers = {p["id"]: p for p in self.data["providers"]}
        self.models = {m["id"]: m for m in self.data["models"]}
        self.offerings = {o["id"]: o for o in self.data["offerings"]}
        self.families = {f["id"]: f for f in self.data.get("families", [])}
        self.assets = {a["id"]: a for a in self.data.get("assets", [])}
        self.offerings_by_provider = {}
        for o in self.data.get("offerings", []):
            self.offerings_by_provider.setdefault(o["providerId"], []).append(o)
        self.verifications_by_offering = {}
        for v in self.data.get("verifications", []):
            self.verifications_by_offering.setdefault(v.get("offeringId"), []).append(v)
        self.data["_verifications_by_offering"] = self.verifications_by_offering
        self._cache = {}

    def serialize_query(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
    ) -> str:
        return serialize_query(config, options)

    def get_config(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
    ) -> dict:
        return get_config(config, options)

    def get_config_json(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
        indent: int = 2,
    ) -> str:
        return get_config_json(config, options, indent=indent)

    def to_config(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
    ) -> dict:
        return get_config(config, options)

    def to_config_json(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
        indent: int = 2,
    ) -> str:
        return get_config_json(config, options, indent=indent)


    def has_cached(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
    ) -> bool:
        return self.serialize_query(config, options) in self._cache

    def get_cached(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
    ) -> list[dict] | None:
        key = self.serialize_query(config, options)
        hit = self._cache.get(key)
        return copy.deepcopy(hit) if hit is not None else None

    def clear_cache(self) -> None:
        self._cache.clear()

    def add_verifications(self, records: list[dict]) -> None:
        if not isinstance(records, list):
            return
        if "verifications" not in self.data or not isinstance(self.data["verifications"], list):
            self.data["verifications"] = []
        for v in records:
            if not _any(existing.get("id") == v.get("id") for existing in self.data["verifications"]):
                self.data["verifications"].append(v)
                self.verifications_by_offering.setdefault(v.get("offeringId"), []).append(v)
        self.clear_cache()

    def get(self, offering_id):
        return self.offerings.get(offering_id)

    def get_models(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
    ) -> list[dict]:
        normalized = _normalize_query(config, options)
        sort = normalized.get("sort")
        if sort in (
            ModelSort.SPEED,
            ModelSort.SPEED_ASCEND,
            ModelSort.SPEED_DESCEND,
            "speed",
            "speedAscend",
            "speedDescend",
        ):
            raise NotImplementedError("Speed sorting is not implemented")
        cache_key = self.serialize_query(config, options)
        if cache_key in self._cache:
            return copy.deepcopy(self._cache[cache_key])
        config = normalized
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
                family = self.families.get(model.get("familyId")) if model else None
                result.append(
                    dict(
                        o,
                        connection=connection_for(o),
                        callSupport=o.get("callSupport", call_support_for(o)),
                        provider=g["provider"],
                        model=model,
                        family=family,
                        logos={
                            "provider": self.assets.get(g["provider"].get("logoId")),
                            "family": (
                                self.assets.get(family.get("logoId"))
                                if family
                                else None
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
        out = copy.deepcopy(
            hosted[: config.get("limit", len(result))]
            + [o for o in result if o["deployment"] == "local"]
        )
        if len(self._cache) >= 64:
            first_key = next(iter(self._cache))
            del self._cache[first_key]
        self._cache[cache_key] = copy.deepcopy(out)
        return out

    def get_models_by_provider(
        self,
        config: "PickerConfig | ModelList | None" = None,
        options: "PickerConfig | None" = None,
    ) -> dict[str, list[dict]]:
        models = self.get_models(config, options)
        grouped: dict[str, list[dict]] = {}
        for m in models:
            key = (
                (m.get("provider") or {}).get("id")
                or m.get("providerId")
                or ("local" if m.get("local") else "unknown")
            )
            grouped.setdefault(key, []).append(m)
        return grouped

    def select(self, config=None, options=None):
        return self._select(_normalize_query(config, options))

    def _select(self, config=None, uncapped=False):
        config = config or {}
        errors = validate_config(config)
        if errors:
            raise ValueError("; ".join(errors))
        target_preset = config.get(
            "preset",
            "default" if config.get("list") == ModelList.DEFAULT else "global",
        )
        preset = next(
            (p for p in self.data["presets"] if p["id"] == target_preset),
            None,
        )
        if not preset and target_preset in ("official", "official-flagship"):
            preset = next(
                (p for p in self.data["presets"] if p["id"] in ("official-flagship", "official")),
                None,
            )
        if not preset and config.get("list") == ModelList.DEFAULT:
            preset = next(
                (p for p in self.data["presets"] if p["id"] == "global"), None
            )
        if not preset:
            raise ValueError(f"Unknown preset: {config.get('preset')}")
        if config.get("providerIds") is not None:
            spec = normalize_list_filter(config["providerIds"], "providerIds")

            def collect_literals(node):
                if not node:
                    return []
                if isinstance(node, str):
                    return [node]
                val = node.get("values", node.get("items", []))
                items = val if isinstance(val, list) else [val]
                res = []
                for item in items:
                    res.extend(collect_literals(item))
                return res

            requested = collect_literals(spec)
            if _any(i not in self.providers for i in requested):
                raise ValueError("Unknown provider in providerIds")
            ids = list(dict.fromkeys(config["providerIds"])) if isinstance(config["providerIds"], list) else [
                p["id"] for p in self.data["providers"] if evaluate_filter_node({p["id"]}, spec)
            ]
        else:
            ids = (
                list(self.providers)
                if config.get("list") == ModelList.COMPLETE
                else preset["providerIds"]
            )
        groups = []
        recommended = (
            set(preset["offeringIds"])
            if "offeringIds" in preset and preset["offeringIds"]
            else None
        )

        def order(o):
            count = sum(
                o.get("features", {}).get(f, {}).get("status") == "supported"
                for f in config.get("prefer", {}).get("features", [])
            )
            price = o.get("price", {}).get("input")
            is_flash = 1 if is_flash_model(o, self.models.get(o.get("modelId", ""))) else 0
            flagship_score = 0
            if config.get("preset") in ("official-flagship", "official"):
                flagship_score = is_flash * 1000 - (o.get("price", {}).get("input") or 0)
            return (
                -int(o["lifecycle"]["status"] == Lifecycle.LIVE),
                -count,
                (price if price is not None else math.inf)
                if config.get("prefer", {}).get("lowerCost")
                else 0,
                flagship_score,
                o.get("rank", 100),
                o["id"],
            )

        for provider_id in ids:
            if self.providers[provider_id]["deployment"] == "local":
                continue
            provider_offerings = self.offerings_by_provider.get(provider_id, [])
            choices = sorted(
                (
                    o
                    for o in (
                        _with_signals(item, config.get("asOf"))
                        for item in provider_offerings
                        if recommended is None or item["id"] in recommended
                    )
                    if matches(
                        o,
                        self.models[o["modelId"]],
                        config,
                        self.providers[provider_id].get("tags", []),
                        is_curated=bool(recommended and o["id"] in recommended),
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
        raw_mod = (options.get("modalities") or {}).get(direction, [])
        req_list = (
            raw_mod
            if isinstance(raw_mod, list)
            else (
                raw_mod.get("values")
                or raw_mod.get("exact")
                or raw_mod.get("contain")
                or raw_mod.get("contains")
                or raw_mod.get("any")
                or []
            )
            if isinstance(raw_mod, dict)
            else [raw_mod]
            if raw_mod
            else []
        )
        for modality in req_list:
            mod_val = modality.value if hasattr(modality, "value") else str(modality)
            values = offering.get("modalities", {}).get(direction)
            if values is None or mod_val not in values:
                diagnostics.append(
                    diagnostic(
                        "MODALITY_UNVERIFIED"
                        if values is None
                        else "MODALITY_UNSUPPORTED",
                        f"{direction} modality {mod_val} is {'unverified' if values is None else 'unsupported'}.",
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
        if _any(d["severity"] == "error" for d in diagnostics)
        else "unknown"
        if _any(d["code"] in unknown_codes for d in diagnostics)
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


_DEFAULT_CATALOG = None


def load_catalog():
    """Load the packaged offline snapshot. No network or Node dependency."""
    global _DEFAULT_CATALOG
    if _DEFAULT_CATALOG is None:
        import json
        from importlib.resources import files

        _DEFAULT_CATALOG = Catalog(
            json.loads(files("byokit").joinpath("data/catalog.json").read_text()),
            trusted=True,
        )
    return _DEFAULT_CATALOG


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
        "model:",
        "speciality:",
        "tier:",
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
    spec_val = (
        (offering.get("speciality").value if hasattr(offering.get("speciality"), "value") else offering.get("speciality"))
        or get_model_speciality(offering, model)
    )
    if spec_val:
        tags.append(f"speciality:{spec_val}")
    tier_val = (
        (offering.get("tier").value if hasattr(offering.get("tier"), "value") else offering.get("tier"))
        or get_model_tier(offering, model)
    )
    if tier_val:
        tags.append(f"tier:{tier_val}")
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
    if is_flash_model(offering, model):
        tags.append("model:flash")
    channel = get_release_channel(offering)
    if channel in ("preview", "experimental"):
        tags.append("channel:preview")
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


@functools.lru_cache(maxsize=4096)
def _timestamp(value):
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
            or _any(c not in {m.value for m in VerificationCheck} for c in r["checks"])
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
        if "tokensPerSecond" in r and (
            not isinstance(r["tokensPerSecond"], (int, float))
            or r["tokensPerSecond"] <= 0
        ):
            errors.append("tokensPerSecond must be a positive number")
        if "timeToFirstTokenMs" in r and (
            not isinstance(r["timeToFirstTokenMs"], (int, float))
            or r["timeToFirstTokenMs"] < 0
        ):
            errors.append("timeToFirstTokenMs must be a non-negative number")
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
            "tokensPerSecond",
            "timeToFirstTokenMs",
        }:
            errors.append(
                "Unknown verification field; do not record keys or request payloads"
            )
    return errors


def verification_summary(
    data, offering_id, *, as_of=None, max_age_days=90, contributor=None
):
    now = _timestamp(as_of) if as_of else datetime.now(timezone.utc).timestamp()
    records_source = (
        data.get("_verifications_by_offering", {}).get(offering_id)
        if "_verifications_by_offering" in data
        else [r for r in data.get("verifications", []) if r["offeringId"] == offering_id]
    )
    records = [
        r
        for r in (records_source or [])
        if not contributor or r["contributor"].lower() == contributor.lower()
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
    community_status = (
        "unverified"
        if latest is None
        else "verified to be failure"
        if latest["result"] == "failed"
        else "verified"
    )
    return {
        "status": status,
        "communityStatus": community_status,
        "latest": latest,
        "records": records,
    }


def matches_verification(data, oid, config):
    f = config.get("filters", {})
    if not _any(k in f for k in ["verified", "verifiedBy", "verifiedWithinDays"]):
        return True
    summary = verification_summary(
        data,
        oid,
        as_of=config.get("asOf"),
        max_age_days=f.get("verifiedWithinDays", 90),
        contributor=f.get("verifiedBy"),
    )
    v = f.get("verified")
    if isinstance(v, str):
        return summary["communityStatus"] == v or summary["status"] == v
    return summary["status"] != "passed" if v is False else summary["status"] == "passed"


_WARNED_RUNTIME = False


def get_models(
    config: "PickerConfig | ModelList | None" = None,
    options: "PickerConfig | None" = None,
) -> list[dict]:
    global _WARNED_RUNTIME
    import os

    if not _WARNED_RUNTIME and not os.environ.get("BYOKIT_NO_RUNTIME_WARNING"):
        _WARNED_RUNTIME = True
        import warnings

        warnings.warn(
            "[byokit] Tip: byokit.get_models() evaluated the full bundled catalog at runtime. "
            "For production apps with a fixed query, precompile your model list at build time "
            "(`byokit build byok.config.json --out generated_models.py`) to avoid loading and querying "
            "the full catalog. Set BYOKIT_NO_RUNTIME_WARNING=1 to silence this message.",
            UserWarning,
            stacklevel=2,
        )
    return load_catalog().get_models(config, options)


def get_models_by_provider(
    config: "PickerConfig | ModelList | None" = None,
    options: "PickerConfig | None" = None,
) -> dict[str, list[dict]]:
    return load_catalog().get_models_by_provider(config, options)



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
        t
        for t in o.get("tags", [])
        if not t.startswith(
            ("lifecycle:", "popularity:", "release:", "released:")
        )
    ]
    release_tags = get_release_tags(o.get("releaseDate"), as_of)
    channel = get_release_channel(o)
    channel_tags = ["channel:preview"] if channel in ("preview", "experimental") else []
    return dict(
        o,
        lifecycle=lifecycle,
        popularity=popularity,
        tags=list(
            dict.fromkeys(
                tags
                + channel_tags
                + ["lifecycle:" + lifecycle["status"], "popularity:" + popularity["status"]]
                + release_tags
            )
        ),
    )


def _normalize_query(input=None, options=None):
    if isinstance(input, str):
        if input not in ({v.value for v in ModelList} | {"official"}):
            raise ValueError("Unknown model list")
        config = dict(options or {}, list=input)
    else:
        if input is not None and not isinstance(input, dict) or options is not None:
            raise ValueError("Use get_models(options) or get_models(list, options)")
        config = dict(input or {})
    if not _any(k in config for k in ["list", "preset", "providerIds"]):
        config["list"] = ModelList.DEFAULT
    if config.get("list") == ModelList.LIVE:
        config["list"] = ModelList.DEFAULT
    if config.get("list") == ModelList.CHINA:
        config["preset"] = "china"
    if config.get("list") == ModelList.GLOBAL:
        config["preset"] = "global"
    if config.get("list") in (
        ModelList.OFFICIAL_FLAGSHIP,
        ModelList.OFFICIAL,
        "official-flagship",
        "official",
    ):
        config["preset"] = "official-flagship"
        filters = dict(config.get("filters") or {})
        filters["official"] = True
        config["filters"] = filters
    if config.get("preset") == "official":
        config["preset"] = "official-flagship"
    if config.get("list") not in (ModelList.COMPLETE, "complete"):
        filters = dict(config.get("filters") or {})
        if "callable" not in filters:
            filters["callable"] = True
        config["filters"] = filters
    if "filters" in config and isinstance(config["filters"], dict):
        f = dict(config["filters"])
        if "input" in f and f["input"] is not None:
            norm = _normalize_modality_filter(f["input"], "input")
            f["input"] = norm
        if "output" in f and f["output"] is not None:
            f["output"] = _normalize_modality_filter(f["output"], "output")
        config["filters"] = f
    return config


def serialize_query(
    config: "PickerConfig | ModelList | None" = None,
    options: "PickerConfig | None" = None,
) -> str:
    import json
    normalized = _normalize_query(config, options)
    return json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        default=lambda o: o.value if hasattr(o, "value") else str(o),
    )


def _clean_config(obj):
    if hasattr(obj, "value"):
        return obj.value
    if isinstance(obj, dict):
        return {k: _clean_config(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean_config(v) for v in obj]
    if isinstance(obj, tuple):
        return tuple(_clean_config(v) for v in obj)
    return obj


def get_config(
    config: "PickerConfig | ModelList | None" = None,
    options: "PickerConfig | None" = None,
) -> dict:
    normalized = _normalize_query(config, options)
    return _clean_config(normalized)


def get_config_json(
    config: "PickerConfig | ModelList | None" = None,
    options: "PickerConfig | None" = None,
    indent: int = 2,
) -> str:
    import json
    return json.dumps(
        get_config(config, options),
        indent=indent,
        default=lambda o: o.value if hasattr(o, "value") else str(o),
    )


to_config = get_config
to_config_json = get_config_json




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


def _has_modality_filter(spec):
    if not spec:
        return False
    if isinstance(spec, list):
        return len(spec) > 0
    if isinstance(spec, dict):
        if spec.get("mode") or spec.get("op"):
            return True
        vals = (
            spec.get("values")
            or spec.get("exact")
            or spec.get("contain")
            or spec.get("contains")
            or spec.get("any")
        )
        return len(vals) > 0 if isinstance(vals, list) else bool(vals)
    return True


def _local_groups(config, catalog):
    for field in ("speciality", "tier", "releaseChannel"):
        if config.get("filters", {}).get(field) is not None and not matches_list_filter("unknown", normalize_list_filter(config["filters"][field], field)):
            return []
    if (
        _has_modality_filter(config.get("filters", {}).get("input"))
        or _has_modality_filter(config.get("filters", {}).get("output"))
        or config.get("filters", {}).get("callable") is False
        or config.get("filters", {}).get("official") is True
        or config.get("preset") in ("official-flagship", "official")
        or config.get("local") is False
        or (
            "deployment" in config.get("filters", {})
            and not evaluate_filter_node(
                {"local"},
                normalize_list_filter(config["filters"]["deployment"], "deployment"),
                is_exact_set_match=True,
            )
        )
    ):
        return []
    preset = next(
        (p for p in catalog.data["presets"] if p["id"] == config.get("preset")), None
    )
    if config.get("providerIds") is not None:
        spec = normalize_list_filter(config["providerIds"], "providerIds")
        ids = [
            p["id"]
            for p in catalog.data["providers"]
            if evaluate_filter_node({p["id"]}, spec, is_exact_set_match=True)
        ]
    else:
        ids = preset["providerIds"] if preset else None
    if (
        "local" not in config
        and ids is not None
        and not _any(catalog.providers[id]["deployment"] == "local" for id in ids)
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
                "speciality": "unknown",
                "tier": "unknown",
                "releaseChannel": "unknown",
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
