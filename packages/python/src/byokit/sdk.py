"""Reusable protocol clients; credentials stay in client memory, never storage."""

import copy
import time
from .inference import call, call_claude, prepare_call, CallError, validate_headers
from .types import (
    CallOptions,
    ChatMessage,
    ClaudeMessage,
    FunctionTool,
    ClaudeTool,
    TextBlock,
)
from typing import Any, Callable, Literal, cast
from .enums import ApiProtocol


def _invalid(message):
    raise CallError("INVALID_REQUEST", message)


class _Credential:
    """Keep secrets out of attribute dumps and refuse generic serialization."""

    __slots__ = ("__value",)

    def __init__(self, value):
        self.__value = value

    def reveal(self):
        return self.__value

    def __repr__(self):
        return "<byokit credential: redacted>"

    def __getstate__(self):
        raise TypeError("BYOKit credentials cannot be serialized.")

    def __reduce_ex__(self, protocol):
        raise TypeError("BYOKit credentials cannot be serialized.")


def _check_options(options):
    if not isinstance(options, dict) or set(options) - {
        "check_budget",
        "runtime_checks",
        "timeout_ms",
        "cancel_event",
        "input_tokens",
        "overhead_tokens",
        "on_warning",
        "headers",
        "allow_insecure_http",
    }:
        _invalid("Unsupported client request option.")


class _Request:
    def __init__(self, model, source, defaults, format):
        self._model = copy.deepcopy(model)
        self._source = _Credential(source)
        _check_options(defaults)
        self._defaults = dict(defaults)
        self._format = format

    def _create(
        self, params: dict, model: str | None, options: CallOptions | None
    ) -> dict:
        params = copy.deepcopy(params)
        selected = copy.deepcopy(self._model)
        if model is not None and model != selected["apiModelId"]:
            if not isinstance(model, str) or not model.strip():
                _invalid("model must be an API model ID.")
            selected.update(
                id=selected["providerId"] + "/" + model,
                apiModelId=model,
                limits=dict(
                    context=None, input=None, output=None, contextAccounting="unknown"
                ),
                features={},
            )
            selected.pop("status", None)
        opts = {**self._defaults, **(options or {})}
        if set(opts) - {
            "check_budget",
            "runtime_checks",
            "timeout_ms",
            "cancel_event",
            "input_tokens",
            "overhead_tokens",
            "on_warning",
            "headers",
            "allow_insecure_http",
        }:
            _invalid("Unsupported client request option.")
        cancel = opts.get("cancel_event")
        if cancel and cancel.is_set():
            raise CallError("CANCELED", "Call canceled.")
        prepare_call(
            selected,
            params,
            format=self._format,
            runtime_checks=opts.get("runtime_checks", False),
            check_budget=opts.get("check_budget", False),
            input_tokens=opts.get("input_tokens"),
            overhead_tokens=opts.get("overhead_tokens", 0),
        )
        # Synchronous Python callbacks should read an already-available application key.
        # They run on the caller’s thread; blocking callback work is owned by the application.
        started = time.monotonic()
        try:
            key = self._source.reveal()()
        except Exception:
            raise CallError(
                "CREDENTIAL_ERROR", "Could not obtain the API key."
            ) from None
        if not isinstance(key, str):
            _invalid("The API key callback must return a string.")
        remaining = opts.get("timeout_ms", 90000) - (time.monotonic() - started) * 1000
        if remaining <= 0:
            raise CallError("TIMEOUT", "Call timed out.")
        opts["timeout_ms"] = remaining
        return (call_claude if self._format == "claude" else call)(
            selected, params, key, opts
        )


class _Completions(_Request):
    def create(
        self,
        *,
        messages: list[ChatMessage],
        model: str | None = None,
        max_tokens: int | None = None,
        max_completion_tokens: int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        stop: str | list[str] | None = None,
        tools: list[FunctionTool] | None = None,
        tool_choice: Literal["auto", "none", "required"] | dict | None = None,
        stream: Literal[False] = False,
        options: CallOptions | None = None,
    ) -> dict:
        fields = locals()
        params = {
            k: v
            for k, v in fields.items()
            if k not in ["self", "model", "options"] and v is not None
        }
        return self._create(params, model, options)


class _Messages(_Request):
    def create(
        self,
        *,
        messages: list[ClaudeMessage],
        model: str | None = None,
        system: str | list[TextBlock] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        stop_sequences: list[str] | None = None,
        tools: list[ClaudeTool] | None = None,
        tool_choice: dict | None = None,
        stream: Literal[False] = False,
        options: CallOptions | None = None,
    ) -> dict:
        fields = locals()
        params = {
            k: v
            for k, v in fields.items()
            if k not in ["self", "model", "options"] and v is not None
        }
        return self._create(params, model, options)


class _Chat:
    def __init__(self, completions: _Completions):
        self.completions = completions


class _LegacyOpenAI:
    def __init__(
        self, *, model: dict, api_key: Callable[[], str] | None = None, **options
    ):
        if not isinstance(model, dict):
            _invalid("Select a model from get_models().")
        source = (
            api_key
            if api_key is not None
            else (lambda: "")
            if model.get("local")
            else None
        )
        if not callable(source):
            _invalid("api_key must be a callback; clients do not retain key strings.")
        self.chat = _Chat(_Completions(model, source, options, "openai"))


class _LegacyAnthropic:
    def __init__(
        self, *, model: dict, api_key: Callable[[], str] | None = None, **options
    ):
        if not isinstance(model, dict):
            _invalid("Select a model from get_models().")
        source = (
            api_key
            if api_key is not None
            else (lambda: "")
            if model.get("local")
            else None
        )
        if not callable(source):
            _invalid("api_key must be a callback; clients do not retain key strings.")
        self.messages = _Messages(model, source, options, "claude")


def openAI(**config) -> _LegacyOpenAI:
    return _LegacyOpenAI(**config)


def claude(**config) -> _LegacyAnthropic:
    return _LegacyAnthropic(**config)


class _ByokitRequest:
    def __init__(self, defaults: CallOptions, format: str):
        self._defaults = dict(defaults)
        self._format = format

    def _create(
        self,
        params: dict,
        model: dict,
        api_key: str | None,
        options: CallOptions | None,
    ) -> dict:
        if not isinstance(model, dict):
            _invalid("Provide a model object from get_models().")
        if options is not None:
            _check_options(options)
        # Capture the exact offering and input, never retain either on the client.
        try:
            selected, params = copy.deepcopy(model), copy.deepcopy(params)
        except Exception:
            raise CallError(
                "INVALID_REQUEST", "Request and model must contain copyable data."
            ) from None
        opts = {**self._defaults, **(options or {})}
        if "runtime_checks" in opts and not isinstance(opts["runtime_checks"], bool):
            _invalid("runtime_checks must be boolean.")
        if "check_budget" in opts and not isinstance(opts["check_budget"], bool):
            _invalid("check_budget must be boolean.")
        import math

        timeout = opts.get("timeout_ms", 90000)
        if (
            not isinstance(timeout, (int, float))
            or isinstance(timeout, bool)
            or not math.isfinite(timeout)
            or timeout <= 0
        ):
            _invalid("timeout_ms must be positive.")
        return (call_claude if self._format == "claude" else call)(
            selected, params, "" if api_key is None else api_key, opts
        )


class _ByokitCompletions(_ByokitRequest):
    def create(
        self,
        *,
        model: dict,
        messages: list[ChatMessage],
        api_key: str | None = None,
        max_tokens: int | None = None,
        max_completion_tokens: int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        stop: str | list[str] | None = None,
        tools: list[FunctionTool] | None = None,
        tool_choice: Literal["auto", "none", "required"] | dict | None = None,
        stream: Literal[False] = False,
        options: CallOptions | None = None,
    ) -> dict:
        params = {
            k: v
            for k, v in locals().items()
            if k not in ["self", "model", "api_key", "options"] and v is not None
        }
        return self._create(params, model, api_key, options)


class _ByokitMessages(_ByokitRequest):
    def create(
        self,
        *,
        model: dict,
        messages: list[ClaudeMessage],
        api_key: str | None = None,
        system: str | list[TextBlock] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        stop_sequences: list[str] | None = None,
        tools: list[ClaudeTool] | None = None,
        tool_choice: dict | None = None,
        stream: Literal[False] = False,
        options: CallOptions | None = None,
    ) -> dict:
        params = {
            k: v
            for k, v in locals().items()
            if k not in ["self", "model", "api_key", "options"] and v is not None
        }
        return self._create(params, model, api_key, options)


class _ByokitChat:
    def __init__(self, completions: _ByokitCompletions):
        self.completions = completions


class Byokit:
    """Deprecated per-request client; prefer OpenAI/Anthropic constructor credentials."""

    def __init__(
        self,
        *,
        runtime_checks: bool = False,
        check_budget: bool = False,
        timeout_ms: float = 90000,
    ):
        import math

        if not isinstance(runtime_checks, bool):
            _invalid("runtime_checks must be boolean.")
        if not isinstance(check_budget, bool):
            _invalid("check_budget must be boolean.")
        if (
            not isinstance(timeout_ms, (int, float))
            or isinstance(timeout_ms, bool)
            or not math.isfinite(timeout_ms)
            or timeout_ms <= 0
        ):
            _invalid("timeout_ms must be positive.")
        defaults: CallOptions = {
            "runtime_checks": runtime_checks,
            "check_budget": check_budget,
            "timeout_ms": timeout_ms,
        }
        self.chat = _ByokitChat(_ByokitCompletions(defaults, "openai"))
        self.messages = _ByokitMessages(defaults, "claude")


class SDKResponse(dict):
    """Mapping response with SDK-style attribute access, including nested fields."""

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name) from None


def _response(value):
    if isinstance(value, dict):
        return SDKResponse({k: _response(v) for k, v in value.items()})
    if isinstance(value, list):
        return [_response(v) for v in value]
    return value


def _endpoint(value, protocol):
    from urllib.parse import urlsplit

    try:
        u = urlsplit(value)
        valid = (
            u.scheme in ["http", "https"]
            and bool(u.hostname)
            and not (u.username or u.password or u.query or u.fragment)
        )
        u.port
    except Exception:
        valid = False
    if not valid:
        _invalid("base_url must be HTTP(S), without credentials, query or fragment.")
    base = value.rstrip("/")
    if protocol == ApiProtocol.CLAUDE and not base.endswith("/v1"):
        base += "/v1"
    return base


class _StandardRequest:
    def __init__(
        self, api_key, base_url, default_headers, models, protocol, defaults, format
    ):
        if not isinstance(api_key, str):
            _invalid(
                "Provide api_key as a constructor string (empty for an unauthenticated endpoint)."
            )
        if protocol not in list(ApiProtocol):
            _invalid("Unsupported API protocol.")
        self._base_url = _endpoint(base_url, protocol)
        self._protocol = protocol
        self.__key = _Credential(api_key)
        self._headers = validate_headers(
            {} if default_headers is None else default_headers
        )
        _check_options(defaults)
        if "runtime_checks" in defaults and not isinstance(
            defaults["runtime_checks"], bool
        ):
            _invalid("runtime_checks must be boolean.")
        if "check_budget" in defaults and not isinstance(
            defaults["check_budget"], bool
        ):
            _invalid("check_budget must be boolean.")
        import math

        timeout = defaults.get("timeout_ms", 90000)
        if (
            not isinstance(timeout, (int, float))
            or isinstance(timeout, bool)
            or not math.isfinite(timeout)
            or timeout <= 0
        ):
            _invalid("timeout_ms must be positive.")
        self._defaults = dict(defaults)
        if models is not None and not isinstance(models, list):
            _invalid("models must be a list of catalog offerings.")
        self._models = {}
        for m in models or []:
            if (
                not isinstance(m, dict)
                or not isinstance(m.get("apiModelId"), str)
                or not m.get("connection")
                or _endpoint(m["connection"]["baseUrl"], m["connection"]["protocol"])
                != self._base_url
                or m["connection"]["protocol"] != protocol
                or m["apiModelId"] in self._models
            ):
                _invalid(
                    "Model metadata must uniquely match the client endpoint and protocol."
                )
            self._models[m["apiModelId"]] = copy.deepcopy(m)
        self._format = format

    def __getstate__(self):
        raise TypeError("BYOKit clients cannot be serialized; recreate them from non-secret settings.")

    def __reduce_ex__(self, protocol):
        raise TypeError("BYOKit clients cannot be serialized; recreate them from non-secret settings.")

    def _create(
        self, params: dict, model: str | None, options: CallOptions | None
    ) -> SDKResponse:
        if not isinstance(model, str) or not model.strip():
            _invalid("Provide model as an API model ID string.")
        if options is not None:
            _check_options(options)
        params = copy.deepcopy(params)
        selected = (
            copy.deepcopy(self._models.get(model))
            if model in self._models
            else dict(
                id=model,
                providerId="openai"
                if self._base_url == "https://api.openai.com/v1"
                else "custom",
                apiModelId=model,
                features={},
                limits=dict(
                    context=None, input=None, output=None, contextAccounting="unknown"
                ),
            )
        )
        selected["connection"] = dict(baseUrl=self._base_url, protocol=self._protocol)
        key = self.__key.reveal()
        if not key:
            selected["local"] = dict(endpoint=self._base_url)
        opts = {**self._defaults, **(options or {})}
        opts["headers"] = {**self._headers, **validate_headers(opts.get("headers", {}))}
        result = (call_claude if self._format == "claude" else call)(
            selected, params, key, opts
        )
        return _response(result)


class _StandardCompletions(_StandardRequest):
    def create(
        self,
        *,
        messages: list[ChatMessage],
        model: str,
        max_tokens: int | None = None,
        max_completion_tokens: int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        stop: str | list[str] | None = None,
        tools: list[FunctionTool] | None = None,
        tool_choice: Literal["auto", "none", "required"] | dict | None = None,
        stream: Literal[False] = False,
        options: CallOptions | None = None,
    ) -> SDKResponse:
        fields = locals()
        params = {
            k: v
            for k, v in fields.items()
            if k not in ["self", "model", "options"] and v is not None
        }
        return self._create(params, model, options)


class _StandardMessages(_StandardRequest):
    def create(
        self,
        *,
        messages: list[ClaudeMessage],
        model: str,
        system: str | list[TextBlock] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        stop_sequences: list[str] | None = None,
        tools: list[ClaudeTool] | None = None,
        tool_choice: dict | None = None,
        stream: Literal[False] = False,
        options: CallOptions | None = None,
    ) -> SDKResponse:
        fields = locals()
        params = {
            k: v
            for k, v in fields.items()
            if k not in ["self", "model", "options"] and v is not None
        }
        return self._create(params, model, options)


class _StandardChat:
    def __init__(self, completions: _StandardCompletions):
        self.completions = completions


class OpenAI:
    def __init__(
        self,
        *,
        api_key: str | Callable[[], str] | None = None,
        base_url: str = "https://api.openai.com/v1",
        default_headers: dict[str, str] | None = None,
        models: list[dict] | None = None,
        protocol: ApiProtocol = ApiProtocol.OPEN_AI,
        model: dict | None = None,
        **options,
    ):
        if model is not None:
            self.chat = cast(
                _StandardChat,
                _LegacyOpenAI(model=model, api_key=api_key, **options).chat,
            )
        else:
            self.chat = _StandardChat(
                _StandardCompletions(
                    api_key,
                    base_url,
                    default_headers,
                    models,
                    protocol,
                    options,
                    "openai",
                )
            )


class Anthropic:
    def __init__(
        self,
        *,
        api_key: str | Callable[[], str] | None = None,
        base_url: str = "https://api.anthropic.com",
        default_headers: dict[str, str] | None = None,
        models: list[dict] | None = None,
        protocol: ApiProtocol = ApiProtocol.CLAUDE,
        model: dict | None = None,
        **options,
    ):
        if model is not None:
            self.messages = cast(
                _StandardMessages,
                _LegacyAnthropic(model=model, api_key=api_key, **options).messages,
            )
        else:
            self.messages = _StandardMessages(
                api_key, base_url, default_headers, models, protocol, options, "claude"
            )
