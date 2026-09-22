"""Tests for the bounded LangGraph chat workflow."""

import unittest
from threading import Event
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from meridian_harness.protocol import ProtocolViolation
from meridian_harness.server import HarnessFailure, RequestContext
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


if __name__ == "__main__":
    unittest.main()
