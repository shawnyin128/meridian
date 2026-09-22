"""Stateless stdio server for Meridian Harness requests."""

import json
import sys
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from functools import cache
from threading import Event, Lock
from typing import TextIO

from .protocol import (
    CAPABILITIES,
    ERROR_KINDS,
    PROTOCOL_VERSION,
    ProtocolViolation,
    callback,
    error,
    ready_event,
    require_fields,
    require_object,
    require_request,
    response,
)

Method = Callable[["RequestContext", object], object]


class RequestCancelled(RuntimeError):  # noqa: N818
    """Stops one request after Core sends a cancel message."""


class CoreCallbackError(RuntimeError):
    """Preserves a classified failure returned by a Core read callback."""

    def __init__(self, kind: str, message: str) -> None:
        super().__init__(message)
        self.kind = kind if kind in ERROR_KINDS else "internal"


class HarnessFailure(RuntimeError):  # noqa: N818
    """Classified workflow failure safe to return across the process boundary."""

    def __init__(self, kind: str, message: str, detail: object = None) -> None:
        super().__init__(message)
        self.kind = kind if kind in ERROR_KINDS else "internal"
        self.detail = detail


@dataclass
class _CallbackWaiter:
    request_id: int
    event: Event = field(default_factory=Event)
    result: object = None
    failure: CoreCallbackError | None = None


@dataclass(frozen=True)
class RequestContext:
    """Per-request cancellation state exposed to orchestration methods."""

    request_id: int
    cancelled: Event
    _read: Callable[[str, object], object] = field(repr=False)

    def check_cancelled(self) -> None:
        """Raise before starting another potentially billable step."""
        if self.cancelled.is_set():
            raise RequestCancelled

    def read(self, method: str, params: object) -> object:
        """Request one allowlisted, read-only value from Core."""
        self.check_cancelled()
        return self._read(method, params)


def _ping(context: RequestContext, _params: object) -> object:
    context.check_cancelled()
    return {"protocol": PROTOCOL_VERSION, "capabilities": list(CAPABILITIES)}


@cache
def _paper_wiki_method() -> Method:
    """Load and compile the paid workflow only after an explicit user-confirmed request."""
    from .workflows import build_paper_wiki_method

    return build_paper_wiki_method()


def _propose_paper_wiki(context: RequestContext, params: object) -> object:
    return _paper_wiki_method()(context, params)


@cache
def _chat_method() -> Method:
    """Load and compile chat orchestration only after an explicit user send."""
    from .workflows import build_chat_method

    return build_chat_method()


def _answer_chat(context: RequestContext, params: object) -> object:
    return _chat_method()(context, params)


def _check_model_connection(context: RequestContext, params: object) -> object:
    context.check_cancelled()
    request = require_object(params, "model connection check")
    require_fields(
        request,
        frozenset({"model"}),
        frozenset(),
        "model connection check",
    )
    from .models import check_model_connection

    result = check_model_connection(request["model"])
    context.check_cancelled()
    return result


class JsonLineServer:
    """Read client messages from stdin and reserve stdout for protocol frames."""

    def __init__(self, methods: dict[str, Method] | None = None) -> None:
        self._methods = {
            "system.ping": _ping,
            "paper-wiki.propose": _propose_paper_wiki,
            "chat.answer": _answer_chat,
            "model.check": _check_model_connection,
            **(methods or {}),
        }
        self._write_lock = Lock()
        self._state_lock = Lock()
        self._cancelled: dict[int, Event] = {}
        self._callback_waiters: dict[str, _CallbackWaiter] = {}
        self._callback_serial = 0
        self._stopping = Event()
        self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="meridian-harness")

    def _write(self, output: TextIO, message: dict[str, object]) -> None:
        line = json.dumps(message, ensure_ascii=False, separators=(",", ":"))
        with self._write_lock:
            output.write(f"{line}\n")
            output.flush()

    def _run(self, output: TextIO, request_id: int, method: str, params: object) -> None:
        with self._state_lock:
            cancelled = self._cancelled.setdefault(request_id, Event())
        context = RequestContext(
            request_id=request_id,
            cancelled=cancelled,
            _read=lambda callback_method, callback_params: self._read_from_core(
                output, request_id, cancelled, callback_method, callback_params
            ),
        )
        try:
            handler = self._methods.get(method)
            if handler is None:
                raise ProtocolViolation(f"unsupported Harness method: {method}")
            result = handler(context, params)
            context.check_cancelled()
            self._write(output, response(request_id, result))
        except RequestCancelled:
            self._write(output, error(request_id, "cancelled", "Harness request cancelled"))
        except ProtocolViolation as cause:
            self._write(output, error(request_id, "bad_request", str(cause)))
        except CoreCallbackError as cause:
            self._write(output, error(request_id, cause.kind, str(cause)))
        except HarnessFailure as cause:
            self._write(output, error(
                request_id,
                cause.kind,
                str(cause),
                **({} if cause.detail is None else {"detail": cause.detail}),
            ))
        except ModuleNotFoundError as cause:
            package = cause.name or "unknown"
            self._write(
                output,
                error(
                    request_id,
                    "internal",
                    "Harness dependency is unavailable",
                    detail=f"Missing Python package: {package}",
                ),
            )
            print(f"[harness] missing dependency: {package}", file=sys.stderr, flush=True)
        except Exception as cause:  # noqa: BLE001
            self._write(
                output,
                error(
                    request_id,
                    "internal",
                    "Harness request failed",
                    detail=type(cause).__name__,
                ),
            )
            print(f"[harness] request {request_id} failed: {cause}", file=sys.stderr, flush=True)
        finally:
            with self._state_lock:
                self._cancelled.pop(request_id, None)

    def _read_from_core(
        self,
        output: TextIO,
        request_id: int,
        cancelled: Event,
        method: str,
        params: object,
    ) -> object:
        with self._state_lock:
            self._callback_serial += 1
            callback_id = f"callback-{request_id}-{self._callback_serial}"
            waiter = _CallbackWaiter(request_id=request_id)
            self._callback_waiters[callback_id] = waiter
        self._write(output, callback(request_id, callback_id, method, params))
        while not waiter.event.wait(timeout=0.1):
            if cancelled.is_set():
                with self._state_lock:
                    self._callback_waiters.pop(callback_id, None)
                raise RequestCancelled
            if self._stopping.is_set():
                with self._state_lock:
                    self._callback_waiters.pop(callback_id, None)
                raise CoreCallbackError("harness_gone", "Core closed the Harness callback channel")
        if waiter.failure is not None:
            raise waiter.failure
        return waiter.result

    def _finish_callback(self, value: dict[str, object]) -> None:
        callback_id = value.get("callbackId")
        if not isinstance(callback_id, str) or not callback_id:
            raise ProtocolViolation("callback response must carry callbackId")
        with self._state_lock:
            waiter = self._callback_waiters.get(callback_id)
        if waiter is None:
            raise ProtocolViolation(f"unknown callback response: {callback_id}")
        try:
            request_id = value.get("id")
            if request_id != waiter.request_id:
                raise ProtocolViolation("callback response id does not match its request")
            if value.get("type") == "response" and value.get("ok") is True:
                require_fields(
                    value,
                    frozenset({"type", "id", "callbackId", "ok", "result"}),
                    frozenset(),
                    "callback response",
                )
                waiter.result = value.get("result")
            elif value.get("type") == "error" and value.get("ok") is False:
                require_fields(
                    value,
                    frozenset({"type", "id", "callbackId", "ok", "error"}),
                    frozenset(),
                    "callback error",
                )
                payload = value.get("error")
                if not isinstance(payload, dict):
                    raise ProtocolViolation("callback error must carry an error object")
                require_fields(
                    payload,
                    frozenset({"kind", "message"}),
                    frozenset({"detail"}),
                    "callback error payload",
                )
                kind = payload.get("kind")
                message = payload.get("message")
                if not isinstance(kind, str) or not isinstance(message, str):
                    raise ProtocolViolation("callback error payload is malformed")
                waiter.failure = CoreCallbackError(kind, message)
            else:
                raise ProtocolViolation("Core callback response is malformed")
        except ProtocolViolation as cause:
            waiter.failure = CoreCallbackError("bad_request", str(cause))
        finally:
            with self._state_lock:
                self._callback_waiters.pop(callback_id, None)
            waiter.event.set()

    def _cancel(self, value: dict[str, object]) -> None:
        require_fields(value, frozenset({"type", "id"}), frozenset(), "cancel")
        request_id = value.get("id")
        if not isinstance(request_id, int) or isinstance(request_id, bool) or request_id <= 0:
            raise ProtocolViolation("cancel id must be a positive integer")
        with self._state_lock:
            self._cancelled.setdefault(request_id, Event()).set()

    def serve(self, source: TextIO, output: TextIO) -> None:
        """Serve until Core closes stdin, then finish already accepted requests."""
        self._write(output, ready_event())
        for raw in source:
            line = raw.strip()
            if not line:
                continue
            request_id = 0
            try:
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise ProtocolViolation("message must be a JSON object")
                candidate_id = value.get("id")
                if isinstance(candidate_id, int) and not isinstance(candidate_id, bool):
                    request_id = candidate_id
                if value.get("type") == "cancel":
                    self._cancel(value)
                    continue
                if value.get("type") in {"response", "error"}:
                    self._finish_callback(value)
                    continue
                request_id, method, params = require_request(value)
                self._executor.submit(self._run, output, request_id, method, params)
            except json.JSONDecodeError:
                self._write(output, error(request_id, "bad_request", "message is not valid JSON"))
            except ProtocolViolation as cause:
                self._write(output, error(request_id, "bad_request", str(cause)))
        self._stopping.set()
        with self._state_lock:
            waiters = list(self._callback_waiters.values())
            self._callback_waiters.clear()
        for waiter in waiters:
            waiter.failure = CoreCallbackError("harness_gone", "Core closed the Harness channel")
            waiter.event.set()
        self._executor.shutdown(wait=True, cancel_futures=False)


def run_stdio() -> None:
    """Run the production UTF-8 stdio transport."""
    JsonLineServer().serve(sys.stdin, sys.stdout)
