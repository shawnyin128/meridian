"""Tests for the bounded LangGraph chat workflow."""

import json
import unittest
from collections.abc import Callable
from threading import Event

from langchain_core.exceptions import OutputParserException
from langchain_core.language_models import BaseChatModel, GenericFakeChatModel
from langchain_core.runnables import Runnable, RunnableLambda
from provider_stand_in import ProviderStandIn

from meridian_harness.protocol import ProtocolViolation
from meridian_harness.server import CoreCallbackError, HarnessFailure, RequestContext
from meridian_harness.workflows.chat import CHAT_GRAPH, CHAT_PROMPT, build_chat_method


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
    return {**_params(), "design": True, **changes}


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
        system = str(service.requests[0]["input"][0]["content"])
        self.assertIn("prediction", system)
        self.assertIn("an imprecise null is never a kill", system)

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

        params = {**_cli_params(), "design": True}
        result = build_chat_method()(RequestContext(45, Event(), read), params)

        self.assertEqual(result, {"answer": "Testable.", "design": _design(ledger=vault_anchor)})
        (call,) = calls
        self.assertEqual(set(call), {"system", "prompt", "schema"})
        self.assertIn("an imprecise null is never a kill", str(call["system"]))
        self.assertIn("Earlier question", str(call["prompt"]))
        self.assertTrue(str(call["prompt"]).endswith("Current user message:\nWhat changed?"))
        self.assertEqual(call["schema"]["additionalProperties"], False)  # type: ignore[index]

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
                        RequestContext(46, Event(), read), {**_cli_params(), "design": True},
                    )

                self.assertEqual(raised.exception.kind, "model_error")
                self.assertEqual(raised.exception.detail, "structured_output")


if __name__ == "__main__":
    unittest.main()
