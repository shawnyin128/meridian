"""Versioned JSON Lines messages for the Core-to-Harness boundary."""

from typing import Final

PROTOCOL_VERSION: Final = "meridian.harness.v1"
CAPABILITIES: Final = ("paper-wiki", "chat", "model-check")
ERROR_KINDS: Final = frozenset(
    {"bad_request", "no_model", "model_error", "cancelled", "harness_gone", "internal"}
)
READ_CALLBACKS: Final = frozenset(
    {
        "papers.list",
        "papers.get",
        "papers.reading",
        "papers.source",
        "wiki.home",
        "wiki.topic",
        "wiki.page",
        "wiki.pages",
        "search.query",
        "project.get",
        "project.list",
        "chat.context",
    }
)


class ProtocolViolation(ValueError):  # noqa: N818
    """Raised when a client message cannot be interpreted safely."""


def require_object(value: object, label: str = "message") -> dict[str, object]:
    """Return a string-keyed JSON object or raise a protocol violation."""
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ProtocolViolation(f"{label} must be a JSON object")
    return value


def require_fields(
    message: dict[str, object], required: frozenset[str], optional: frozenset[str], label: str
) -> None:
    """Reject missing and unknown envelope fields so protocol drift fails closed."""
    fields = frozenset(message)
    missing = required - fields
    unknown = fields - required - optional
    if missing:
        raise ProtocolViolation(f"{label} is missing fields: {', '.join(sorted(missing))}")
    if unknown:
        raise ProtocolViolation(f"{label} has unknown fields: {', '.join(sorted(unknown))}")


def require_request(value: object) -> tuple[int, str, object]:
    """Validate the envelope fields shared by every request."""
    message = require_object(value)
    require_fields(message, frozenset({"type", "id", "method", "params"}), frozenset(), "request")
    if message.get("type") != "request":
        raise ProtocolViolation("message type must be request")
    request_id = message.get("id")
    method = message.get("method")
    if not isinstance(request_id, int) or isinstance(request_id, bool) or request_id <= 0:
        raise ProtocolViolation("request id must be a positive integer")
    if not isinstance(method, str) or not method:
        raise ProtocolViolation("request method must be a non-empty string")
    return request_id, method, message.get("params")


def ready_event() -> dict[str, object]:
    """Build the one startup event Core must validate before sending work."""
    return {
        "type": "event",
        "id": 0,
        "event": "ready",
        "data": {"protocol": PROTOCOL_VERSION, "capabilities": list(CAPABILITIES)},
    }


def response(request_id: int, result: object, callback_id: str | None = None) -> dict[str, object]:
    """Build a successful request or callback response."""
    message: dict[str, object] = {
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    }
    if callback_id is not None:
        message["callbackId"] = callback_id
    return message


def callback(
    request_id: int, callback_id: str, method: str, params: object
) -> dict[str, object]:
    """Build a read-only data request from Harness back to Core."""
    if method not in READ_CALLBACKS:
        raise ProtocolViolation(f"Harness callback is not allowed: {method}")
    return {
        "type": "callback",
        "id": request_id,
        "callbackId": callback_id,
        "method": method,
        "params": params,
    }


def error(
    request_id: int,
    kind: str,
    message: str,
    *,
    detail: object | None = None,
    callback_id: str | None = None,
) -> dict[str, object]:
    """Build one classified protocol error."""
    if kind not in ERROR_KINDS:
        kind = "internal"
    payload: dict[str, object] = {"kind": kind, "message": message}
    if detail is not None:
        payload["detail"] = detail
    envelope: dict[str, object] = {
        "type": "error",
        "id": request_id,
        "ok": False,
        "error": payload,
    }
    if callback_id is not None:
        envelope["callbackId"] = callback_id
    return envelope
