"""Normalized observations; never retain provider error messages or account data."""

from typing import cast
from .types import VerificationAttempt
import copy
import math
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

CLASSIFIER_VERSION = "1"
OUTCOMES = {"succeeded", "partial", "blocked", "inconclusive", "canceled", "skipped"}
REASONS = {
    "invalid_credentials",
    "quota_exhausted",
    "rate_limited",
    "access_denied",
    "region_restricted",
    "policy_restricted",
    "model_not_found_or_inaccessible",
    "invalid_request",
    "unsupported_operation",
    "provider_unavailable",
    "network_error",
    "timeout",
    "invalid_response",
    "empty_response",
    "unknown",
}
SCOPES = {"account", "model", "provider", "region", "request", "client", "unknown"}
ACTIONS = {
    "none",
    "check_credentials",
    "check_billing",
    "retry_later",
    "check_limits",
    "check_model_access",
    "check_supported_locations",
    "review_policy",
    "check_model_id_and_access",
    "check_operation",
    "check_settings",
    "check_network",
    "review_response",
    "review_diagnostics",
}


def _valid_attempt(a):
    if not isinstance(a, dict) or set(a) - {
        "outcome",
        "reason",
        "scope",
        "certainty",
        "source",
        "classifierVersion",
        "httpStatus",
        "retry",
    }:
        return False
    if not {
        "outcome",
        "reason",
        "scope",
        "certainty",
        "source",
        "classifierVersion",
        "retry",
    }.issubset(a):
        return False
    retry = a.get("retry")
    if not isinstance(retry, dict) or set(retry) != {"action", "afterSeconds"}:
        return False
    delay = retry["afterSeconds"]
    return (
        a.get("outcome") in OUTCOMES
        and a.get("reason") in REASONS | {None}
        and a.get("scope") in SCOPES
        and a.get("certainty") in {"explicit", "inferred", "unknown"}
        and a.get("source") in {"provider_code", "http_status", "client_error"}
        and a.get("classifierVersion") == CLASSIFIER_VERSION
        and (
            "httpStatus" not in a
            or type(a["httpStatus"]) is int
            and 100 <= a["httpStatus"] <= 599
        )
        and retry.get("action") in ACTIONS
        and (delay is None or type(delay) is int and 0 <= delay <= 604800)
    )


def valid_attempt(a):
    try:
        return _valid_attempt(a)
    except (TypeError, KeyError):
        return False


def classify_verification_error(
    error=None, *, body=None, retry_after=None, now=None
) -> VerificationAttempt:
    error = error or {}
    value = error if isinstance(error, dict) else vars(error)
    if valid_attempt(value.get("attempt")) and body is None and retry_after is None:
        return cast(VerificationAttempt, copy.deepcopy(value["attempt"]))
    status = value.get("status")
    now = datetime.now(timezone.utc).timestamp() * 1000 if now is None else now
    detail = (body.get("error") or body) if isinstance(body, dict) else {}
    if not isinstance(detail, dict):
        detail = {}
    details = detail.get("details") if isinstance(detail.get("details"), list) else []
    codes = {
        v.lower()
        for v in [
            detail.get("code"),
            detail.get("type"),
            detail.get("status"),
            *[d.get("reason") for d in details if isinstance(d, dict)],
        ]
        if isinstance(v, str)
    }
    message = detail.get("message", "")
    message = message[:4096].lower() if isinstance(message, str) else ""
    reason, scope, action, certainty, source = (
        "unknown",
        "unknown",
        "review_diagnostics",
        "unknown",
        "client_error",
    )
    quota_items = [
        v
        for d in details
        if isinstance(d, dict)
        for k in ("quotaViolations", "violations")
        for v in (d.get(k) if isinstance(d.get(k), list) else [])
        if isinstance(v, dict)
    ]
    quota_terms = " ".join(
        str(v.get("quotaId", ""))
        + " "
        + str(v.get("quotaMetric", ""))
        + " "
        + str(v.get("description", ""))[:4096]
        for v in quota_items
    ).lower()
    quota_scope = (
        "model"
        if any(
            isinstance(v.get("quotaDimensions"), dict)
            and v["quotaDimensions"].get("model")
            for v in quota_items
        )
        else "account"
    )
    if codes & {
        "unsupported_country_region_territory",
        "region_restricted",
        "unsupported_location",
    } or re.search(
        r"(?:country|region|location).{0,45}(?:not supported|unsupported|restricted)|(?:unsupported|not supported).{0,45}(?:country|region|location)",
        message,
    ):
        reason, scope, action = (
            "region_restricted",
            "region",
            "check_supported_locations",
        )
    elif re.search(r"per.?minute|per.?second", quota_terms):
        reason, scope, action = "rate_limited", quota_scope, "retry_later"
    elif re.search(r"per.?day|per.?month", quota_terms):
        reason, scope, action = "quota_exhausted", quota_scope, "check_billing"
    elif codes & {
        "insufficient_quota",
        "quota_exceeded",
        "billing_hard_limit_reached",
        "credit_balance_too_low",
        "organization_usage_limit_exceeded",
    } or re.search(
        r"(?:credit balance.{0,25}(?:low|insufficient)|insufficient (?:credits|funds)|(?:daily |monthly )quota.{0,25}(?:exceeded|exhausted))",
        message,
    ):
        reason, scope, action = "quota_exhausted", "account", "check_billing"
    elif codes & {
        "rate_limit_exceeded",
        "rate_limit_error",
        "rate_limited",
        "slow_down",
    } or re.search(r"rate limit|too many requests", message):
        reason, scope, action = "rate_limited", "unknown", "retry_later"
    elif codes & {
        "invalid_api_key",
        "api_key_invalid",
        "authentication_error",
        "unauthenticated",
    } or re.search(
        r"api key (?:not valid|is invalid|is not valid)|invalid api key", message
    ):
        reason, scope, action = "invalid_credentials", "account", "check_credentials"
    elif "model_access_denied" in codes:
        reason, scope, action = "access_denied", "model", "check_model_access"
    elif re.search(
        r"only.{0,30}(?:existing|legacy|old) (?:users|customers|accounts)|(?:existing|legacy) (?:users|customers|accounts) only",
        message,
    ):
        reason, scope, action = "access_denied", "account", "check_model_access"
    elif codes & {"permission_denied", "access_denied", "permission_error"}:
        reason, scope, action = "access_denied", "unknown", "check_model_access"
    elif codes & {
        "content_policy_violation",
        "safety",
        "blocked_reason",
        "policy_violation",
    }:
        reason, scope, action = "policy_restricted", "request", "review_policy"
    elif codes & {"model_not_found", "not_found"}:
        reason, scope, action = (
            "model_not_found_or_inaccessible",
            "unknown",
            "check_model_id_and_access",
        )
    elif codes & {"unsupported_operation", "not_supported"}:
        reason, scope, action = "unsupported_operation", "request", "check_operation"
    elif codes & {"invalid_argument", "invalid_request_error"}:
        reason, scope, action = "invalid_request", "request", "check_settings"
    elif codes & {"overloaded_error", "unavailable", "api_error", "internal"}:
        reason, scope, action = "provider_unavailable", "provider", "retry_later"
    if reason != "unknown":
        certainty, source = "explicit", "provider_code"
    elif type(status) is int:
        certainty, source = "inferred", "http_status"
        mapping = {
            401: ("invalid_credentials", "account", "check_credentials"),
            402: ("quota_exhausted", "account", "check_billing"),
            403: ("access_denied", "unknown", "check_model_access"),
            404: (
                "model_not_found_or_inaccessible",
                "unknown",
                "check_model_id_and_access",
            ),
            400: ("invalid_request", "request", "check_settings"),
            422: ("invalid_request", "request", "check_settings"),
        }
        if status in mapping:
            reason, scope, action = mapping[status]
        elif status == 429:
            action, certainty = "check_limits", "unknown"
        elif status >= 500:
            reason, scope, action = "provider_unavailable", "provider", "retry_later"
    else:
        mapping = {
            "CREDENTIAL_ERROR": ("invalid_credentials", "account", "check_credentials"),
            "INVALID_REQUEST": ("invalid_request", "request", "check_settings"),
            "UNSUPPORTED_OPERATION": (
                "unsupported_operation",
                "request",
                "check_operation",
            ),
            "NETWORK_ERROR": ("network_error", "client", "check_network"),
            "TIMEOUT": ("timeout", "unknown", "retry_later"),
            "INVALID_RESPONSE": ("invalid_response", "unknown", "review_response"),
            "EMPTY_RESPONSE": ("empty_response", "unknown", "review_response"),
            "POLICY_RESTRICTED": ("policy_restricted", "request", "review_policy"),
        }
        if value.get("code") in mapping:
            reason, scope, action = mapping[value["code"]]
            certainty = "explicit"
    delay = None
    if isinstance(retry_after, str) and retry_after.strip():
        try:
            n = (
                float(retry_after)
                if re.fullmatch(r"\d+(\.\d+)?", retry_after.strip())
                else (parsedate_to_datetime(retry_after).timestamp() * 1000 - now)
                / 1000
            )
            if math.isfinite(n) and 0 <= n <= 604800:
                delay = math.ceil(n)
        except (ValueError, TypeError, OverflowError):
            pass
    if delay is None:
        duration = next(
            (
                d.get("retryDelay")
                for d in details
                if isinstance(d, dict) and isinstance(d.get("retryDelay"), str)
            ),
            "",
        )
        if re.fullmatch(r"\d+(\.\d+)?s", duration):
            n = float(duration[:-1])
            if n <= 604800:
                delay = math.ceil(n)
    blocked = {
        "invalid_credentials",
        "quota_exhausted",
        "rate_limited",
        "access_denied",
        "region_restricted",
        "policy_restricted",
        "model_not_found_or_inaccessible",
        "invalid_request",
        "unsupported_operation",
    }
    outcome = (
        "canceled"
        if value.get("code") == "CANCELED"
        else "blocked"
        if reason in blocked or status == 429
        else "inconclusive"
    )
    result = {
        "outcome": outcome,
        "reason": reason,
        "scope": scope,
        "certainty": certainty,
        "source": source,
        "classifierVersion": CLASSIFIER_VERSION,
        "retry": {
            "action": "none" if outcome == "canceled" else action,
            "afterSeconds": delay,
        },
    }
    if type(status) is int and 100 <= status <= 599:
        result["httpStatus"] = status
    return cast(VerificationAttempt, result)


def _valid_assessment(a):
    if (
        not isinstance(a, dict)
        or set(a) - {"attempt", "checks", "phases"}
        or not valid_attempt(a.get("attempt"))
    ):
        return False
    checks = a.get("checks")
    if (
        not isinstance(checks, dict)
        or set(checks) != {"textGeneration", "speed"}
        or any(
            v not in {"passed", "blocked", "inconclusive", "not_run"}
            for v in checks.values()
        )
    ):
        return False
    outcome = a["attempt"]["outcome"]
    if (
        outcome == "succeeded"
        and (
            checks["textGeneration"] != "passed"
            or checks["speed"] not in {"passed", "not_run"}
        )
        or outcome == "partial"
        and (checks["textGeneration"] != "passed" or checks["speed"] == "passed")
        or outcome in {"blocked", "inconclusive", "canceled", "skipped"}
        and checks["textGeneration"] == "passed"
    ):
        return False
    phases = a.get("phases", [])
    return (
        isinstance(phases, list)
        and len(phases) <= 2
        and all(
            isinstance(p, dict)
            and set(p) == {"phase", "attempt"}
            and p["phase"] in {"baseline", "generation"}
            and valid_attempt(p["attempt"])
            for p in phases
        )
    )


def valid_assessment(a):
    try:
        return _valid_assessment(a)
    except (TypeError, KeyError):
        return False


def text_was_verified(r):
    return (
        r["assessment"]["checks"].get("textGeneration") == "passed"
        if r.get("assessment")
        else r["result"] == "passed"
    )


def community_assessment(records, *, now, max_age_days=90):
    stamp = lambda r: datetime.fromisoformat(
        r["checkedAt"].replace("Z", "+00:00")
    ).timestamp()
    calls = sorted(
        [
            r
            for r in records
            if "textGeneration" in r["checks"]
            and stamp(r) <= now
            and r.get("assessment", {}).get("attempt", {}).get("outcome")
            not in {"canceled", "skipped"}
        ],
        key=lambda r: (-stamp(r), r["id"]),
    )
    fresh = [r for r in calls if now - stamp(r) <= max_age_days * 86400]
    successes = [r for r in fresh if text_was_verified(r)]
    issues = [
        r
        for r in calls
        if (
            not r.get("assessment", {}).get("phases")
            or r["assessment"]["phases"][-1]["attempt"]["outcome"] != "canceled"
        )
        and (
            r.get("assessment", {}).get("attempt", {}).get("reason")
            or not text_was_verified(r)
        )
        and now - stamp(r) <= 7 * 86400
    ]
    counts = {}
    for r in issues:
        reason = r.get("assessment", {}).get("attempt", {}).get("reason") or "unknown"
        counts[reason] = counts.get(reason, 0) + 1
    identities = {
        m.group(1)
        if (m := re.match(r"^website:([1-9]\d*):", r["id"]))
        else r["contributor"].lower()
        for r in successes
    }
    return {
        "status": "verified"
        if successes
        else "issues_reported"
        if fresh
        else "stale"
        if calls
        else "unverified",
        "lastSuccessAt": next(
            (r["checkedAt"] for r in calls if text_was_verified(r)), None
        ),
        "successfulContributors": len(identities),
        "recentIssues": counts,
        "issueWindowDays": 7,
        "latest": calls[0] if calls else None,
        "latestSuccess": successes[0] if successes else None,
    }
