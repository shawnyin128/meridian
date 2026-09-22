import json
from collections.abc import Iterator
from io import StringIO
from threading import Event
from unittest import TestCase

from meridian_harness.protocol import CAPABILITIES, PROTOCOL_VERSION, ProtocolViolation, callback
from meridian_harness.server import JsonLineServer, Method, RequestContext


def run_server(
    messages: list[dict[str, object] | str],
    methods: dict[str, Method] | None = None,
) -> list[dict[str, object]]:
    rows = [message if isinstance(message, str) else json.dumps(message) for message in messages]
    source = StringIO("\n".join(rows) + "\n")
    output = StringIO()
    JsonLineServer(methods).serve(source, output)
    return [json.loads(line) for line in output.getvalue().splitlines()]


class ProtocolTests(TestCase):
    def test_ready_then_ping(self) -> None:
        messages = run_server(
            [{"type": "request", "id": 1, "method": "system.ping", "params": {}}]
        )

        self.assertEqual(
            messages[0],
            {
                "type": "event",
                "id": 0,
                "event": "ready",
                "data": {"protocol": PROTOCOL_VERSION, "capabilities": list(CAPABILITIES)},
            },
        )
        self.assertEqual(messages[1]["type"], "response")
        self.assertEqual(
            messages[1]["result"],
            {"protocol": PROTOCOL_VERSION, "capabilities": list(CAPABILITIES)},
        )

    def test_unknown_method_is_classified_as_bad_request(self) -> None:
        messages = run_server(
            [{"type": "request", "id": 2, "method": "missing", "params": None}]
        )

        self.assertEqual(messages[1]["type"], "error")
        self.assertEqual(messages[1]["error"]["kind"], "bad_request")

    def test_model_check_rejects_unknown_fields_before_any_provider_request(self) -> None:
        messages = run_server([{
            "type": "request",
            "id": 7,
            "method": "model.check",
            "params": {"model": {}, "extra": True},
        }])

        self.assertEqual(messages[1]["type"], "error")
        self.assertEqual(messages[1]["error"]["kind"], "bad_request")
        self.assertIn("unknown fields", messages[1]["error"]["message"])

    def test_missing_runtime_dependency_returns_an_actionable_diagnostic(self) -> None:
        def missing_dependency(_context: RequestContext, _params: object) -> object:
            raise ModuleNotFoundError("No module named 'langchain_core'", name="langchain_core")

        messages = run_server(
            [{"type": "request", "id": 9, "method": "test.missing", "params": {}}],
            {"test.missing": missing_dependency},
        )

        self.assertEqual(messages[1]["error"], {
            "kind": "internal",
            "message": "Harness dependency is unavailable",
            "detail": "Missing Python package: langchain_core",
        })

    def test_request_and_cancel_reject_unknown_fields(self) -> None:
        request_messages = run_server([{
            "type": "request",
            "id": 2,
            "method": "system.ping",
            "params": {},
            "future": True,
        }])
        cancel_messages = run_server([{"type": "cancel", "id": 2, "future": True}])

        self.assertEqual(request_messages[1]["error"]["kind"], "bad_request")
        self.assertIn("unknown fields", request_messages[1]["error"]["message"])
        self.assertEqual(cancel_messages[1]["error"]["kind"], "bad_request")
        self.assertIn("unknown fields", cancel_messages[1]["error"]["message"])

    def test_paper_wiki_requires_a_model_without_requesting_core_data(self) -> None:
        messages = run_server([{
            "type": "request",
            "id": 5,
            "method": "paper-wiki.propose",
            "params": {
                "workflow": "paper-wiki",
                "targetId": "p1",
                "scopeDigest": "digest",
                "action": "create",
                "model": {"provider": "none", "name": "none"},
                "limits": {"maxOutputTokens": 6000, "maxModelCalls": 1},
            },
        }])

        self.assertEqual([message["type"] for message in messages], ["event", "error"])
        self.assertEqual(messages[1]["error"]["kind"], "no_model")

    def test_cancelled_request_does_not_return_a_success(self) -> None:
        entered = Event()
        release = Event()

        def wait(context: RequestContext, _params: object) -> object:
            entered.set()
            release.wait(timeout=1)
            context.check_cancelled()
            return {"unexpected": True}

        server = JsonLineServer({"test.wait": wait})
        output = StringIO()

        class CancellingInput:
            def __iter__(self) -> Iterator[str]:
                yield json.dumps(
                    {"type": "request", "id": 3, "method": "test.wait", "params": {}}
                )
                entered.wait(timeout=1)
                yield json.dumps({"type": "cancel", "id": 3})
                release.set()

        server.serve(CancellingInput(), output)  # type: ignore[arg-type]
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        terminal = [message for message in messages if message.get("id") == 3]
        self.assertEqual(len(terminal), 1)
        self.assertEqual(terminal[0]["error"]["kind"], "cancelled")

    def test_method_can_request_allowlisted_core_data(self) -> None:
        callback_written = Event()

        class ObservedOutput(StringIO):
            def write(self, value: str) -> int:
                written = super().write(value)
                if '"type":"callback"' in value:
                    callback_written.set()
                return written

        output = ObservedOutput()

        def read_paper(context: RequestContext, params: object) -> object:
            return context.read("papers.get", params)

        class CallbackInput:
            def __iter__(self) -> Iterator[str]:
                yield json.dumps(
                    {
                        "type": "request",
                        "id": 4,
                        "method": "test.read-paper",
                        "params": {"id": "p1"},
                    }
                )
                callback_written.wait(timeout=1)
                yield json.dumps(
                    {
                        "type": "response",
                        "id": 4,
                        "callbackId": "callback-4-1",
                        "ok": True,
                        "result": {"id": "p1", "title": "Paper"},
                    }
                )

        JsonLineServer({"test.read-paper": read_paper}).serve(CallbackInput(), output)  # type: ignore[arg-type]
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        callback_message = next(message for message in messages if message["type"] == "callback")
        terminal = next(
            message
            for message in messages
            if message.get("id") == 4 and message["type"] == "response"
        )
        self.assertEqual(callback_message["method"], "papers.get")
        self.assertEqual(terminal["result"], {"id": "p1", "title": "Paper"})

    def test_malformed_json_stays_inside_the_protocol(self) -> None:
        messages = run_server(["not-json"])
        self.assertEqual(messages[1]["type"], "error")
        self.assertEqual(messages[1]["error"]["kind"], "bad_request")

    def test_callback_allowlist_includes_reading_state_and_rejects_writes(self) -> None:
        self.assertEqual(callback(1, "cb", "papers.reading", {"id": "p1"})["type"], "callback")
        self.assertEqual(callback(1, "cb", "chat.context", {"id": "c1"})["type"], "callback")
        with self.assertRaises(ProtocolViolation):
            callback(1, "cb", "wiki.apply", {})

    def test_malformed_callback_response_fails_the_waiting_request(self) -> None:
        callback_written = Event()

        class ObservedOutput(StringIO):
            def write(self, value: str) -> int:
                written = super().write(value)
                if '"type":"callback"' in value:
                    callback_written.set()
                return written

        def read_paper(context: RequestContext, params: object) -> object:
            return context.read("papers.get", params)

        class CallbackInput:
            def __iter__(self) -> Iterator[str]:
                yield json.dumps({
                    "type": "request", "id": 8, "method": "test.read-paper", "params": {},
                })
                callback_written.wait(timeout=1)
                yield json.dumps({
                    "type": "response",
                    "id": 8,
                    "callbackId": "callback-8-1",
                    "ok": True,
                    "result": {},
                    "future": True,
                })

        output = ObservedOutput()
        JsonLineServer({"test.read-paper": read_paper}).serve(CallbackInput(), output)  # type: ignore[arg-type]
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        request_errors = [
            message for message in messages
            if message.get("id") == 8 and message.get("type") == "error"
        ]
        self.assertEqual(len(request_errors), 1)
        self.assertEqual(request_errors[0]["error"]["kind"], "bad_request")
        self.assertIn("unknown fields", request_errors[0]["error"]["message"])
