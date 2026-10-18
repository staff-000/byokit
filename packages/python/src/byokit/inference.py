"""Stateless calls. No clients, credential stores, retries, or response logging."""

import copy
import json
import math
import threading
import time
import urllib.request
import urllib.error
import urllib.parse
import http.client
import warnings
import uuid
from .verification import classify_verification_error
from .enums import ApiProtocol
from .types import ChatInput, ClaudeInput, CallOptions

PROVIDERS = {
    "openai": ("https://api.openai.com/v1", ApiProtocol.OPEN_AI),
    "anthropic": ("https://api.anthropic.com/v1", ApiProtocol.CLAUDE),
    "google": ("https://generativelanguage.googleapis.com/v1beta", ApiProtocol.GEMINI),
    "openrouter": ("https://openrouter.ai/api/v1", ApiProtocol.OPEN_AI),
    "deepseek": ("https://api.deepseek.com/v1", ApiProtocol.OPEN_AI),
    "mistral": ("https://api.mistral.ai/v1", ApiProtocol.OPEN_AI),
    "groq": ("https://api.groq.com/openai/v1", ApiProtocol.OPEN_AI),
    "zhipuai": ("https://open.bigmodel.cn/api/paas/v4", ApiProtocol.OPEN_AI),
    "siliconflow": ("https://api.siliconflow.cn/v1", ApiProtocol.OPEN_AI),
}


class CallError(Exception):
    def __init__(self, code, message, diagnostics=None, status=None):
        super().__init__(message)
        self.code = code
        self.diagnostics = diagnostics or []
        self.status = status
        self.attempt = classify_verification_error({"code":code,"status":status})


def connection_for(model):
    if model.get("connection"):
        return dict(model["connection"])
    if model.get("local"):
        local = model["local"]
        base = local.get("endpoint", "").rstrip("/")
        protocol = (
            ApiProtocol.OLLAMA if local.get("api") == "ollama" else ApiProtocol.OPEN_AI
        )
        if base and protocol == ApiProtocol.OPEN_AI and not base.endswith("/v1"):
            base += "/v1"
        if protocol == ApiProtocol.OLLAMA and base.endswith("/v1"):
            base = base[:-3]
        return dict(baseUrl=base, protocol=protocol)
    pair = PROVIDERS.get(model["providerId"])
    return dict(baseUrl=pair[0], protocol=pair[1]) if pair else None


def _fail(message):
    raise CallError("INVALID_REQUEST", message)


def _keys(value, allowed):
    if not isinstance(value, dict) or set(value) - set(allowed):
        _fail("Unsupported or malformed request parameter.")


def _text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        for b in value:
            _keys(b, ["type", "text"])
            if b.get("type") != "text" or not isinstance(b.get("text"), str):
                _fail("Only text content is supported.")
        return "".join(b["text"] for b in value)
    _fail("Expected text content.")


def _tool_call(t):
    _keys(t, ["id", "type", "function"])
    _keys(t.get("function"), ["name", "arguments"])
    if (
        not isinstance(t.get("id"), str)
        or not t["id"]
        or t.get("type") != "function"
        or not isinstance(t["function"].get("name"), str)
        or not t["function"]["name"]
    ):
        _fail("Invalid tool call.")
    try:
        args = json.loads(t["function"]["arguments"])
    except (ValueError, KeyError, TypeError):
        _fail("Tool arguments must be JSON.")
    if not isinstance(args, dict):
        _fail("Tool arguments must be an object.")
    return copy.deepcopy(t)


def _normalize(input, format):
    if format not in ["openai", "claude"]:
        _fail("Unsupported input format.")
    p = (
        {"messages": [{"role": "user", "content": input}]}
        if isinstance(input, str)
        else input
    )
    _keys(
        p,
        [
            "messages",
            "system",
            "max_tokens",
            "temperature",
            "top_p",
            "top_k",
            "stop_sequences",
            "tools",
            "tool_choice",
            "stream",
        ]
        if format == "claude"
        else [
            "messages",
            "max_tokens",
            "max_completion_tokens",
            "temperature",
            "top_p",
            "stop",
            "tools",
            "tool_choice",
            "stream",
        ],
    )
    if p.get("stream", False) is not False:
        _fail("Streaming is not supported.")
    if not isinstance(p.get("messages"), list) or not p["messages"]:
        _fail("Provide at least one message.")
    if "max_tokens" in p and "max_completion_tokens" in p:
        _fail("Specify one output limit.")
    messages = []
    if format == "claude" and "system" in p:
        messages.append(dict(role="system", content=_text(p["system"])))
    for m in p["messages"]:
        _keys(
            m,
            ["role", "content"]
            if format == "claude"
            else ["role", "content", "tool_calls", "tool_call_id"],
        )
        role = m.get("role")
        if format == "claude":
            if role not in ["user", "assistant"]:
                _fail("Invalid Claude role.")
            if isinstance(m.get("content"), str):
                messages.append(dict(role=role, content=m["content"]))
                continue
            if not isinstance(m.get("content"), list):
                _fail("Invalid Claude content.")
            chunks = []
            calls = []

            def flush():
                if chunks or calls:
                    messages.append(
                        dict(
                            role=role,
                            content="".join(chunks),
                            **({"tool_calls": copy.deepcopy(calls)} if calls else {}),
                        )
                    )
                chunks.clear()
                calls.clear()

            for b in m["content"]:
                if b.get("type") == "text":
                    chunks.append(_text([b]))
                elif b.get("type") == "tool_use":
                    _keys(b, ["type", "id", "name", "input"])
                    if role != "assistant" or not isinstance(b.get("input"), dict):
                        _fail("Invalid tool use.")
                    calls.append(
                        _tool_call(
                            dict(
                                id=b.get("id"),
                                type="function",
                                function=dict(
                                    name=b.get("name"), arguments=json.dumps(b["input"])
                                ),
                            )
                        )
                    )
                elif b.get("type") == "tool_result":
                    _keys(b, ["type", "tool_use_id", "content"])
                    if role != "user" or not isinstance(b.get("tool_use_id"), str):
                        _fail("Invalid tool result.")
                    flush()
                    messages.append(
                        dict(
                            role="tool",
                            tool_call_id=b["tool_use_id"],
                            content=_text(b.get("content")),
                        )
                    )
                else:
                    _fail("Unsupported Claude content block.")
            flush()
        else:
            if role not in ["system", "developer", "user", "assistant", "tool"]:
                _fail("Invalid role.")
            content = (
                ""
                if role == "assistant" and m.get("content") is None
                else _text(m.get("content"))
            )
            if role == "tool" and not isinstance(m.get("tool_call_id"), str):
                _fail("Tool result needs an ID.")
            if "tool_calls" in m and (
                role != "assistant" or not isinstance(m["tool_calls"], list)
            ):
                _fail("Invalid tool calls.")
            messages.append(
                dict(
                    role=role,
                    content=content,
                    **(
                        {"tool_call_id": m["tool_call_id"]}
                        if "tool_call_id" in m
                        else {}
                    ),
                    **(
                        {"tool_calls": [_tool_call(t) for t in m["tool_calls"]]}
                        if "tool_calls" in m
                        else {}
                    ),
                )
            )
    tools = []
    for t in p.get("tools", []):
        if format == "claude":
            _keys(t, ["name", "description", "input_schema"])
            f = dict(
                name=t.get("name"),
                parameters=t.get("input_schema"),
                **({"description": t["description"]} if "description" in t else {}),
            )
        else:
            _keys(t, ["type", "function"])
            f = t.get("function")
            _keys(f, ["name", "description", "parameters"])
            if t.get("type") != "function":
                _fail("Only function tools are supported.")
        if (
            not isinstance(f.get("name"), str)
            or not f["name"]
            or not isinstance(f.get("parameters"), dict)
        ):
            _fail("Invalid tool definition.")
        tools.append(dict(type="function", function=copy.deepcopy(f)))
    if (
        format == "claude"
        and isinstance(p.get("tool_choice"), dict)
        and p["tool_choice"].get("type") != "tool"
        and "name" in p["tool_choice"]
    ):
        _fail("Only named tool choices accept name.")
    choice = p.get("tool_choice")
    if format == "claude" and choice is not None:
        _keys(choice, ["type", "name"])
        kind = choice.get("type")
        if kind in ["auto", "any", "none"]:
            choice = {"auto": "auto", "any": "required", "none": "none"}[kind]
        elif kind == "tool" and isinstance(choice.get("name"), str):
            choice = dict(type="function", function=dict(name=choice["name"]))
        else:
            _fail("Unsupported tool choice.")
    if choice is not None and choice not in ["auto", "none", "required"]:
        _keys(choice, ["type", "function"])
        _keys(choice.get("function"), ["name"])
        if choice.get("type") != "function" or not isinstance(
            choice["function"].get("name"), str
        ):
            _fail("Invalid tool choice.")
    if choice is not None and not tools:
        _fail("Tool choice requires tools.")
    limit = p.get("max_completion_tokens", p.get("max_tokens"))
    if limit is not None and (
        not isinstance(limit, int) or isinstance(limit, bool) or limit <= 0
    ):
        _fail("Invalid output limit.")
    sampling = {k: p[k] for k in ["temperature", "top_p", "top_k"] if k in p}
    for k, v in sampling.items():
        if (
            isinstance(v, bool)
            or not isinstance(v, (int, float))
            or not math.isfinite(v)
            or v < 0
            or k == "top_p"
            and v > 1
            or k == "top_k"
            and not isinstance(v, int)
        ):
            _fail("Invalid sampling parameter.")
    stop = p.get("stop_sequences", p.get("stop"))
    if stop is not None:
        if isinstance(stop, str):
            stop = [stop]
        if not isinstance(stop, list) or any(not isinstance(s, str) for s in stop):
            _fail("Invalid stop sequences.")
    return dict(
        messages=messages,
        tools=tools,
        choice=choice,
        limit=limit,
        stop=stop,
        **sampling,
    )


def prepare_call(
    model,
    input,
    *,
    format="openai",
    runtime_checks=False,
    check_budget=False,
    input_tokens=None,
    overhead_tokens=0,
):
    from . import check_fit

    if (
        not isinstance(model, dict)
        or not isinstance(model.get("apiModelId"), str)
        or not model["apiModelId"]
    ):
        _fail("Select a configured model.")
    if model.get("callSupport", {}).get("textGeneration") is False:
        _fail(model["callSupport"].get("reason") or "Text generation is unsupported for this catalog model.")
    c = model.get("connection") or connection_for(model)
    if not c or not c.get("baseUrl"):
        _fail("Configure the model endpoint first.")
    u = urllib.parse.urlsplit(c["baseUrl"])
    if (
        u.scheme not in ["http", "https"]
        or not u.hostname
        or u.username
        or u.password
        or u.query
        or u.fragment
    ):
        _fail("Invalid endpoint.")
    if not isinstance(runtime_checks, bool):
        _fail("runtime_checks must be boolean.")
    if not isinstance(check_budget, bool):
        _fail("check_budget must be boolean.")
    should_check = runtime_checks or check_budget
    protocol = c["protocol"]
    if protocol not in list(ApiProtocol):
        _fail("Unsupported API protocol.")
    p = _normalize(input, format)
    limit = p["limit"] or min(1024, model.get("limits", {}).get("output") or 1024)
    if "top_k" in p and protocol == ApiProtocol.OPEN_AI:
        _fail("top_k is unsupported by this adapter.")
    body = {"model": model["apiModelId"]}
    sampling = {k: p[k] for k in ["temperature", "top_p", "top_k"] if k in p}
    if protocol == ApiProtocol.CLAUDE:
        system = "\n".join(
            m["content"] for m in p["messages"] if m["role"] in ["system", "developer"]
        )
        messages = []
        for m in p["messages"]:
            if m["role"] in ["system", "developer"]:
                continue
            role = "user" if m["role"] == "tool" else m["role"]
            content = (
                [
                    dict(
                        type="tool_result",
                        tool_use_id=m["tool_call_id"],
                        content=m["content"],
                    )
                ]
                if m["role"] == "tool"
                else ([dict(type="text", text=m["content"])] if m["content"] else [])
                + [
                    dict(
                        type="tool_use",
                        id=t["id"],
                        name=t["function"]["name"],
                        input=json.loads(t["function"]["arguments"]),
                    )
                    for t in m.get("tool_calls", [])
                ]
            )
            if messages and messages[-1]["role"] == role:
                messages[-1]["content"].extend(content)
            else:
                messages.append(dict(role=role, content=content))
        body.update(messages=messages, max_tokens=limit, stream=False, **sampling)
        if system:
            body["system"] = system
        if p["stop"] is not None:
            body["stop_sequences"] = p["stop"]
        if p["tools"]:
            body["tools"] = [
                dict(
                    name=t["function"]["name"],
                    input_schema=t["function"]["parameters"],
                    **(
                        {"description": t["function"]["description"]}
                        if "description" in t["function"]
                        else {}
                    ),
                )
                for t in p["tools"]
            ]
        if p["choice"] is not None:
            body["tool_choice"] = (
                {
                    "type": {"auto": "auto", "required": "any", "none": "none"}[
                        p["choice"]
                    ]
                }
                if isinstance(p["choice"], str)
                else dict(type="tool", name=p["choice"]["function"]["name"])
            )
        path = "/messages"
    elif protocol == ApiProtocol.GEMINI:
        system = "\n".join(
            m["content"] for m in p["messages"] if m["role"] in ["system", "developer"]
        )
        contents = []
        names = {
            t["id"]: t["function"]["name"]
            for m in p["messages"]
            for t in m.get("tool_calls", [])
        }
        for m in p["messages"]:
            if m["role"] in ["system", "developer"]:
                continue
            if m["role"] == "tool":
                if m["tool_call_id"] not in names:
                    _fail("Gemini tool result needs its preceding call.")
                try:
                    response = json.loads(m["content"])
                except ValueError:
                    response = {"result": m["content"]}
                parts = [
                    dict(
                        functionResponse=dict(
                            name=names[m["tool_call_id"]],
                            response=response
                            if isinstance(response, dict)
                            else {"result": response},
                        )
                    )
                ]
            else:
                parts = ([{"text": m["content"]}] if m["content"] else []) + [
                    dict(
                        functionCall=dict(
                            name=t["function"]["name"],
                            args=json.loads(t["function"]["arguments"]),
                        )
                    )
                    for t in m.get("tool_calls", [])
                ]
            contents.append(
                dict(role="model" if m["role"] == "assistant" else "user", parts=parts)
            )
        body = dict(
            contents=contents,
            generationConfig={
                "maxOutputTokens": limit,
                **{
                    {"temperature": "temperature", "top_p": "topP", "top_k": "topK"}[
                        k
                    ]: v
                    for k, v in sampling.items()
                },
            },
        )
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        if p["stop"] is not None:
            body["generationConfig"]["stopSequences"] = p["stop"]
        if p["tools"]:
            body["tools"] = [
                {
                    "functionDeclarations": [
                        dict(
                            name=t["function"]["name"],
                            parameters=t["function"]["parameters"],
                            **(
                                {"description": t["function"]["description"]}
                                if "description" in t["function"]
                                else {}
                            ),
                        )
                        for t in p["tools"]
                    ]
                }
            ]
        if p["choice"] is not None:
            body["toolConfig"] = {
                "functionCallingConfig": {
                    "mode": {"auto": "AUTO", "none": "NONE", "required": "ANY"}[
                        p["choice"]
                    ]
                    if isinstance(p["choice"], str)
                    else "ANY",
                    **(
                        {"allowedFunctionNames": [p["choice"]["function"]["name"]]}
                        if isinstance(p["choice"], dict)
                        else {}
                    ),
                }
            }
        path = (
            "/models/"
            + urllib.parse.quote(model["apiModelId"].removeprefix("models/"), safe="")
            + ":generateContent"
        )
    elif protocol == ApiProtocol.OLLAMA:
        if p["choice"] is not None:
            _fail("tool_choice is unsupported by Ollama adapter.")
        names = {
            t["id"]: t["function"]["name"]
            for m in p["messages"]
            for t in m.get("tool_calls", [])
        }
        messages = copy.deepcopy(p["messages"])
        for m in messages:
            if m["role"] == "tool":
                if m["tool_call_id"] not in names:
                    _fail("Ollama tool result needs its preceding call.")
                m["tool_name"] = names[m.pop("tool_call_id")]
            for t in m.get("tool_calls", []):
                t["function"]["arguments"] = json.loads(t["function"]["arguments"])
                t.pop("id", None)
                t.pop("type", None)
        body.update(
            messages=messages, stream=False, options=dict(num_predict=limit, **sampling)
        )
        if p["stop"] is not None:
            body["options"]["stop"] = p["stop"]
        if p["tools"]:
            body["tools"] = p["tools"]
        path = "/api/chat"
    else:
        body.update(messages=p["messages"], stream=False, **sampling)
        body[
            "max_completion_tokens" if model["providerId"] == "openai" else "max_tokens"
        ] = limit
        if model["providerId"] == "openai":
            body["store"] = False
        if p["stop"] is not None:
            body["stop"] = p["stop"]
        if p["tools"]:
            body["tools"] = p["tools"]
        if p["choice"] is not None:
            body["tool_choice"] = p["choice"]
        path = "/chat/completions"
    diagnostics = []
    if should_check:
        budget = {"outputTokens": limit, "overheadTokens": overhead_tokens}
        if input_tokens is not None:
            budget["inputTokens"] = input_tokens
        fit = check_fit(
            model,
            budget,
            {"requiredFeatures": ["functionCalling"] if p["tools"] else []},
        )
        diagnostics = fit["diagnostics"]
        if input_tokens is None:
            diagnostics.append(
                dict(
                    code="TOKEN_COUNT_UNKNOWN",
                    message="Input token count is unknown; context fit is not guaranteed.",
                    severity="warning",
                )
            )
        if fit["status"] == "exceeds":
            raise CallError(
                "MODEL_FIT_FAILED",
                "Request exceeds known model limits or capabilities.",
                diagnostics,
            )
    return dict(
        url=c["baseUrl"].rstrip("/") + path,
        body=body,
        protocol=protocol,
        diagnostics=diagnostics,
    )


def _parse(data, protocol, model):
    if (
        not isinstance(data, dict)
        or data.get("error")
        or data.get("status") == "failed"
    ):
        raise CallError("INVALID_RESPONSE", "Invalid provider response.")
    content = ""
    calls = []
    finish = "stop"
    u = {}
    returned = data.get("model", data.get("modelVersion", model["apiModelId"]))
    reasoning_content = None
    if protocol == ApiProtocol.CLAUDE:
        for b in data["content"]:
            if b["type"] == "text":
                content += b["text"]
            elif b["type"] == "tool_use":
                calls.append(
                    dict(
                        id=b["id"],
                        type="function",
                        function=dict(name=b["name"], arguments=json.dumps(b["input"])),
                    )
                )
            else:
                raise CallError(
                    "UNSUPPORTED_RESPONSE", "Unsupported provider content block."
                )
        finish = {
            "end_turn": "stop",
            "stop_sequence": "stop",
            "max_tokens": "length",
            "tool_use": "tool_calls",
        }.get(data.get("stop_reason"), "stop")
        u = dict(
            prompt_tokens=data.get("usage", {}).get("input_tokens"),
            completion_tokens=data.get("usage", {}).get("output_tokens"),
        )
    elif protocol == ApiProtocol.GEMINI:
        candidate = data["candidates"][0]
        thought_text = ""
        for b in candidate.get("content", {}).get("parts", []):
            if b.get("thought"):
                if "text" in b:
                    thought_text += b["text"]
                continue
            if "text" in b:
                content += b["text"]
            elif "functionCall" in b:
                calls.append(
                    dict(
                        id=b["functionCall"].get("id", "call_" + str(uuid.uuid4())),
                        type="function",
                        function=dict(
                            name=b["functionCall"]["name"],
                            arguments=json.dumps(b["functionCall"].get("args", {})),
                        ),
                    )
                )
            elif b.get("thoughtSignature") and "text" in b:
                content += b["text"]
        if thought_text:
            reasoning_content = thought_text
        if not content and not calls and thought_text:
            content = thought_text
        finish = (
            "length"
            if candidate.get("finishReason") == "MAX_TOKENS"
            else "tool_calls"
            if calls
            else "stop"
        )
        u = dict(
            prompt_tokens=data.get("usageMetadata", {}).get("promptTokenCount"),
            completion_tokens=data.get("usageMetadata", {}).get("candidatesTokenCount"),
        )
    elif protocol == ApiProtocol.OLLAMA:
        content = data["message"].get("content", "")
        calls = [
            dict(
                id=t.get("id", "call_" + str(uuid.uuid4())),
                type="function",
                function=dict(
                    name=t["function"]["name"],
                    arguments=json.dumps(t["function"]["arguments"]),
                ),
            )
            for i, t in enumerate(data["message"].get("tool_calls", []))
        ]
        finish = (
            "tool_calls"
            if calls
            else "length"
            if data.get("done_reason") == "length"
            else "stop"
        )
        u = dict(
            prompt_tokens=data.get("prompt_eval_count"),
            completion_tokens=data.get("eval_count"),
        )
    else:
        c = data["choices"][0]
        content = _text(c["message"].get("content") or "")
        if isinstance(c["message"].get("reasoning_content"), str):
            reasoning_content = c["message"]["reasoning_content"]
        calls = c["message"].get("tool_calls", [])
        finish = c.get("finish_reason", "stop")
        u = dict(
            prompt_tokens=data.get("usage", {}).get("prompt_tokens"),
            completion_tokens=data.get("usage", {}).get("completion_tokens"),
        )
    calls = [_tool_call(t) for t in calls]
    if not content.strip() and not calls:
        raise CallError("EMPTY_RESPONSE", "No visible text or tool calls.")
    usage = {
        k: v
        for k, v in u.items()
        if isinstance(v, int) and not isinstance(v, bool) and v >= 0
    }
    if len(usage) == 2:
        usage["total_tokens"] = sum(usage.values())
    return dict(
        **(
            {
                "_nativeStop": data.get("stop_reason"),
                "_stopSequence": data.get("stop_sequence"),
                "_nativeContent": [
                    dict(type="text", text=b["text"])
                    if b["type"] == "text"
                    else dict(
                        type="tool_use", id=b["id"], name=b["name"], input=b["input"]
                    )
                    for b in data["content"]
                ],
            }
            if protocol == ApiProtocol.CLAUDE
            else {}
        ),
        id=data.get("id", ""),
        object="chat.completion",
        created=int(time.time()),
        model=returned,
        choices=[
            dict(
                index=0,
                message=dict(
                    role="assistant",
                    content=content or None,
                    **({"reasoning_content": reasoning_content} if reasoning_content else {}),
                    **({"tool_calls": calls} if calls else {}),
                ),
                finish_reason=finish,
            )
        ],
        usage=usage,
    )


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def validate_headers(value):
    import re

    if not isinstance(value, dict):
        _fail("Headers must be a string map.")
    result = {}
    reserved = {
        "authorization",
        "x-api-key",
        "x-goog-api-key",
        "host",
        "cookie",
        "content-type",
        "content-length",
        "connection",
        "proxy-authorization",
        "transfer-encoding",
    }
    for name, v in value.items():
        if (
            not isinstance(name, str)
            or not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name)
            or not isinstance(v, str)
            or "\r" in v
            or "\n" in v
            or name.lower() in reserved
        ):
            _fail("Invalid or reserved HTTP header.")
        result[name.lower()] = v
    return result


def _execute(model, input, key, options, format):
    options = options or {}
    if not isinstance(key, str) or not model.get("local") and not key:
        _fail("Provide a per-call API key (empty for unauthenticated local servers).")
    timeout = options.get("timeout_ms", 90000) / 1000
    if not math.isfinite(timeout) or timeout <= 0:
        _fail("timeout_ms must be positive.")
    extra_headers = validate_headers(options.get("headers", {}))
    req = prepare_call(
        model,
        input,
        format=format,
        runtime_checks=options.get("runtime_checks", False),
        check_budget=options.get("check_budget", False),
        input_tokens=options.get("input_tokens"),
        overhead_tokens=options.get("overhead_tokens", 0),
    )
    for d in req["diagnostics"]:
        if d["severity"] == "warning":
            if options.get("on_warning"):
                options["on_warning"](d)
            else:
                warnings.warn(
                    d["code"] + ": " + d["message"], RuntimeWarning, stacklevel=3
                )
    headers = {"Content-Type": "application/json"}
    if req["protocol"] == ApiProtocol.CLAUDE:
        headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
    elif req["protocol"] == ApiProtocol.GEMINI:
        headers["x-goog-api-key"] = key
    elif key:
        headers["Authorization"] = "Bearer " + key
    headers.update(extra_headers)
    cancel = options.get("cancel_event")
    if cancel and cancel.is_set():
        raise CallError("CANCELED", "Call canceled.")
    # Native HTTP connection is owned by this call so cancellation can close it.
    u = urllib.parse.urlsplit(req["url"])
    conn = (
        http.client.HTTPSConnection
        if u.scheme == "https"
        else http.client.HTTPConnection
    )(u.hostname, u.port, timeout=timeout)
    done = threading.Event()

    def watch():
        deadline = time.monotonic() + timeout
        while not done.wait(0.05):
            if cancel and cancel.is_set() or time.monotonic() >= deadline:
                sock = conn.sock
                if sock:
                    try:
                        sock.shutdown(2)
                    except OSError:
                        pass
                conn.close()
                return

    watcher = threading.Thread(target=watch, daemon=True)
    watcher.start()
    started = time.monotonic()
    try:
        conn.request(
            "POST", u.path, body=json.dumps(req["body"]).encode(), headers=headers
        )
        response = conn.getresponse()
        if response.status < 200 or response.status >= 300:
            body = None
            try:
                raw_error = response.read(16385)
                if len(raw_error) <= 16384:
                    body = json.loads(raw_error)
            except (ValueError, OSError):
                pass
            error = CallError(
                "PROVIDER_ERROR",
                f"Provider rejected the call (HTTP {response.status}).",
                status=response.status,
            )
            error.attempt = classify_verification_error(
                {"code": error.code, "status": response.status},
                body=body,
                retry_after=response.getheader("Retry-After"),
            )
            raise error
        raw = response.read()
        if cancel and cancel.is_set():
            raise CallError("CANCELED", "Call canceled.")
        if time.monotonic() - started >= timeout:
            raise CallError("TIMEOUT", "Call timed out.")
        try:
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise CallError(
                    "INVALID_RESPONSE", "Invalid provider JSON or response."
                )
            feedback = payload.get("promptFeedback")
            candidates = (
                payload.get("candidates")
                if isinstance(payload.get("candidates"), list)
                else []
            )
            choices = (
                payload.get("choices")
                if isinstance(payload.get("choices"), list)
                else []
            )
            blocked = isinstance(feedback, dict) and feedback.get("blockReason") in {
                "SAFETY",
                "PROHIBITED_CONTENT",
                "BLOCKLIST",
                "IMAGE_SAFETY",
            }
            blocked = (
                blocked
                or payload.get("stop_reason") == "refusal"
                or any(
                    isinstance(c, dict)
                    and c.get("finishReason")
                    in {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"}
                    for c in candidates
                )
            )
            blocked = blocked or any(
                isinstance(c, dict)
                and (
                    c.get("finish_reason") == "content_filter"
                    or isinstance(c.get("message"), dict)
                    and bool(c["message"].get("refusal"))
                )
                for c in choices
            )
            if blocked:
                error = CallError(
                    "POLICY_RESTRICTED",
                    "Provider policy prevented this response.",
                    status=response.status,
                )
                error.attempt = classify_verification_error(
                    {"status": response.status},
                    body={"error": {"code": "content_policy_violation"}},
                )
                raise error
            result = _parse(payload, req["protocol"], model)
        except CallError:
            raise
        except (ValueError, KeyError, TypeError, IndexError, AttributeError):
            raise CallError(
                "INVALID_RESPONSE", "Invalid provider JSON or response."
            ) from None
        if format == "claude":
            result = _as_claude(result)
        else:
            result = {k: v for k, v in result.items() if not k.startswith("_")}

        def redact(v):
            if isinstance(v, str):
                return v.replace(key, "[redacted]") if key else v
            if isinstance(v, list):
                return [redact(x) for x in v]
            if isinstance(v, dict):
                return {k: redact(x) for k, x in v.items()}
            return v

        return redact(result)
    except CallError:
        raise
    except Exception as error:
        if isinstance(error, TimeoutError):
            raise CallError("TIMEOUT", "Call timed out.") from None
        if cancel and cancel.is_set():
            raise CallError("CANCELED", "Call canceled.") from None
        if time.monotonic() - started >= timeout:
            raise CallError("TIMEOUT", "Call timed out.") from None
        raise CallError("NETWORK_ERROR", "Could not reach the provider.") from None
    finally:
        done.set()
        conn.close()
        watcher.join(timeout=0.1)


def call(
    model: dict, input: str | ChatInput, key: str, options: CallOptions | None = None
) -> dict:
    return _execute(model, input, key, options, "openai")


def _as_claude(r):
    m = r["choices"][0]["message"]
    return dict(
        id=r["id"],
        type="message",
        role="assistant",
        model=r["model"],
        content=r.get(
            "_nativeContent",
            ([dict(type="text", text=m["content"])] if m["content"] else [])
            + [
                dict(
                    type="tool_use",
                    id=t["id"],
                    name=t["function"]["name"],
                    input=json.loads(t["function"]["arguments"]),
                )
                for t in m.get("tool_calls", [])
            ],
        ),
        stop_reason=r.get("_nativeStop")
        or {
            "stop": "end_turn",
            "length": "max_tokens",
            "tool_calls": "tool_use",
            "content_filter": "refusal",
        }.get(r["choices"][0]["finish_reason"], "end_turn"),
        stop_sequence=r.get("_stopSequence"),
        usage={
            **(
                {"input_tokens": r["usage"]["prompt_tokens"]}
                if "prompt_tokens" in r["usage"]
                else {}
            ),
            **(
                {"output_tokens": r["usage"]["completion_tokens"]}
                if "completion_tokens" in r["usage"]
                else {}
            ),
        },
    )


def call_claude(
    model: dict, input: str | ClaudeInput, key: str, options: CallOptions | None = None
) -> dict:
    return _execute(model, input, key, options, "claude")


def call_support_for(model):
    import re

    if model.get("local", {}).get("configured"):
        return {"textGeneration": True, "reason": None}
    reason = None
    modalities = model.get("modalities") or {}
    if not model.get("connection") and model.get("providerId") not in PROVIDERS:
        reason = "No reviewed provider adapter"
    elif (
        model.get("type")
        or model.get("providerShape") == "responses"
        or model.get("requiresProviderOverride")
    ):
        reason = "Unsupported model operation"
    elif any(
        (not model.get("connection") or modalities.get(direction) is not None)
        and "text" not in (modalities.get(direction) or [])
        for direction in ["input", "output"]
    ):
        reason = "Text generation is not declared"
    elif re.search(
        r"embedding|rerank|moderation|transcri|whisper|tts|realtime|(?:^|[-/])live(?:$|[-/])|audio|image|dall-e|sora|veo|computer-use|deep-research",
        model.get("apiModelId", ""),
        re.I,
    ):
        reason = "Unsupported model operation"
    return {"textGeneration": reason is None, "reason": reason}
