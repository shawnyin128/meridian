"""LangChain model construction for explicitly authorized Harness runs."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage
from pydantic import SecretStr

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

DEFAULT_TIMEOUT_SECONDS = 120.0
CONNECTION_CHECK_TIMEOUT_SECONDS = 20.0
CONNECTION_CHECK_LIMITS = {"maxOutputTokens": 1, "maxModelCalls": 1}
MAX_CONNECTION_ERROR_DETAIL = 500

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
    return {
        "provider": provider,
        "protocol": protocol,
        "base_url": base_url,
        "name": _required_text(model.get("model"), "model name"),
        "authentication": authentication,
        "api_key": api_key if isinstance(api_key, str) and api_key else "not-required",
    }


def _output_limit(value: object) -> int:
    limits = _mapping(value, "limits")
    output_tokens = limits.get("maxOutputTokens")
    model_calls = limits.get("maxModelCalls")
    if not isinstance(output_tokens, int) or isinstance(output_tokens, bool) or output_tokens <= 0:
        raise ModelConfigurationError("maxOutputTokens must be positive")
    if model_calls != 1:
        raise ModelConfigurationError("Harness maxModelCalls must equal 1")
    return output_tokens


def create_chat_model(
    model: object,
    limits: object,
    *,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> BaseChatModel:
    """Build one LangChain chat model with retries disabled at the paid boundary."""

    runtime = _runtime_model(model)
    max_output_tokens = _output_limit(limits)
    provider = runtime["provider"]
    api_key = SecretStr(str(runtime["api_key"]))
    name = str(runtime["name"])

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
        )
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=name,
        api_key=api_key,
        max_tokens=max_output_tokens,
        retries=0,
        request_timeout=timeout_seconds,
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
