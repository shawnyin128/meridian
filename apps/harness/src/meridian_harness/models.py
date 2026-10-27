"""LangChain model construction for explicitly authorized Harness runs."""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from functools import reduce
from typing import TYPE_CHECKING, Any, Literal
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage
from langchain_core.messages.ai import UsageMetadata, add_usage
from pydantic import BaseModel, ConfigDict, SecretStr

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel, LanguageModelInput
    from langchain_core.runnables import Runnable

DEFAULT_TIMEOUT_SECONDS = 120.0
MAX_TIMEOUT_SECONDS = 900
CONNECTION_CHECK_TIMEOUT_SECONDS = 20.0
MODEL_LIST_TIMEOUT_SECONDS = 20.0
MAX_LISTED_MODELS = 1000
CONNECTION_CHECK_LIMITS = {"maxOutputTokens": 1, "maxModelCalls": 1}
MAX_CONNECTION_ERROR_DETAIL = 500
# The reasoning efforts each provider's LangChain integration takes: OpenAI's reasoning.effort,
# Anthropic's output_config.effort and Gemini's thinking_level. Core offers the same levels.
REASONING_EFFORTS: dict[str, frozenset[str]] = {
    "openai": frozenset({"none", "minimal", "low", "medium", "high", "xhigh", "max"}),
    "anthropic": frozenset({"low", "medium", "high", "xhigh", "max"}),
    "google-gemini": frozenset({"minimal", "low", "medium", "high"}),
    "openai-compatible": frozenset(),
}

_AUTHORIZATION_PATTERN = re.compile(
    r"(?i)(\b(?:authorization|proxy-authorization)\b\s*[:=]\s*)"
    r"(?:bearer\s+)?(?:['\"]?)[^\s,'\"}\]]+"
)
_NAMED_SECRET_PATTERN = re.compile(
    r"(?i)(\b(?:api[-_ ]?key|x-api-key|access[-_ ]?token|secret)\b\s*"
    r"[:=]\s*)(?:bearer\s+)?(?:['\"]?)[^\s,'\"}\]]+"
)
_QUERY_SECRET_PATTERN = re.compile(
    r"(?i)([?&](?:api[-_]?key|key|token|access_token|secret)=)[^&#\s]+"
)
_TOKEN_PATTERN = re.compile(r"\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b")


class ModelConfigurationError(RuntimeError):
    """Reports an incomplete or unsupported model configuration before any Core reads."""


class ModelInvocationError(RuntimeError):
    """A sanitized model failure safe to return across the Harness boundary."""

    def __init__(self, message: str, detail: object = None) -> None:
        super().__init__(message)
        self.detail = detail

    @classmethod
    def from_exception(cls, cause: Exception) -> ModelInvocationError:
        """Classify common provider failures without exposing response bodies or credentials."""

        status = _status_code(cause)
        if status == 429:
            return cls(
                "模型服务请求过多（429），请稍后重新确认任务", "rate_limit"
            )
        if status in {401, 403}:
            return cls(
                f"模型服务拒绝认证（{status}），请检查设置", "authentication"
            )
        if status is not None:
            return cls(f"模型服务返回 HTTP {status}", "provider_http")
        if isinstance(cause, TimeoutError) or "timeout" in type(cause).__name__.lower():
            return cls("模型服务请求超时", "timeout")
        return cls("模型服务调用失败", type(cause).__name__)


def _mapping(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ModelConfigurationError(f"{label} must be an object")
    return value


def _required_text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ModelConfigurationError(f"{label} is not configured")
    return value.strip()


def _status_code(cause: BaseException) -> int | None:
    for candidate in (getattr(cause, "status_code", None), getattr(cause, "code", None)):
        if isinstance(candidate, int) and not isinstance(candidate, bool):
            return candidate
    response = getattr(cause, "response", None)
    candidate = getattr(response, "status_code", None)
    return candidate if isinstance(candidate, int) and not isinstance(candidate, bool) else None


def _runtime_model(value: object) -> dict[str, object]:
    model = _mapping(value, "model")
    provider = model.get("provider")
    if provider not in {"openai", "anthropic", "google-gemini", "openai-compatible"}:
        raise ModelConfigurationError("Unsupported Harness model provider")
    protocol = model.get("protocol")
    allowed_protocols = {
        "openai": {"responses"},
        "anthropic": {"messages"},
        "google-gemini": {"generate-content"},
        "openai-compatible": {"responses", "chat-completions"},
    }
    if protocol not in allowed_protocols[provider]:
        raise ModelConfigurationError("Unsupported model protocol for the selected provider")
    base_url = _required_text(model.get("baseUrl"), "model base URL").rstrip("/")
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ModelConfigurationError("Model base URL must be HTTP or HTTPS")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ModelConfigurationError("Remote model base URLs must use HTTPS")
    authentication = model.get("authentication")
    if authentication not in {"api-key", "none"}:
        raise ModelConfigurationError("Model authentication is not configured")
    if provider != "openai-compatible" and authentication != "api-key":
        raise ModelConfigurationError("The selected model provider requires an API key")
    api_key = model.get("apiKey")
    if authentication == "api-key" and (not isinstance(api_key, str) or not api_key):
        raise ModelConfigurationError("Model API key is not configured")
    effort = model.get("effort")
    accepted = REASONING_EFFORTS[provider]
    if effort is not None and (not isinstance(effort, str) or effort not in accepted):
        raise ModelConfigurationError("The model provider does not take this reasoning effort")
    return {
        "provider": provider,
        "protocol": protocol,
        "base_url": base_url,
        "name": _required_text(model.get("model"), "model name"),
        "authentication": authentication,
        "api_key": api_key if isinstance(api_key, str) and api_key else "not-required",
        "effort": effort,
    }


def runs_on_cli(model: object) -> bool:
    """Whether a runtime model is the user's subscription CLI, whose model call Core runs."""
    return isinstance(model, dict) and model.get("source") == "cli"


def structured_output_method(model: object) -> Literal["json_schema", "function_calling"]:
    """Return how runtime model `model` takes a closed output schema through LangChain.

    An OpenAI-compatible service gets the schema as the one tool it must call; every other provider
    gets it as a JSON schema response format. Raises ModelConfigurationError for a model
    configuration create_chat_model would refuse.
    """

    if _runtime_model(model)["provider"] == "openai-compatible":
        return "function_calling"
    return "json_schema"


def _drop_titles(node: object) -> None:
    if isinstance(node, dict):
        if isinstance(node.get("title"), str):
            del node["title"]
        for value in node.values():
            _drop_titles(value)
    elif isinstance(node, list):
        for value in node:
            _drop_titles(value)


def _model_facing(schema: dict[str, Any]) -> None:
    """Remove from the JSON schema pydantic makes of one class its title, its docstring and the
    titles of its fields."""

    schema.pop("title", None)
    schema.pop("description", None)
    for field in schema.get("properties", {}).values():
        _drop_titles(field)


class StructuredOutput(BaseModel):
    """A model's structured output, whose JSON schema says only what the model needs: it carries
    no pydantic titles and no class docstrings, which are written for developers."""

    model_config = ConfigDict(json_schema_extra=_model_facing)


def with_closed_output(
    chat_model: BaseChatModel, schema: type[StructuredOutput], model: object,
) -> Runnable[LanguageModelInput, object]:
    """Return `chat_model` answering with the closed schema `schema` through the provider-native
    structured output runtime model `model` takes, as structured_output_method names it. An
    OpenAI-compatible service's answer comes back as the tool call's arguments, every other
    provider's as a `schema` instance; either needs validating."""

    method = structured_output_method(model)
    if method == "function_calling":
        # LangChain names the tool after the schema's title, which a structured output leaves out.
        named = {**schema.model_json_schema(), "title": schema.__name__}
        return chat_model.with_structured_output(named, method=method)
    return chat_model.with_structured_output(schema, method=method)


def caches_by_breakpoint(model: object) -> bool:
    """Whether the provider of runtime model `model` caches a prompt prefix only up to a
    `cache_control` breakpoint the prompt carries, as Anthropic does; the other providers cache
    prefixes on their own. Raises ModelConfigurationError as structured_output_method does."""

    return _runtime_model(model)["provider"] == "anthropic"


def usage_line(model: object, seconds: float, usage: Mapping[str, UsageMetadata]) -> str:
    """One log line saying how long a call to runtime model `model` took, and its input tokens, the
    cached ones among them, and its output tokens, as LangChain's non-empty `usage` by model name
    counts them."""

    runtime = _runtime_model(model)
    total = reduce(add_usage, usage.values())
    cached = total.get("input_token_details", {}).get("cache_read") or 0
    return (
        f"{runtime['provider']} {runtime['name']}: {seconds:.1f} s, "
        f"{total['input_tokens']} input tokens ({cached} cached), "
        f"{total['output_tokens']} output tokens"
    )


def _output_limit(value: object) -> int:
    limits = _mapping(value, "limits")
    output_tokens = limits.get("maxOutputTokens")
    model_calls = limits.get("maxModelCalls")
    if not isinstance(output_tokens, int) or isinstance(output_tokens, bool) or output_tokens <= 0:
        raise ModelConfigurationError("maxOutputTokens must be positive")
    if model_calls != 1:
        raise ModelConfigurationError("Harness maxModelCalls must equal 1")
    return output_tokens


def _call_timeout(value: object, fallback: float) -> float:
    """The model call timeout in seconds `limits` sets, or `fallback` when it sets none."""

    timeout = _mapping(value, "limits").get("timeoutSeconds")
    if timeout is None:
        return fallback
    if (
        not isinstance(timeout, int | float)
        or isinstance(timeout, bool)
        or not 0 < timeout <= MAX_TIMEOUT_SECONDS
    ):
        raise ModelConfigurationError("timeoutSeconds must be a bounded number of seconds")
    return float(timeout)


def create_chat_model(
    model: object,
    limits: object,
    *,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> BaseChatModel:
    """Build one LangChain chat model with retries disabled at the paid boundary.

    The model runs at the reasoning effort `model` sets, or at the provider's own default, and a
    call may take the `timeoutSeconds` `limits` sets, or `timeout_seconds` when it sets none.
    """

    runtime = _runtime_model(model)
    max_output_tokens = _output_limit(limits)
    timeout_seconds = _call_timeout(limits, timeout_seconds)
    provider = runtime["provider"]
    api_key = SecretStr(str(runtime["api_key"]))
    name = str(runtime["name"])
    effort = runtime["effort"]

    if provider in {"openai", "openai-compatible"}:
        from langchain_openai import ChatOpenAI

        options: dict[str, object] = {
            "model": name,
            "api_key": api_key,
            "base_url": str(runtime["base_url"]),
            "max_retries": 0,
            "timeout": timeout_seconds,
            "use_responses_api": runtime["protocol"] == "responses",
        }
        if provider == "openai-compatible" and runtime["protocol"] == "chat-completions":
            # Compatible Chat Completions services commonly retain the standard max_tokens
            # field even though current OpenAI clients rewrite max_tokens to
            # max_completion_tokens. extra_body preserves the provider's wire format.
            options["extra_body"] = {"max_tokens": max_output_tokens}
        else:
            options["max_completion_tokens"] = max_output_tokens
        if provider == "openai":
            options["store"] = False
        if effort is not None:
            options["reasoning_effort"] = effort
        return ChatOpenAI(
            **options,
        )
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model_name=name,
            api_key=api_key,
            base_url=str(runtime["base_url"]),
            max_tokens_to_sample=max_output_tokens,
            max_retries=0,
            timeout=timeout_seconds,
            reasoning_effort=effort,
        )
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=name,
        api_key=api_key,
        max_tokens=max_output_tokens,
        retries=0,
        request_timeout=timeout_seconds,
        thinking_level=effort,
    )


def _connection_failure_reason(cause: BaseException) -> str:
    status = _status_code(cause)
    if status in {401, 403}:
        return "authentication"
    if status == 404:
        return "model-or-endpoint"
    if status == 429:
        return "rate-limit"
    name = type(cause).__name__.lower()
    if isinstance(cause, TimeoutError) or "timeout" in name:
        return "timeout"
    if any(token in name for token in ("connection", "connect", "network", "dns")):
        return "unavailable"
    if status is not None:
        return "provider"
    return "unknown"


def _connection_error_detail(cause: BaseException, model: object) -> str:
    """Return one bounded provider diagnostic with credentials removed."""

    detail = str(cause).strip() or type(cause).__name__
    detail = _AUTHORIZATION_PATTERN.sub(r"\1[redacted]", detail)
    detail = _NAMED_SECRET_PATTERN.sub(r"\1[redacted]", detail)
    detail = _QUERY_SECRET_PATTERN.sub(r"\1[redacted]", detail)
    detail = _TOKEN_PATTERN.sub("[redacted]", detail)
    if isinstance(model, dict):
        api_key = model.get("apiKey")
        if isinstance(api_key, str) and api_key:
            detail = detail.replace(api_key, "[redacted]")
    detail = re.sub(r"\s+", " ", detail).strip()
    status = _status_code(cause)
    if status is not None and str(status) not in detail:
        detail = f"HTTP {status}: {detail}"
    if len(detail) > MAX_CONNECTION_ERROR_DETAIL:
        detail = f"{detail[: MAX_CONNECTION_ERROR_DETAIL - 1].rstrip()}…"
    return detail


def check_model_connection(
    model: object,
    model_factory: Callable[..., BaseChatModel] = create_chat_model,
) -> dict[str, object]:
    """Attempt one minimal LangChain invocation and discard all model output."""

    try:
        chat_model = model_factory(
            model,
            CONNECTION_CHECK_LIMITS,
            timeout_seconds=CONNECTION_CHECK_TIMEOUT_SECONDS,
        )
    except ModelConfigurationError as cause:
        return {
            "state": "failed",
            "reason": "configuration",
            "detail": _connection_error_detail(cause, model),
            "modelCalls": 0,
            "maxOutputTokens": 1,
        }
    except Exception as cause:  # noqa: BLE001
        return {
            "state": "failed",
            "reason": "unknown",
            "detail": _connection_error_detail(cause, model),
            "modelCalls": 0,
            "maxOutputTokens": 1,
        }
    try:
        chat_model.invoke([HumanMessage(content=".")])
    except Exception as cause:  # noqa: BLE001
        return {
            "state": "failed",
            "reason": _connection_failure_reason(cause),
            "detail": _connection_error_detail(cause, model),
            "modelCalls": 1,
            "maxOutputTokens": 1,
        }
    return {"state": "connected", "modelCalls": 1, "maxOutputTokens": 1}


def _provider_model_ids(runtime: dict[str, object]) -> list[str]:
    """Ask the provider's official SDK for the models the configured key may call."""

    provider = runtime["provider"]
    api_key = str(runtime["api_key"])
    if provider in {"openai", "openai-compatible"}:
        from openai import OpenAI

        client = OpenAI(
            api_key=api_key,
            base_url=str(runtime["base_url"]),
            max_retries=0,
            timeout=MODEL_LIST_TIMEOUT_SECONDS,
        )
        return [model.id for model in client.models.list()]
    if provider == "anthropic":
        from anthropic import Anthropic

        client = Anthropic(
            api_key=api_key,
            base_url=str(runtime["base_url"]),
            max_retries=0,
            timeout=MODEL_LIST_TIMEOUT_SECONDS,
        )
        return [model.id for model in client.models.list(limit=1000)]
    from google import genai
    from google.genai import types

    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=int(MODEL_LIST_TIMEOUT_SECONDS * 1000)),
    )
    # Gemini names its models `models/<id>` and lists embedding models too; a chat model
    # generates content.
    return [
        str(model.name).removeprefix("models/")
        for model in client.models.list()
        if model.name and "generateContent" in (model.supported_actions or [])
    ]


def list_models(model: object) -> list[str]:
    """List the model IDs the provider of runtime model `model` offers its key, with no model call.

    Each ID appears once, in the provider's order, up to MAX_LISTED_MODELS. Raises
    ModelConfigurationError for a model that is not set up to run, and ModelInvocationError,
    classified and free of the provider's own text, when the provider's call fails.
    """

    runtime = _runtime_model(model)
    try:
        listed = _provider_model_ids(runtime)
    except Exception as cause:  # noqa: BLE001
        raise ModelInvocationError.from_exception(cause) from None
    return list(dict.fromkeys(name.strip() for name in listed if name.strip()))[:MAX_LISTED_MODELS]
