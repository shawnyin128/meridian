"""Tests for the bounded LangGraph chat workflow."""

import unittest
from threading import Event
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from meridian_harness.protocol import ProtocolViolation
from meridian_harness.server import CoreCallbackError, HarnessFailure, RequestContext
from meridian_harness.workflows.chat import CHAT_GRAPH, CHAT_PROMPT, build_chat_method


class FixedChatModel(BaseChatModel):
    """Return one deterministic answer without a provider request."""

    answer: str
    calls: list[bool] | None = None

    @property
    def _llm_type(self) -> str:
        return "fixed-test-chat"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        del messages, stop, run_manager, kwargs
        if self.calls is not None:
            self.calls.append(True)
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=self.answer))])


class ChatWorkflowTests(unittest.TestCase):
    def test_reads_bounded_context_once_and_returns_only_the_answer(self) -> None:
        reads: list[tuple[str, object]] = []

        def read(method: str, params: object) -> object:
            reads.append((method, params))
            return {"title": "Paper discussion", "history": []}

        method = build_chat_method(
            lambda _model, _limits: FixedChatModel(answer="Grounded answer")
        )
        result = method(RequestContext(1, Event(), read), _params())

        self.assertEqual(
            reads,
            [("chat.context", {"id": "chat-1", "currentText": "What changed?"})],
        )
        self.assertEqual(result, {"answer": "Grounded answer"})

    def test_rejects_blank_model_output_as_a_structured_model_failure(self) -> None:
        method = build_chat_method(lambda _model, _limits: FixedChatModel(answer="   "))

        with self.assertRaises(HarnessFailure) as raised:
            method(RequestContext(2, Event(), _read), _params())

        self.assertEqual(raised.exception.kind, "model_error")
        self.assertEqual(raised.exception.detail, "structured_output")

    def test_accepts_only_citations_to_supplied_source_pages(self) -> None:
        method = build_chat_method(
            lambda _model, _limits: FixedChatModel(answer="The source supports this [p. 2].")
        )

        self.assertEqual(
            method(RequestContext(3, Event(), _read_with_pages), _params()),
            {"answer": "The source supports this [p. 2]."},
        )

    def test_rejects_unknown_or_malformed_page_citations(self) -> None:
        for answer in ("Unsupported [p. 9].", "Ambiguous range [pp. 1-2]."):
            with self.subTest(answer=answer):
                method = build_chat_method(
                    lambda _model, _limits, value=answer: FixedChatModel(answer=value)
                )

                with self.assertRaises(HarnessFailure) as raised:
                    method(RequestContext(4, Event(), _read_with_pages), _params())

                self.assertEqual(raised.exception.kind, "model_error")
                self.assertEqual(raised.exception.detail, "structured_output")

    def test_graph_stays_at_two_nodes_and_prompt_marks_context_untrusted(self) -> None:
        graph = CHAT_GRAPH.get_graph()
        self.assertTrue({"read_context", "generate_answer"}.issubset(graph.nodes))
        self.assertEqual(
            {name for name in graph.nodes if not name.startswith("__")},
            {"read_context", "generate_answer"},
        )
        system_prompt = str(CHAT_PROMPT.messages[0].prompt.template)
        self.assertIn("untrusted data", system_prompt)
        self.assertIn("instead of guessing", system_prompt)
        self.assertIn("shortest answer that fully", system_prompt)
        self.assertIn("exact one-based token [p. N]", system_prompt)
        self.assertIn("Return answer content only", system_prompt)

    def test_rejects_an_oversized_core_context_before_model_invocation(self) -> None:
        calls: list[bool] = []
        method = build_chat_method(
            lambda _model, _limits: FixedChatModel(answer="must not run", calls=calls)
        )

        with self.assertRaises(ProtocolViolation):
            method(RequestContext(5, Event(), _read_oversized), _params())

        self.assertEqual(calls, [])


class ChatOnCliTests(unittest.TestCase):
    def test_a_cli_model_asks_core_for_the_one_model_call_and_builds_no_provider(self) -> None:
        calls: list[object] = []

        def read(method: str, params: object) -> object:
            if method != "model.invoke":
                return _read_with_pages(method, params)
            calls.append(params)
            return {"output": "The source supports this [p. 2]."}

        def no_provider(_model: object, _limits: object) -> BaseChatModel:
            raise AssertionError("a CLI turn must not build a LangChain provider")

        result = build_chat_method(no_provider)(RequestContext(20, Event(), read), _cli_params())

        self.assertEqual(result, {"answer": "The source supports this [p. 2]."})
        self.assertEqual(len(calls), 1)
        call = calls[0]
        if not isinstance(call, dict):
            raise AssertionError("model.invoke params must be an object")
        self.assertEqual(set(call), {"system", "prompt", "message"})
        self.assertEqual(call["message"], "What changed?")

    def test_a_cli_turn_keeps_the_context_in_a_prefix_the_history_never_changes(self) -> None:
        def turn(history: list[dict[str, str]]) -> dict[str, object]:
            calls: list[dict[str, object]] = []

            def read(method: str, params: object) -> object:
                if method == "model.invoke":
                    if not isinstance(params, dict):
                        raise AssertionError("model.invoke params must be an object")
                    calls.append(params)
                    return {"output": "Answer"}
                context = _read_with_pages(method, params)
                if not isinstance(context, dict):
                    raise AssertionError("chat.context must be an object")
                return {**context, "history": history}

            build_chat_method()(RequestContext(21, Event(), read), _cli_params())
            return calls[0]

        first = turn([])
        later = turn([
            {"role": "user", "text": "Earlier question"},
            {"role": "assistant", "text": "Earlier answer"},
        ])

        system = str(first["system"])
        self.assertEqual(later["system"], system)
        self.assertTrue(system.startswith(str(CHAT_PROMPT.messages[0].prompt.template)))
        self.assertIn("Second page.", system)
        self.assertNotIn("Earlier", system)
        self.assertEqual(first["prompt"], "Current user message:\nWhat changed?")
        prompt = str(later["prompt"])
        self.assertTrue(prompt.startswith("Conversation history:\n"))
        self.assertLess(prompt.index("Earlier question"), prompt.index("Earlier answer"))
        self.assertLess(prompt.index("Earlier answer"), prompt.index("Current user message:"))
        self.assertTrue(prompt.endswith("Current user message:\nWhat changed?"))

    def test_a_cli_answer_is_validated_like_any_other_answer(self) -> None:
        for output in (None, "   ", "Unsupported [p. 9]."):
            with self.subTest(output=output):

                def read(method: str, params: object, answer: object = output) -> object:
                    if method == "model.invoke":
                        return {"output": answer}
                    return _read_with_pages(method, params)

                with self.assertRaises(HarnessFailure) as raised:
                    build_chat_method()(RequestContext(22, Event(), read), _cli_params())

                self.assertEqual(raised.exception.kind, "model_error")
                self.assertEqual(raised.exception.detail, "structured_output")

    def test_a_cli_failure_core_reports_keeps_its_own_words(self) -> None:
        def read(method: str, params: object) -> object:
            if method == "model.invoke":
                raise CoreCallbackError("model_error", "claude 运行失败：usage limit reached")
            return _read(method, params)

        with self.assertRaises(HarnessFailure) as raised:
            build_chat_method()(RequestContext(23, Event(), read), _cli_params())

        self.assertEqual(raised.exception.kind, "model_error")
        self.assertEqual(str(raised.exception), "claude 运行失败：usage limit reached")
        self.assertEqual(raised.exception.detail, "subscription_cli")


def _read(method: str, _params: object) -> object:
    if method != "chat.context":
        raise AssertionError(f"Unexpected callback: {method}")
    return {"title": "Paper discussion", "history": []}


def _read_with_pages(method: str, _params: object) -> object:
    if method != "chat.context":
        raise AssertionError(f"Unexpected callback: {method}")
    return {
        "title": "Paper discussion",
        "history": [],
        "paper": {
            "id": "paper-1",
            "title": "Grounded paper",
            "authors": [],
            "pages": [
                {"number": 1, "text": "First page."},
                {"number": 2, "text": "Second page."},
            ],
            "reading": {"highlights": [], "notes": [], "remark": ""},
        },
    }


def _read_oversized(method: str, _params: object) -> object:
    if method != "chat.context":
        raise AssertionError(f"Unexpected callback: {method}")
    return {
        "title": "Paper discussion",
        "history": [],
        "paper": {
            "id": "paper-1",
            "title": "Grounded paper",
            "authors": [],
            "pages": [
                {"number": 1, "text": "a" * 75_000},
                {"number": 2, "text": "b" * 75_000},
            ],
            "reading": {"highlights": [], "notes": [], "remark": ""},
        },
    }


def _params() -> dict[str, object]:
    return {
        "chatId": "chat-1",
        "text": "What changed?",
        "model": {
            "provider": "openai",
            "protocol": "responses",
            "baseUrl": "https://api.openai.com/v1",
            "model": "paper-model",
            "authentication": "api-key",
            "apiKey": "provider-secret",
        },
        "limits": {"maxOutputTokens": 2_000, "maxModelCalls": 1},
    }


def _cli_params() -> dict[str, object]:
    return {**_params(), "model": {"source": "cli", "cli": "claude"}}


if __name__ == "__main__":
    unittest.main()
