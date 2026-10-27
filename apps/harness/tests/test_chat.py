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
    ChatDesignAnswer,
    ChatIdeaAnswer,
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

    def test_takes_a_message_of_20000_typed_characters_with_the_ids_core_adds_on_top(self) -> None:
        text = "a" * 19_978 + "@KV cache quantization (Wiki page topics/kv-cache-quantization)"
        service = ProviderStandIn({"answer": "Answer"})
        params = {**_params(), "text": text}

        result = build_chat_method(_answering("Answer", service))(
            RequestContext(9, Event(), _read), params,
        )

        self.assertEqual(result, {"answer": "Answer"})
        self.assertTrue(service.requests[0]["input"][1]["content"].endswith(text))

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

    def test_an_api_answer_failing_its_schema_logs_the_output_cap_and_model_limit(self) -> None:
        method = build_chat_method(_answering("unused", ProviderStandIn(text="A plain answer")))
        params = {
            **_params("openai-compatible", "chat-completions"),
            "limits": {"maxOutputTokens": 40_000, "minOutputTokens": 2_000, "maxModelCalls": 1},
        }

        with self.assertLogs("meridian_harness", "WARNING") as logged, \
                self.assertRaises(HarnessFailure) as raised:
            method(RequestContext(9, Event(), _read), params)

        self.assertEqual(raised.exception.detail, "structured_output")
        self.assertEqual(logged.output, [
            "WARNING:meridian_harness.models:the output of paper-model did not validate; "
            "its output cap was 8192 tokens, the model takes at most 8192",
        ])

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
        self.assertEqual(set(call), {"system", "prompt", "message", "context"})
        self.assertEqual(call["message"], "What changed?")

    def test_a_cli_turn_hands_core_the_context_its_system_prompt_shows(self) -> None:
        calls: list[dict[str, object]] = []

        def read(method: str, params: object) -> object:
            if method != "model.invoke":
                context = _read_with_pages(method, params)
                if not isinstance(context, dict):
                    raise AssertionError("chat.context must be an object")
                return {**context, "history": [{"role": "user", "text": "Earlier question"}]}
            if not isinstance(params, dict):
                raise AssertionError("model.invoke params must be an object")
            calls.append(params)
            return {"output": "Answer"}

        build_chat_method()(RequestContext(25, Event(), read), _cli_params())

        context = calls[0]["context"]
        if not isinstance(context, dict):
            raise AssertionError("the context must be an object")
        self.assertNotIn("history", context)
        self.assertNotIn("page_count", context["paper"])
        shown = json.dumps(context, ensure_ascii=False, separators=(",", ":"))
        self.assertTrue(str(calls[0]["system"]).endswith(f"Conversation context:\n{shown}"))

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


def _ask(
    runtime: dict[str, object], context: dict[str, object], *, mode: str = "answer",
) -> object:
    return build_chat_method()(
        RequestContext(32, Event(), _reads(context)),
        {**_params(), "model": runtime, "mode": mode},
    )


def _api_requests(
    context: dict[str, object], *, mode: str = "answer",
) -> dict[str, tuple[str, str]]:
    """The system text and the human text each API route sends for one turn of `mode` in
    `context`."""

    output = {"answer": "Answer", **({mode: None} if mode != "answer" else {})}
    sent: dict[str, tuple[str, str]] = {}
    responses = ProviderStandIn(output)
    build_chat_method(_answering("Answer", responses))(
        RequestContext(33, Event(), _reads(context)), {**_params(), "mode": mode},
    )
    system, human = responses.requests[0]["input"]
    sent["openai-responses"] = (system["content"], human["content"])
    completions = ProviderStandIn(output)
    build_chat_method(_answering("Answer", completions))(
        RequestContext(34, Event(), _reads(context)),
        {**_params("openai-compatible", "chat-completions"), "mode": mode},
    )
    system, human = completions.requests[0]["messages"]
    sent["compatible-chat"] = (system["content"], human["content"])
    with AnthropicStandIn(output) as anthropic:
        _ask(anthropic.runtime, context, mode=mode)
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


def _design(**changes: object) -> dict[str, object]:
    """An experiment design that passes every check, with `changes` applied at its top level."""

    design: dict[str, object] = {
        "claim": {
            "text": "Dynamic tree width beats a fixed width at large batch.",
            "status": "hypothesis",
        },
        "explanations": {
            "m1": "Width follows acceptance, so fewer doomed branches are verified.",
            "m2": "Only the smaller mean width helps; a fixed tree of that width ties.",
            "m0": "Batch composition or warmup differs between the arms.",
        },
        "predictions": [
            {
                "regime": "B 16 to 64 against a fixed tree of equal mean width",
                "m1": "gap grows with B", "m2": "no gap", "m0": None,
                "metric": "tokens/s", "chosen": True,
            },
        ],
        "experiment": {
            "substrate": "component",
            "keeps": "batch-dependent verification cost",
            "untested": "arrival traffic and the scheduler",
        },
        "decisions": [
            {"pattern": "output distribution differs", "outcome": "invalid",
             "interpretation": "invalid test", "next": "repair and rerun"},
            {"pattern": "gain at least 8% at B >= 32", "outcome": "expand",
             "interpretation": "supports M1", "next": "full serving system"},
            {"pattern": "95% CI within 2% at B >= 32", "outcome": "kill",
             "interpretation": "required effect excluded", "next": "close the node"},
            {"pattern": "CI crosses 0 and is wider than 8%", "outcome": "inconclusive",
             "interpretation": "undecided", "next": "more request blocks"},
        ],
        "ledger": [
            {"statement": "Speedup depends on acceptance.", "status": "source",
             "anchor": {"kind": "wiki", "ref": "topics/speculative-decoding#acceptance-rate"}},
            {"statement": "Verification dominates at large batch.", "status": "inference",
             "anchor": None},
        ],
    }
    design.update(changes)
    return design


def _read_with_wiki(method: str, _params: object) -> object:
    if method != "chat.context":
        raise AssertionError(f"Unexpected callback: {method}")
    return {
        "title": "Tree width",
        "history": [],
        "wiki": [{
            "ref": "topics/speculative-decoding#acceptance-rate",
            "page": "Speculative decoding",
            "text": "Speedup depends mainly on draft acceptance.",
        }],
    }


def _design_params(**changes: object) -> dict[str, object]:
    return {**_params(), "mode": "design", **changes}


class ChatDesignTests(unittest.TestCase):
    def test_a_design_turn_returns_the_answer_and_its_design_through_a_closed_schema(self) -> None:
        service = ProviderStandIn({"answer": "Testable.", "design": _design()})
        method = build_chat_method(_answering("unused", service))

        result = method(RequestContext(40, Event(), _read_with_wiki), _design_params())

        self.assertEqual(result, {"answer": "Testable.", "design": _design()})
        schema = service.requests[0]["text"]["format"]["schema"]
        self.assertEqual(schema["additionalProperties"], False)
        self.assertEqual(sorted(schema["required"]), ["answer", "design"])
        self.assertEqual(schema["properties"]["answer"]["maxLength"], 2_000)
        user = str(service.requests[0]["input"][1]["content"])
        self.assertIn("prediction", user)
        self.assertIn("an imprecise null is never a kill", user)

    def test_an_ordinary_turn_keeps_the_answer_only_schema_and_prompt(self) -> None:
        service = ProviderStandIn({"answer": "Plain."})
        method = build_chat_method(_answering("unused", service))

        result = method(RequestContext(41, Event(), _read), _params())

        self.assertEqual(result, {"answer": "Plain."})
        schema = service.requests[0]["text"]["format"]["schema"]
        self.assertEqual(list(schema["properties"]), ["answer"])
        self.assertNotIn("an imprecise null is never a kill", json.dumps(service.requests[0]))

    def test_a_design_turn_may_answer_without_a_design(self) -> None:
        service = ProviderStandIn({"answer": "Name the claim you want to test.", "design": None})
        method = build_chat_method(_answering("unused", service))

        self.assertEqual(
            method(RequestContext(42, Event(), _read), _design_params()),
            {"answer": "Name the claim you want to test.", "design": None},
        )

    def test_a_design_that_breaks_a_rule_is_a_structured_output_failure(self) -> None:
        unchosen = [{**row, "chosen": False} for row in _design()["predictions"]]  # type: ignore[union-attr]
        two_chosen = [*_design()["predictions"], {**_design()["predictions"][0], "regime": "B = 1"}]  # type: ignore[index]
        decisions = list(_design()["decisions"])  # type: ignore[call-overload]
        unanchored = [{"statement": "Speedup depends on acceptance.", "status": "source",
                       "anchor": None}]
        foreign = [{"statement": "Speedup depends on acceptance.", "status": "source",
                    "anchor": {"kind": "wiki", "ref": "topics/other#made-up"}}]
        claim_ref = "topics/speculative-decoding#acceptance-rate"
        inferred_anchor = [{"statement": "A guess.", "status": "inference",
                            "anchor": {"kind": "wiki", "ref": claim_ref}}]
        paper_anchor = [{"statement": "Page two says so.", "status": "source",
                         "anchor": {"kind": "source", "paper": "paper-1", "page": 2}}]
        for label, design in (
            ("no row chosen", _design(predictions=unchosen)),
            ("two rows chosen", _design(predictions=two_chosen)),
            ("no kill row", _design(decisions=[r for r in decisions if r["outcome"] != "kill"])),
            ("a repeated outcome", _design(decisions=[*decisions, decisions[0]])),
            ("a source statement without an anchor", _design(ledger=unanchored)),
            ("an anchor the turn could not read", _design(ledger=foreign)),
            ("an anchor on an inference", _design(ledger=inferred_anchor)),
            ("a paper anchor in a chat without a paper", _design(ledger=paper_anchor)),
            ("an extra field", _design(novelty="unchecked")),
            ("an unknown outcome",
             _design(decisions=[*decisions[:3], {**decisions[3], "outcome": "maybe"}])),
        ):
            with self.subTest(label):
                service = ProviderStandIn({"answer": "Testable.", "design": design})
                method = build_chat_method(_answering("unused", service))

                with self.assertRaises(HarnessFailure) as raised:
                    method(RequestContext(43, Event(), _read_with_wiki), _design_params())

                self.assertEqual(raised.exception.kind, "model_error")
                self.assertEqual(raised.exception.detail, "structured_output")
                self.assertEqual(len(service.requests), 1)

    def test_a_design_may_anchor_a_page_of_the_chat_paper(self) -> None:
        paper_anchor = [{"statement": "Page two says so.", "status": "source",
                         "anchor": {"kind": "source", "paper": "paper-1", "page": 2}}]
        service = ProviderStandIn({"answer": "Testable.", "design": _design(ledger=paper_anchor)})
        method = build_chat_method(_answering("unused", service))

        result = method(RequestContext(44, Event(), _read_with_pages), _design_params())

        self.assertEqual(result["design"]["ledger"], paper_anchor)  # type: ignore[index]

    def test_a_cli_design_turn_asks_core_for_one_structured_call_with_the_whole_turn(self) -> None:
        calls: list[dict[str, object]] = []
        vault_anchor = [{"statement": "Read with the lookup tools.", "status": "source",
                         "anchor": {"kind": "wiki", "ref": "methods/draft-heads"}}]

        def read(method: str, params: object) -> object:
            if method == "model.invoke":
                if not isinstance(params, dict):
                    raise AssertionError("model.invoke params must be an object")
                calls.append(params)
                return {"output": {"answer": "Testable.", "design": _design(ledger=vault_anchor)}}
            context = _read_with_wiki(method, params)
            if not isinstance(context, dict):
                raise AssertionError("chat.context must be an object")
            return {**context, "history": [{"role": "user", "text": "Earlier question"}]}

        params = {**_cli_params(), "mode": "design"}
        result = build_chat_method()(RequestContext(45, Event(), read), params)

        self.assertEqual(result, {"answer": "Testable.", "design": _design(ledger=vault_anchor)})
        (call,) = calls
        self.assertEqual(set(call), {"system", "prompt", "schema"})
        self.assertIn("an imprecise null is never a kill", str(call["prompt"]))
        self.assertIn("Earlier question", str(call["prompt"]))
        self.assertTrue(str(call["prompt"]).endswith("Current user message:\nWhat changed?"))
        self.assertEqual(call["schema"]["additionalProperties"], False)  # type: ignore[index]

    def test_a_design_turn_shares_the_chat_turn_stable_prefix_and_adds_its_instructions_last(
        self,
    ) -> None:
        context = {**_paper_chat_context(_HISTORY), "wiki": _CLAIMS}
        chat = _api_requests(context)
        design = _api_requests(context, mode="design")
        for route, (chat_system, chat_user) in chat.items():
            with self.subTest(route=route):
                design_system, design_text = design[route]
                self.assertEqual(design_system, chat_system)
                stable = chat_user.split("Current user message:", 1)[0]
                for part in ("Second page.", "Earlier answer", "Per-channel keys keep accuracy."):
                    self.assertIn(part, stable)
                self.assertTrue(design_text.startswith(stable))
                self.assertLess(
                    design_text.index("an imprecise null is never a kill"),
                    design_text.index("Current user message:"),
                )
                self.assertTrue(design_text.endswith("Current user message:\nWhat changed?"))
        with AnthropicStandIn({"answer": "Answer"}) as chat_service:
            _ask(chat_service.runtime, context)
        with AnthropicStandIn({"answer": "Testable.", "design": None}) as design_service:
            _ask(design_service.runtime, context, mode="design")
        cached = [
            service.requests[0]["messages"][0]["content"][0]
            for service in (chat_service, design_service)
        ]
        self.assertEqual(cached[0]["cache_control"], {"type": "ephemeral"})
        self.assertEqual(cached[1], cached[0])

    def test_the_design_schema_is_the_pinned_one_without_titles_or_docstrings(self) -> None:
        self.assertEqual(
            ChatDesignAnswer.model_json_schema(), released_schema("ChatDesignAnswer"),
        )
        for provider, protocol in (
            ("openai", "responses"),
            ("openai-compatible", "chat-completions"),
            ("openai-compatible", "responses"),
        ):
            with self.subTest(provider=provider, protocol=protocol):
                service = ProviderStandIn({"answer": "Testable.", "design": None})
                build_chat_method(_answering("unused", service))(
                    RequestContext(50, Event(), _read),
                    {**_params(provider, protocol), "mode": "design"},
                )
                (request,) = service.requests
                if provider != "openai":
                    (tool,) = request["tools"]
                    function = tool if protocol == "responses" else tool["function"]
                    self.assertEqual(function["name"], "ChatDesignAnswer")
                self.assertEqual(developer_text(request, ChatDesignAnswer), [])
        with AnthropicStandIn({"answer": "Testable.", "design": None}) as anthropic:
            _ask(anthropic.runtime, _paper_chat_context([]), mode="design")
        (body,) = anthropic.requests
        self.assertEqual(developer_text(body, ChatDesignAnswer), [])

    def test_a_cli_design_turn_carries_the_mentioned_claims_after_the_history(self) -> None:
        calls: list[dict[str, object]] = []

        def read(method: str, params: object) -> object:
            if method == "model.invoke":
                if not isinstance(params, dict):
                    raise AssertionError("model.invoke params must be an object")
                calls.append(params)
                return {"output": {"answer": "Testable.", "design": None}}
            return {**_paper_chat_context(_HISTORY), "wiki": _CLAIMS}

        build_chat_method()(RequestContext(51, Event(), read), {**_cli_params(), "mode": "design"})

        (call,) = calls
        prompt = str(call["prompt"])
        self.assertNotIn("Per-channel", str(call["system"]))
        self.assertLess(prompt.index("Second answer"), prompt.index("Per-channel keys"))
        self.assertLess(
            prompt.index("Per-channel keys"), prompt.index("an imprecise null is never a kill"),
        )

    def test_a_cli_design_turn_keeps_the_chat_system_prompt_and_puts_its_instructions_last(
        self,
    ) -> None:
        def call(params: dict[str, object]) -> dict[str, object]:
            calls: list[dict[str, object]] = []

            def read(method: str, value: object) -> object:
                if method == "model.invoke":
                    if not isinstance(value, dict):
                        raise AssertionError("model.invoke params must be an object")
                    calls.append(value)
                    designed = {"answer": "Testable.", "design": None}
                    return {"output": designed if "schema" in value else "Plain."}
                context = _read_with_pages(method, value)
                if not isinstance(context, dict):
                    raise AssertionError("chat.context must be an object")
                return {**context, "history": [{"role": "user", "text": "Earlier question"}]}

            build_chat_method()(RequestContext(49, Event(), read), params)
            return calls[0]

        chat = call(_cli_params())
        design = call({**_cli_params(), "mode": "design"})

        self.assertEqual(design["system"], chat["system"])
        history = str(chat["prompt"]).split("Current user message:", 1)[0]
        self.assertIn("Earlier question", history)
        prompt = str(design["prompt"])
        self.assertTrue(prompt.startswith(history))
        instructions = prompt.index("an imprecise null is never a kill")
        self.assertLess(instructions, prompt.index("Current user message:"))

    def test_a_cli_design_output_is_validated_like_any_other_design(self) -> None:
        empty = {"answer": "Testable.", "design": _design(predictions=[])}
        for output in (None, "A plain answer", empty):
            with self.subTest(output=output):

                def read(method: str, params: object, answer: object = output) -> object:
                    if method == "model.invoke":
                        return {"output": answer}
                    return _read_with_wiki(method, params)

                with self.assertRaises(HarnessFailure) as raised:
                    build_chat_method()(
                        RequestContext(46, Event(), read), {**_cli_params(), "mode": "design"},
                    )

                self.assertEqual(raised.exception.kind, "model_error")
                self.assertEqual(raised.exception.detail, "structured_output")


def _idea(**changes: object) -> dict[str, object]:
    """An idea draft that passes every check, with `changes` applied."""

    idea: dict[str, object] = {
        "title": "Width that follows acceptance at large batch",
        "body": (
            "Grow the draft tree where acceptance is high.\n\n"
            "Builds on EAGLE; still open: the gain at B >= 32."
        ),
        "sources": [1, 2],
    }
    idea.update(changes)
    return idea


def _read_with_history(method: str, _params: object) -> object:
    if method != "chat.context":
        raise AssertionError(f"Unexpected callback: {method}")
    return {
        "title": "Tree width",
        "history": [
            {"role": "user", "text": "Could width follow acceptance?"},
            {"role": "assistant", "text": "It could, at large batch."},
        ],
    }


def _idea_params() -> dict[str, object]:
    return {**_params(), "mode": "idea"}


class ChatIdeaTests(unittest.TestCase):
    def test_an_idea_turn_returns_the_answer_and_its_draft_through_a_closed_schema(self) -> None:
        service = ProviderStandIn({"answer": "Drafted.", "idea": _idea()})
        method = build_chat_method(_answering("unused", service))

        result = method(RequestContext(60, Event(), _read_with_history), _idea_params())

        self.assertEqual(result, {"answer": "Drafted.", "idea": _idea()})
        schema = service.requests[0]["text"]["format"]["schema"]
        self.assertEqual(schema["additionalProperties"], False)
        self.assertEqual(sorted(schema["required"]), ["answer", "idea"])
        user = str(service.requests[0]["input"][1]["content"])
        self.assertIn("stand alone as a research contribution", user)
        rule = user.index("stand alone as a research contribution")
        self.assertLess(user.index("Conversation history:"), rule)
        self.assertLess(rule, user.index("Current user message:"))

    def test_an_idea_turn_merges_the_related_turns_and_names_the_threads_left_out(self) -> None:
        service = ProviderStandIn({"answer": "Drafted.", "idea": _idea()})
        method = build_chat_method(_answering("unused", service))

        method(RequestContext(60, Event(), _read_with_history), _idea_params())

        user = str(service.requests[0]["input"][1]["content"])
        self.assertIn("Read the whole conversation", user)
        self.assertIn("merge them into one idea", user)
        self.assertIn("name in `answer` each thread you left out", user)

    def test_an_idea_turn_may_answer_without_a_draft(self) -> None:
        service = ProviderStandIn({"answer": "Only findings so far.", "idea": None})
        method = build_chat_method(_answering("unused", service))

        self.assertEqual(
            method(RequestContext(61, Event(), _read_with_history), {**_params(), "mode": "idea"}),
            {"answer": "Only findings so far.", "idea": None},
        )

    def test_an_idea_that_breaks_a_rule_is_a_structured_output_failure(self) -> None:
        for label, idea in (
            ("a title over 80 characters", _idea(title="t" * 81)),
            ("a title on two lines", _idea(title="one\ntwo")),
            ("no source turn", _idea(sources=[])),
            ("a source turn the conversation does not have", _idea(sources=[4])),
            ("a source turn of zero", _idea(sources=[0])),
            ("a repeated source turn", _idea(sources=[1, 1])),
            ("an extra field", _idea(project="draft")),
        ):
            with self.subTest(label):
                service = ProviderStandIn({"answer": "Drafted.", "idea": idea})
                method = build_chat_method(_answering("unused", service))

                with self.assertRaises(HarnessFailure) as raised:
                    method(RequestContext(62, Event(), _read_with_history), _idea_params())

                self.assertEqual(raised.exception.kind, "model_error")
                self.assertEqual(raised.exception.detail, "structured_output")
                self.assertEqual(len(service.requests), 1)

    def test_the_current_message_counts_as_the_turn_after_the_history(self) -> None:
        service = ProviderStandIn({"answer": "Drafted.", "idea": _idea(sources=[3])})
        method = build_chat_method(_answering("unused", service))

        result = method(RequestContext(63, Event(), _read_with_history), _idea_params())

        self.assertEqual(result["idea"]["sources"], [3])  # type: ignore[index]

    def test_an_idea_turn_shares_the_chat_turn_stable_prefix(self) -> None:
        context = _paper_chat_context([{"role": "user", "text": "Earlier question"}])
        chat = _api_requests(context)
        idea = _api_requests(context, mode="idea")

        for route, (system, human) in chat.items():
            with self.subTest(route=route):
                idea_system, idea_human = idea[route]
                self.assertEqual(idea_system, system)
                stable = human.split("Current user message:", 1)[0]
                self.assertTrue(idea_human.startswith(stable))
                self.assertIn("stand alone as a research contribution", idea_human[len(stable):])

    def test_a_cli_idea_turn_asks_core_for_one_structured_call(self) -> None:
        calls: list[dict[str, object]] = []

        def read(method: str, params: object) -> object:
            if method == "model.invoke":
                if not isinstance(params, dict):
                    raise AssertionError("model.invoke params must be an object")
                calls.append(params)
                return {"output": {"answer": "Drafted.", "idea": _idea()}}
            return _read_with_history(method, params)

        params = {**_cli_params(), "mode": "idea"}
        result = build_chat_method()(RequestContext(64, Event(), read), params)

        self.assertEqual(result, {"answer": "Drafted.", "idea": _idea()})
        (call,) = calls
        self.assertEqual(set(call), {"system", "prompt", "schema"})
        self.assertIn("stand alone as a research contribution", str(call["prompt"]))
        self.assertEqual(call["schema"], ChatIdeaAnswer.model_json_schema())

    def test_the_idea_schema_is_the_pinned_one_without_titles_or_docstrings(self) -> None:
        self.assertEqual(ChatIdeaAnswer.model_json_schema(), released_schema("ChatIdeaAnswer"))
        service = ProviderStandIn({"answer": "Drafted.", "idea": None})
        build_chat_method(_answering("unused", service))(
            RequestContext(65, Event(), _read),
            {**_params("openai-compatible", "chat-completions"), "mode": "idea"},
        )
        (request,) = service.requests
        (tool,) = request["tools"]
        self.assertEqual(tool["function"]["name"], "ChatIdeaAnswer")
        self.assertEqual(developer_text(request, ChatIdeaAnswer), [])

    def test_an_idea_turn_reads_a_history_longer_than_an_ordinary_turn_keeps(self) -> None:
        history = [
            {"role": "user" if at % 2 == 0 else "assistant", "text": f"Turn {at + 1}"}
            for at in range(60)
        ]

        def read(method: str, _params: object) -> object:
            if method != "chat.context":
                raise AssertionError(f"Unexpected callback: {method}")
            return {"title": "Long chat", "history": history}

        service = ProviderStandIn({"answer": "Drafted.", "idea": _idea(sources=[1, 59, 61])})
        result = build_chat_method(_answering("unused", service))(
            RequestContext(67, Event(), read), {**_params(), "mode": "idea"},
        )

        self.assertEqual(result["idea"]["sources"], [1, 59, 61])  # type: ignore[index]
        self.assertIn("Turn 1", str(service.requests[0]["input"][1]["content"]))

    def test_an_unknown_mode_is_a_protocol_violation(self) -> None:
        with self.assertRaises(ProtocolViolation):
            build_chat_method(_answering("unused"))(
                RequestContext(66, Event(), _read), {**_params(), "mode": "summary"},
            )


if __name__ == "__main__":
    unittest.main()
