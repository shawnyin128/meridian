"""Tests for the bounded LangGraph chat workflow."""

import json
import unittest
from collections.abc import Callable
from threading import Event
from typing import Any

from langchain_core.exceptions import OutputParserException
from langchain_core.language_models import BaseChatModel, GenericFakeChatModel
from langchain_core.runnables import Runnable, RunnableLambda
from provider_stand_in import AnthropicStandIn, ProviderStandIn
from schema_pin import developer_text, released_schema

from meridian_harness.protocol import ProtocolViolation
from meridian_harness.server import CoreCallbackError, HarnessFailure, RequestContext
from meridian_harness.workflows.chat import (
    CHAT_GRAPH,
    CHAT_INSTRUCTIONS,
    CHAT_PROMPT,
    ChatAnswer,
    ChatContext,
    build_chat_method,
)


def _answering(
    answer: str, service: ProviderStandIn | None = None,
) -> Callable[[object, object], BaseChatModel]:
    """A model factory whose model, on `service` or a new stand-in, answers `answer` through the
    structured output it is asked for, speaking the protocol its model settings name."""

    stand_in = ProviderStandIn({"answer": answer}) if service is None else service

    def factory(model: object, _limits: object) -> BaseChatModel:
        protocol = model["protocol"] if isinstance(model, dict) else None
        return stand_in.model(responses=protocol == "responses")

    return factory


class _UnreadableOutputModel(GenericFakeChatModel):
    """A model whose structured output fails in the provider's parser, as a JSON schema format's
    parser fails on text that is not JSON."""

    def __init__(self) -> None:
        super().__init__(messages=iter([]))

    def with_structured_output(self, schema: object, **_kwargs: object) -> Runnable:
        def parse(_prompt: object) -> object:
            raise OutputParserException(f"Failed to parse {schema} from completion not json")

        return RunnableLambda(parse)


class ChatWorkflowTests(unittest.TestCase):
    def test_reads_bounded_context_once_and_returns_only_the_answer(self) -> None:
        reads: list[tuple[str, object]] = []

        def read(method: str, params: object) -> object:
            reads.append((method, params))
            return {"title": "Paper discussion", "history": []}

        method = build_chat_method(_answering("Grounded answer"))
        result = method(RequestContext(1, Event(), read), _params())

        self.assertEqual(
            reads,
            [("chat.context", {"id": "chat-1", "currentText": "What changed?"})],
        )
        self.assertEqual(result, {"answer": "Grounded answer"})

    def test_rejects_blank_model_output_as_a_structured_model_failure(self) -> None:
        method = build_chat_method(_answering("   "))

        with self.assertRaises(HarnessFailure) as raised:
            method(RequestContext(2, Event(), _read), _params())

        self.assertEqual(raised.exception.kind, "model_error")
        self.assertEqual(raised.exception.detail, "structured_output")

    def test_accepts_only_citations_to_supplied_source_pages(self) -> None:
        method = build_chat_method(_answering("The source supports this [p. 2]."))

        self.assertEqual(
            method(RequestContext(3, Event(), _read_with_pages), _params()),
            {"answer": "The source supports this [p. 2]."},
        )

    def test_rejects_unknown_or_malformed_page_citations(self) -> None:
        for answer in ("Unsupported [p. 9].", "Ambiguous range [pp. 1-2]."):
            with self.subTest(answer=answer):
                method = build_chat_method(_answering(answer))

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
        service = ProviderStandIn({"answer": "must not run"})
        method = build_chat_method(_answering("must not run", service))

        with self.assertRaises(ProtocolViolation):
            method(RequestContext(5, Event(), _read_oversized), _params())

        self.assertEqual(service.requests, [])

    def test_each_api_provider_gets_the_closed_answer_schema_as_its_own_structured_output(
        self,
    ) -> None:
        for provider, protocol in (
            ("openai", "responses"),
            ("openai-compatible", "chat-completions"),
            ("openai-compatible", "responses"),
        ):
            with self.subTest(provider=provider, protocol=protocol):
                service = ProviderStandIn({"answer": "Grounded answer"})
                method = build_chat_method(_answering("Grounded answer", service))

                result = method(
                    RequestContext(6, Event(), _read), _params(provider, protocol),
                )

                self.assertEqual(result, {"answer": "Grounded answer"})
                self.assertEqual(len(service.requests), 1)
                request = service.requests[0]
                if provider == "openai":
                    self.assertNotIn("tools", request)
                    output_format = request["text"]["format"]
                    self.assertEqual(output_format["type"], "json_schema")
                    schema = output_format["schema"]
                else:
                    self.assertNotIn("response_format", request)
                    self.assertNotIn("text", request)
                    (tool,) = request["tools"]
                    function = tool if protocol == "responses" else tool["function"]
                    self.assertEqual(function["name"], "ChatAnswer")
                    self.assertIn("ChatAnswer", json.dumps(request["tool_choice"]))
                    schema = function["parameters"]
                self.assertEqual(schema["additionalProperties"], False)
                self.assertEqual(schema["required"], ["answer"])
                self.assertEqual(list(schema["properties"]), ["answer"])
                self.assertEqual(schema["properties"]["answer"]["minLength"], 1)
                self.assertEqual(schema["properties"]["answer"]["maxLength"], 20_000)
                self.assertEqual(developer_text(request, ChatAnswer), [])

    def test_the_answer_schema_is_the_released_one_without_titles_or_docstrings(self) -> None:
        self.assertEqual(ChatAnswer.model_json_schema(), released_schema("ChatAnswer"))
        with AnthropicStandIn({"answer": "Answer"}) as service:
            _ask(service.runtime, _paper_chat_context([]))
        (body,) = service.requests
        schema = body["output_config"]["format"]["schema"]
        self.assertEqual(developer_text(body, ChatAnswer), [])
        self.assertEqual(schema["additionalProperties"], False)
        self.assertEqual(schema["required"], ["answer"])
        self.assertIn("maxLength: 20000", schema["properties"]["answer"]["description"])

    def test_output_outside_the_answer_schema_is_a_structured_output_failure(self) -> None:
        for label, provider, protocol, service in (
            (
                "text instead of the answer tool", "openai-compatible", "chat-completions",
                ProviderStandIn(text="A plain answer"),
            ),
            (
                "an answer with an extra field", "openai-compatible", "chat-completions",
                ProviderStandIn({"answer": "Grounded answer", "confidence": "high"}),
            ),
            (
                "text that is not the answer object", "openai", "responses",
                ProviderStandIn(text="A plain answer"),
            ),
        ):
            with self.subTest(label):
                method = build_chat_method(_answering("unused", service))

                with self.assertRaises(HarnessFailure) as raised:
                    method(RequestContext(7, Event(), _read), _params(provider, protocol))

                self.assertEqual(raised.exception.kind, "model_error")
                self.assertEqual(raised.exception.detail, "structured_output")
                self.assertEqual(len(service.requests), 1)

    def test_output_a_provider_parser_cannot_read_is_a_structured_output_failure(self) -> None:
        method = build_chat_method(lambda _model, _limits: _UnreadableOutputModel())

        with self.assertRaises(HarnessFailure) as raised:
            method(RequestContext(8, Event(), _read), _params("anthropic", "messages"))

        self.assertEqual(raised.exception.kind, "model_error")
        self.assertEqual(raised.exception.detail, "structured_output")


class ChatPromptCacheTests(unittest.TestCase):
    def test_an_api_turn_sends_the_same_parts_with_the_paper_before_the_history(self) -> None:
        context = _paper_chat_context(_HISTORY)
        packed = ChatContext.model_validate(context).model_dump(
            mode="json", exclude={"paper": {"page_count"}},
        )
        before = (
            f"Conversation context:\n{_compact(packed)}\n\nCurrent user message:\nWhat changed?"
        )
        stable = {"title": packed["title"], "paper": packed["paper"]}
        expected = (
            f"Conversation context:\n{_compact(stable)}\n\n"
            f"Conversation history:\n{_compact(packed['history'])}\n\n"
            "Current user message:\nWhat changed?"
        )
        for route, (system, human) in _api_requests(context).items():
            with self.subTest(route=route):
                self.assertEqual(system, CHAT_INSTRUCTIONS)
                self.assertEqual(human, expected)
                parts = _parts(packed, "What changed?")
                self.assertEqual(sorted(parts.values()), sorted(_parts_of(before).values()))
                self.assertEqual(_parts_of(human), parts)
                order = [human.index(parts[name]) for name in _STABLE_FIRST]
                self.assertEqual(order, sorted(order))

    def test_an_api_turn_carries_the_mentioned_claims_after_the_history(self) -> None:
        plain = _api_requests(_paper_chat_context(_HISTORY))
        sent = _api_requests({**_paper_chat_context(_HISTORY), "wiki": _CLAIMS})
        for route, (system, human) in sent.items():
            with self.subTest(route=route):
                before, _, question = plain[route][1].partition("Current user message:\n")
                self.assertEqual(system, plain[route][0])
                self.assertEqual(human, (
                    f"{before}Mentioned Wiki claims:\n{_compact(_CLAIMS)}\n\n"
                    f"Current user message:\n{question}"
                ))
        with AnthropicStandIn({"answer": "Answer"}) as service:
            _ask(service.runtime, _paper_chat_context(_HISTORY))
            _ask(service.runtime, {**_paper_chat_context(_HISTORY), "wiki": _CLAIMS})
        cached = [body["messages"][0]["content"][0] for body in service.requests]
        self.assertEqual(cached[1], cached[0])

    def test_a_cli_turn_leaves_the_claims_to_its_lookups(self) -> None:
        def cli_call(context: dict[str, object]) -> object:
            calls: list[object] = []

            def read(method: str, params: object) -> object:
                if method == "model.invoke":
                    calls.append(params)
                    return {"output": "Answer"}
                return context

            build_chat_method()(RequestContext(35, Event(), read), _cli_params())
            return calls[0]

        mentioned = cli_call({**_paper_chat_context(_HISTORY), "wiki": _CLAIMS})
        self.assertEqual(mentioned, cli_call(_paper_chat_context(_HISTORY)))
        self.assertNotIn("Per-channel", json.dumps(mentioned))

    def test_mentioned_claims_count_toward_the_context_budget(self) -> None:
        context = _paper_chat_context([])
        paper = context["paper"]
        if not isinstance(paper, dict):
            raise AssertionError("the paper fixture must be an object")
        paper["pages"] = [{"number": 1, "text": "a" * 70_000}, {"number": 2, "text": "b" * 50_000}]
        claims = [
            {"ref": f"topics/long#claim-{n}", "page": "Long", "text": "c" * 1_000}
            for n in range(40)
        ]
        service = ProviderStandIn({"answer": "must not run"})
        method = build_chat_method(_answering("must not run", service))
        method(RequestContext(36, Event(), _reads({**context, "wiki": claims[:10]})), _params())

        with self.assertRaises(ProtocolViolation):
            method(RequestContext(37, Event(), _reads({**context, "wiki": claims})), _params())
        self.assertEqual(len(service.requests), 1)

    def test_consecutive_turns_of_a_paper_chat_share_the_whole_stable_prefix(self) -> None:
        turns = [_HISTORY[:0], _HISTORY[:2], _HISTORY]
        sent = [_api_requests(_paper_chat_context(history)) for history in turns]
        for route in sent[0]:
            with self.subTest(route=route):
                system, human = sent[0][route]
                stable = human[: human.index("\n\nCurrent user message:")]
                self.assertIn("Second page.", stable)
                self.assertIn("A note of mine.", stable)
                for later in sent[1:]:
                    self.assertEqual(later[route][0], system)
                    self.assertTrue(
                        later[route][1].startswith(f"{stable}\n\nConversation history:"),
                    )

    def test_an_anthropic_turn_ends_the_stable_context_with_a_five_minute_breakpoint(
        self,
    ) -> None:
        bodies = []
        for history in (_HISTORY[:0], _HISTORY[:2], _HISTORY):
            with AnthropicStandIn({"answer": "Answer"}) as service:
                _ask(service.runtime, _paper_chat_context(history))
            (body,) = service.requests
            bodies.append(body)
        for body in bodies:
            self.assertEqual(json.dumps(body).count("cache_control"), 1)
            (message,) = body["messages"]
            cached, rest = message["content"]
            self.assertEqual(cached["cache_control"], {"type": "ephemeral"})
            self.assertTrue(cached["text"].startswith("Conversation context:\n"))
            self.assertIn("Second page.", cached["text"])
            self.assertNotIn("Earlier", cached["text"])
            self.assertTrue(rest["text"].endswith("Current user message:\nWhat changed?"))
            self.assertEqual(body["system"], bodies[0]["system"])
            self.assertEqual(cached, bodies[0]["messages"][0]["content"][0])
        self.assertIn("Earlier answer", bodies[2]["messages"][0]["content"][1]["text"])

    def test_no_other_provider_is_sent_a_cache_breakpoint(self) -> None:
        for provider, protocol in (
            ("openai", "responses"), ("openai-compatible", "chat-completions"),
        ):
            with self.subTest(provider=provider):
                service = ProviderStandIn({"answer": "Answer"})
                build_chat_method(_answering("Answer", service))(
                    RequestContext(30, Event(), _reads(_paper_chat_context(_HISTORY))),
                    _params(provider, protocol),
                )
                self.assertNotIn("cache_control", json.dumps(service.requests[0]))

    def test_an_api_turn_logs_its_input_tokens_with_the_cached_ones(self) -> None:
        usage = {
            "input_tokens": 120, "output_tokens": 150,
            "cache_read_input_tokens": 15_000, "cache_creation_input_tokens": 0,
        }
        with (
            AnthropicStandIn({"answer": "Answer"}, usage) as service,
            self.assertLogs("meridian_harness", "INFO") as logged,
        ):
            _ask(service.runtime, _paper_chat_context(_HISTORY))
        (line,) = logged.output
        self.assertRegex(
            line,
            r"^INFO:meridian_harness\.workflows\.chat:anthropic stand-in-model: \d+\.\d s, "
            r"15120 input tokens \(15000 cached\), 150 output tokens$",
        )

        service = ProviderStandIn({"answer": "Answer"})
        with self.assertLogs("meridian_harness", "INFO") as logged:
            build_chat_method(_answering("Answer", service))(
                RequestContext(31, Event(), _read), _params(),
            )
        (line,) = logged.output
        self.assertRegex(
            line, r"openai paper-model: \d+\.\d s, 1 input tokens \(0 cached\), 1 output tokens$",
        )


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

    def test_a_cli_answer_cites_any_page_of_the_paper_its_tools_can_read(self) -> None:
        def read(method: str, params: object) -> object:
            if method == "model.invoke":
                return {"output": "The lookup supports this [p. 9] and [p. 12]."}
            return _read_with_pages(method, params)

        self.assertEqual(
            build_chat_method()(RequestContext(24, Event(), read), _cli_params()),
            {"answer": "The lookup supports this [p. 9] and [p. 12]."},
        )

    def test_a_cli_turn_keeps_the_page_count_out_of_the_prompt(self) -> None:
        calls: list[dict[str, object]] = []

        def read(method: str, params: object) -> object:
            if method == "model.invoke" and isinstance(params, dict):
                calls.append(params)
                return {"output": "Answer"}
            return _read_with_pages(method, params)

        build_chat_method()(RequestContext(25, Event(), read), _cli_params())
        self.assertNotIn("12", str(calls[0]["system"]))
        self.assertNotIn("page_count", str(calls[0]["system"]))

    def test_a_cli_answer_is_validated_like_any_other_answer(self) -> None:
        for output in (None, "   ", "Outside the paper [p. 13].", "Ambiguous range [pp. 1-2]."):
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


_HISTORY = [
    {"role": "user", "text": "Earlier question"},
    {"role": "assistant", "text": "Earlier answer"},
    {"role": "user", "text": "Second question"},
    {"role": "assistant", "text": "Second answer"},
]
_CLAIMS = [
    {"ref": "topics/kv#per-channel", "page": "KV cache", "text": "Per-channel keys keep accuracy."},
    {"ref": "topics/kv#prefix", "page": "KV cache", "text": "A prefix schedule halves memory."},
]
# The parts of a turn in the order an API request carries them.
_STABLE_FIRST = [
    "title", "paper metadata", "paper abstract", "paper pages", "reading", "history", "question",
]


def _compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _paper_chat_context(history: list[dict[str, str]]) -> dict[str, object]:
    return {
        "title": "Paper discussion",
        "history": history,
        "paper": {
            "id": "paper-1",
            "title": "Grounded paper",
            "authors": ["A. Author"],
            "year": 2024,
            "abstract": "An abstract.",
            "pages": [
                {"number": 1, "text": "First page."},
                {"number": 2, "text": "Second page."},
            ],
            "pageCount": 12,
            "reading": {
                "highlights": [{"page": 1, "quote": "First", "note": ""}],
                "notes": [{"page": 2, "text": "A note of mine."}],
                "remark": "",
            },
        },
    }


def _parts(packed: dict[str, Any], question: str) -> dict[str, str]:
    """Each part of a turn's context, packed as the prompt shows it, as the bytes it is sent as."""

    paper = packed["paper"]
    # Without its closing brace, the metadata is the bytes the paper object starts with.
    return {
        "title": _compact(packed["title"]),
        "paper metadata": _compact({
            key: value for key, value in paper.items()
            if key not in {"abstract", "pages", "reading"}
        })[:-1],
        "paper abstract": _compact(paper["abstract"]),
        "paper pages": _compact(paper["pages"]),
        "reading": _compact(paper["reading"]),
        "history": _compact(packed["history"]),
        "question": question,
    }


def _parts_of(human: str) -> dict[str, str]:
    """The parts of a human message in either layout: the history in the context, or after it."""

    body = human.removeprefix("Conversation context:\n")
    body, question = body.split("\n\nCurrent user message:\n")
    context, _, history = body.partition("\n\nConversation history:\n")
    packed = json.loads(context)
    if history:
        packed["history"] = json.loads(history)
    return _parts(packed, question)


def _reads(context: dict[str, object]) -> Callable[[str, object], object]:
    def read(method: str, _params: object) -> object:
        if method != "chat.context":
            raise AssertionError(f"Unexpected callback: {method}")
        return context

    return read


def _ask(runtime: dict[str, object], context: dict[str, object]) -> object:
    return build_chat_method()(
        RequestContext(32, Event(), _reads(context)),
        {**_params(), "model": runtime},
    )


def _api_requests(context: dict[str, object]) -> dict[str, tuple[str, str]]:
    """The system text and the human text each API route sends for one turn in `context`."""

    sent: dict[str, tuple[str, str]] = {}
    responses = ProviderStandIn({"answer": "Answer"})
    build_chat_method(_answering("Answer", responses))(
        RequestContext(33, Event(), _reads(context)), _params(),
    )
    system, human = responses.requests[0]["input"]
    sent["openai-responses"] = (system["content"], human["content"])
    completions = ProviderStandIn({"answer": "Answer"})
    build_chat_method(_answering("Answer", completions))(
        RequestContext(34, Event(), _reads(context)),
        _params("openai-compatible", "chat-completions"),
    )
    system, human = completions.requests[0]["messages"]
    sent["compatible-chat"] = (system["content"], human["content"])
    with AnthropicStandIn({"answer": "Answer"}) as anthropic:
        _ask(anthropic.runtime, context)
    body = anthropic.requests[0]
    (message,) = body["messages"]
    content = message["content"]
    text = content if isinstance(content, str) else "".join(block["text"] for block in content)
    sent["anthropic-messages"] = (body["system"], text)
    return sent


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
            "pageCount": 12,
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
            "pageCount": 2,
            "reading": {"highlights": [], "notes": [], "remark": ""},
        },
    }


def _params(provider: str = "openai", protocol: str = "responses") -> dict[str, object]:
    return {
        "chatId": "chat-1",
        "text": "What changed?",
        "model": {
            "provider": provider,
            "protocol": protocol,
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
