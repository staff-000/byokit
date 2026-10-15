"""SDK-shaped clients with application-owned, per-request credential access."""
import copy
import time
from .inference import call, call_claude, prepare_call, CallError
from .types import CallOptions, ChatMessage, ClaudeMessage, FunctionTool, ClaudeTool, TextBlock
from typing import Callable, Literal

def _invalid(message): raise CallError('INVALID_REQUEST',message)
def _check_options(options):
    if not isinstance(options,dict) or set(options)-{'runtime_checks','timeout_ms','cancel_event','input_tokens','overhead_tokens','on_warning'}: _invalid('Unsupported client request option.')
class _Request:
    def __init__(self,model,source,defaults,format):
        self._model=copy.deepcopy(model)
        self._source=source
        _check_options(defaults)
        self._defaults=dict(defaults)
        self._format=format
    def _create(self, params: dict, model: str | None, options: CallOptions | None) -> dict:
        params=copy.deepcopy(params)
        selected=copy.deepcopy(self._model)
        if model is not None and model!=selected['apiModelId']:
            if not isinstance(model,str) or not model.strip(): _invalid('model must be an API model ID.')
            selected.update(id=selected['providerId']+'/'+model,apiModelId=model,limits=dict(context=None,input=None,output=None,contextAccounting='unknown'),features={})
            selected.pop('status',None)
        opts={**self._defaults,**(options or {})}
        if set(opts)-{'runtime_checks','timeout_ms','cancel_event','input_tokens','overhead_tokens','on_warning'}: _invalid('Unsupported client request option.')
        cancel=opts.get('cancel_event')
        if cancel and cancel.is_set(): raise CallError('CANCELED','Call canceled.')
        prepare_call(selected,params,format=self._format,runtime_checks=opts.get('runtime_checks',True),input_tokens=opts.get('input_tokens'),overhead_tokens=opts.get('overhead_tokens',0))
        # Synchronous Python callbacks should read an already-available application key.
        # They run on the caller’s thread; blocking callback work is owned by the application.
        started=time.monotonic()
        try: key=self._source()
        except Exception: raise CallError('CREDENTIAL_ERROR','Could not obtain the API key.') from None
        if not isinstance(key,str): _invalid('The API key callback must return a string.')
        remaining=opts.get('timeout_ms',90000)-(time.monotonic()-started)*1000
        if remaining<=0: raise CallError('TIMEOUT','Call timed out.')
        opts['timeout_ms']=remaining
        return (call_claude if self._format=='claude' else call)(selected,params,key,opts)
class _Completions(_Request):
    def create(self, *, messages: list[ChatMessage], model: str | None = None,
               max_tokens: int | None = None, max_completion_tokens: int | None = None,
               temperature: float | None = None, top_p: float | None = None,
               stop: str | list[str] | None = None, tools: list[FunctionTool] | None = None,
               tool_choice: Literal['auto','none','required'] | dict | None = None,
               stream: Literal[False] = False, options: CallOptions | None = None) -> dict:
        fields=locals(); params={k:v for k,v in fields.items() if k not in ['self','model','options'] and v is not None}
        return self._create(params,model,options)
class _Messages(_Request):
    def create(self, *, messages: list[ClaudeMessage], model: str | None = None,
               system: str | list[TextBlock] | None = None, max_tokens: int | None = None,
               temperature: float | None = None, top_p: float | None = None, top_k: int | None = None,
               stop_sequences: list[str] | None = None, tools: list[ClaudeTool] | None = None,
               tool_choice: dict | None = None, stream: Literal[False] = False,
               options: CallOptions | None = None) -> dict:
        fields=locals(); params={k:v for k,v in fields.items() if k not in ['self','model','options'] and v is not None}
        return self._create(params,model,options)
class _Chat:
    def __init__(self,completions: _Completions): self.completions=completions
class OpenAI:
    def __init__(self, *, model: dict, api_key: Callable[[],str] | None = None, **options):
        if not isinstance(model,dict): _invalid('Select a model from get_models().')
        source=api_key if api_key is not None else (lambda: '') if model.get('local') else None
        if not callable(source): _invalid('api_key must be a callback; clients do not retain key strings.')
        self.chat=_Chat(_Completions(model,source,options,'openai'))
class Anthropic:
    def __init__(self, *, model: dict, api_key: Callable[[],str] | None = None, **options):
        if not isinstance(model,dict): _invalid('Select a model from get_models().')
        source=api_key if api_key is not None else (lambda: '') if model.get('local') else None
        if not callable(source): _invalid('api_key must be a callback; clients do not retain key strings.')
        self.messages=_Messages(model,source,options,'claude')
def openAI(**config) -> OpenAI:
    return OpenAI(**config)
def claude(**config) -> Anthropic:
    return Anthropic(**config)


class _ByokitRequest:
    def __init__(self, defaults: CallOptions, format: str):
        self._defaults = dict(defaults)
        self._format = format

    def _create(self, params: dict, model: dict, api_key: str | None, options: CallOptions | None) -> dict:
        if not isinstance(model, dict): _invalid('Provide a model object from get_models().')
        if options is not None: _check_options(options)
        # Capture the exact offering and input, never retain either on the client.
        try: selected, params = copy.deepcopy(model), copy.deepcopy(params)
        except Exception: raise CallError('INVALID_REQUEST', 'Request and model must contain copyable data.') from None
        opts = {**self._defaults, **(options or {})}
        if 'runtime_checks' in opts and not isinstance(opts['runtime_checks'], bool): _invalid('runtime_checks must be boolean.')
        import math
        timeout = opts.get('timeout_ms', 90000)
        if not isinstance(timeout, (int, float)) or isinstance(timeout, bool) or not math.isfinite(timeout) or timeout <= 0: _invalid('timeout_ms must be positive.')
        return (call_claude if self._format == 'claude' else call)(selected, params, '' if api_key is None else api_key, opts)

class _ByokitCompletions(_ByokitRequest):
    def create(self, *, model: dict, messages: list[ChatMessage], api_key: str | None = None,
               max_tokens: int | None = None, max_completion_tokens: int | None = None,
               temperature: float | None = None, top_p: float | None = None,
               stop: str | list[str] | None = None, tools: list[FunctionTool] | None = None,
               tool_choice: Literal['auto','none','required'] | dict | None = None,
               stream: Literal[False] = False, options: CallOptions | None = None) -> dict:
        params = {k:v for k,v in locals().items() if k not in ['self','model','api_key','options'] and v is not None}
        return self._create(params, model, api_key, options)

class _ByokitMessages(_ByokitRequest):
    def create(self, *, model: dict, messages: list[ClaudeMessage], api_key: str | None = None,
               system: str | list[TextBlock] | None = None, max_tokens: int | None = None,
               temperature: float | None = None, top_p: float | None = None, top_k: int | None = None,
               stop_sequences: list[str] | None = None, tools: list[ClaudeTool] | None = None,
               tool_choice: dict | None = None, stream: Literal[False] = False,
               options: CallOptions | None = None) -> dict:
        params = {k:v for k,v in locals().items() if k not in ['self','model','api_key','options'] and v is not None}
        return self._create(params, model, api_key, options)

class _ByokitChat:
    def __init__(self, completions: _ByokitCompletions): self.completions = completions

class Byokit:
    """One client, exact per-request models and transient keys; no credential store."""
    def __init__(self, *, runtime_checks: bool = True, timeout_ms: float = 90000):
        import math
        if not isinstance(runtime_checks, bool): _invalid('runtime_checks must be boolean.')
        if not isinstance(timeout_ms, (int, float)) or isinstance(timeout_ms, bool) or not math.isfinite(timeout_ms) or timeout_ms <= 0: _invalid('timeout_ms must be positive.')
        defaults: CallOptions = {'runtime_checks': runtime_checks, 'timeout_ms': timeout_ms}
        self.chat = _ByokitChat(_ByokitCompletions(defaults, 'openai'))
        self.messages = _ByokitMessages(defaults, 'claude')
