"""Tests for LangChain model construction without external requests."""

import unittest
from types import SimpleNamespace
from unittest import mock

from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from meridian_harness.models import (
    CONNECTION_CHECK_TIMEOUT_SECONDS,
    MAX_CONNECTION_ERROR_DETAIL,
    ModelConfigurationError,
    ModelInvocationError,
    check_model_connection,
    create_chat_model,
    list_models,
)


class ModelFactoryTests(unittest.TestCase):
    def test_builds_openai_responses_model_without_retries_or_storage(self) -> None:
        model = create_chat_model(_model("openai", protocol="responses"), _limits())

        self.assertIsInstance(model, ChatOpenAI)
        self.assertEqual(model.max_retries, 0)
        self.assertTrue(model.use_responses_api)
        self.assertFalse(model.store)
        self.assertEqual(model.max_tokens, 6000)

    def test_builds_anthropic_and_gemini_models_through_langchain(self) -> None:
        anthropic = create_chat_model(
            _model("anthropic", "https://api.anthropic.com", "messages"),
            _limits(),
        )
        gemini = create_chat_model(
            _model(
                "google-gemini",
                "https://generativelanguage.googleapis.com/v1beta",
                "generate-content",
            ),
            _limits(),
        )

        self.assertIsInstance(anthropic, ChatAnthropic)
        self.assertEqual(anthropic.max_retries, 0)
        self.assertIsInstance(gemini, ChatGoogleGenerativeAI)
        self.assertEqual(gemini.max_retries, 0)

    def test_builds_both_openai_compatible_protocols_without_provider_retries(self) -> None:
        responses = create_chat_model(
            _model("openai-compatible", "https://api.example.test", "responses"),
            _limits(),
        )
        chat_completions = create_chat_model(
            _model("openai-compatible", "https://api.example.test", "chat-completions"),
            _limits(),
        )

        self.assertIsInstance(responses, ChatOpenAI)
        self.assertTrue(responses.use_responses_api)
        self.assertEqual(responses.max_retries, 0)
        self.assertIsInstance(chat_completions, ChatOpenAI)
        self.assertFalse(chat_completions.use_responses_api)
        self.assertEqual(chat_completions.max_retries, 0)
        self.assertEqual(chat_completions.extra_body, {"max_tokens": 6000})
        self.assertIsNone(chat_completions.max_tokens)

    def test_builds_each_provider_model_at_the_effort_its_integration_takes(self) -> None:
        openai = create_chat_model({**_model("openai"), "effort": "xhigh"}, _limits())
        anthropic = create_chat_model(
            {**_model("anthropic", "https://api.anthropic.com", "messages"), "effort": "max"},
            _limits(),
        )
        gemini = create_chat_model(
            {
                **_model(
                    "google-gemini",
                    "https://generativelanguage.googleapis.com/v1beta",
                    "generate-content",
                ),
                "effort": "minimal",
            },
            _limits(),
        )

        self.assertIsInstance(openai, ChatOpenAI)
        self.assertEqual(openai._get_request_payload("hi")["reasoning"], {"effort": "xhigh"})
        self.assertIsInstance(anthropic, ChatAnthropic)
        self.assertEqual(anthropic._get_request_payload("hi")["output_config"], {"effort": "max"})
        self.assertIsInstance(gemini, ChatGoogleGenerativeAI)
        self.assertEqual(gemini.thinking_level, "minimal")

    def test_builds_each_provider_model_at_its_own_default_effort_without_one(self) -> None:
        openai = create_chat_model(_model("openai"), _limits())
        anthropic = create_chat_model(
            _model("anthropic", "https://api.anthropic.com", "messages"), _limits()
        )
        gemini = create_chat_model(
            _model(
                "google-gemini",
                "https://generativelanguage.googleapis.com/v1beta",
                "generate-content",
            ),
            _limits(),
        )

        self.assertNotIn("reasoning", openai._get_request_payload("hi"))
        self.assertNotIn("output_config", anthropic._get_request_payload("hi"))
        self.assertIsNone(gemini.thinking_level)

    def test_rejects_an_effort_its_provider_does_not_take_before_constructing_a_model(self) -> None:
        for provider, base_url, protocol, effort in (
            ("openai", "https://api.openai.com/v1", "responses", "ultra"),
            ("anthropic", "https://api.anthropic.com", "messages", "none"),
            (
                "google-gemini",
                "https://generativelanguage.googleapis.com/v1beta",
                "generate-content",
                "xhigh",
            ),
            ("openai-compatible", "https://api.example.test", "chat-completions", "low"),
            ("openai", "https://api.openai.com/v1", "responses", 3),
            ("openai", "https://api.openai.com/v1", "responses", ["high"]),
        ):
            with self.subTest(provider=provider, effort=effort), self.assertRaisesRegex(
                ModelConfigurationError, "reasoning effort"
            ):
                create_chat_model(
                    {**_model(provider, base_url, protocol), "effort": effort}, _limits()
                )

    def test_gives_each_provider_model_the_call_timeout_core_sets(self) -> None:
        limits = {**_limits(), "timeoutSeconds": 600}
        openai = create_chat_model(_model("openai"), limits)
        anthropic = create_chat_model(
            _model("anthropic", "https://api.anthropic.com", "messages"), limits
        )
        gemini = create_chat_model(
            _model(
                "google-gemini",
                "https://generativelanguage.googleapis.com/v1beta",
                "generate-content",
            ),
            limits,
        )

        self.assertEqual(openai.request_timeout, 600)
        self.assertEqual(anthropic.default_request_timeout, 600)
        self.assertEqual(gemini.timeout, 600)
        self.assertEqual(create_chat_model(_model("openai"), _limits()).request_timeout, 120)

    def test_rejects_a_call_timeout_that_is_not_a_bounded_number_of_seconds(self) -> None:
        for timeout in (0, -1, 901, True, "600"):
            with self.subTest(timeout=timeout), self.assertRaisesRegex(
                ModelConfigurationError, "timeoutSeconds"
            ):
                create_chat_model(_model("openai"), {**_limits(), "timeoutSeconds": timeout})

    def test_rejects_unknown_provider_before_constructing_a_model(self) -> None:
        with self.assertRaises(ModelConfigurationError):
            create_chat_model(_model("unknown"), _limits())

    def test_rejects_cleartext_remote_endpoints_before_constructing_a_model(self) -> None:
        with self.assertRaisesRegex(ModelConfigurationError, "must use HTTPS"):
            create_chat_model(
                _model("openai-compatible", "http://provider.example/v1", "chat-completions"),
                _limits(),
            )

    def test_rejects_a_budget_that_allows_hidden_extra_model_calls(self) -> None:
        limits = _limits()
        limits["maxModelCalls"] = 2
        with self.assertRaisesRegex(ModelConfigurationError, "must equal 1"):
            create_chat_model(_model("openai"), limits)

    def test_sanitizes_rate_limit_errors(self) -> None:
        class RateLimitError(Exception):
            status_code = 429

        failure = ModelInvocationError.from_exception(RateLimitError("secret response body"))
        self.assertIn("429", str(failure))
        self.assertNotIn("secret response body", str(failure))

    def test_connection_check_uses_one_output_token_and_discards_content(self) -> None:
        observed: dict[str, object] = {}

        class FixedModel:
            def invoke(self, messages: object) -> object:
                observed["messages"] = messages
                return {"secret": "discarded provider content"}

        def factory(model: object, limits: object, **options: object) -> FixedModel:
            observed.update({"model": model, "limits": limits, "options": options})
            return FixedModel()

        result = check_model_connection(_model("openai"), factory)

        self.assertEqual(
            result,
            {"state": "connected", "modelCalls": 1, "maxOutputTokens": 1},
        )
        self.assertEqual(observed["limits"], {"maxOutputTokens": 1, "maxModelCalls": 1})
        self.assertEqual(
            observed["options"], {"timeout_seconds": CONNECTION_CHECK_TIMEOUT_SECONDS}
        )
        self.assertNotIn("secret", result)

    def test_connection_check_reports_the_provider_authentication_message(self) -> None:
        class AuthenticationError(Exception):
            status_code = 401

        class FailingModel:
            def invoke(self, _messages: object) -> object:
                raise AuthenticationError("The API key is invalid")

        result = check_model_connection(
            _model("openai"), lambda *_args, **_kwargs: FailingModel()
        )

        self.assertEqual(
            result,
            {
                "state": "failed",
                "reason": "authentication",
                "detail": "HTTP 401: The API key is invalid",
                "modelCalls": 1,
                "maxOutputTokens": 1,
            },
        )

    def test_connection_check_reports_a_bounded_message_without_credentials(self) -> None:
        api_key = "sk-sensitive-provider-key-123456"

        class AuthenticationError(Exception):
            status_code = 401

        class FailingModel:
            def invoke(self, _messages: object) -> object:
                raise AuthenticationError(
                    f"Invalid API key: {api_key}\n"
                    f"Authorization: Bearer {api_key} " + "x" * 700
                )

        model = _model("openai")
        model["apiKey"] = api_key
        result = check_model_connection(model, lambda *_args, **_kwargs: FailingModel())

        detail = str(result["detail"])
        self.assertEqual(result["reason"], "authentication")
        self.assertNotIn(api_key, detail)
        self.assertIn("[redacted]", detail)
        self.assertNotIn("\n", detail)
        self.assertLessEqual(len(detail), MAX_CONNECTION_ERROR_DETAIL)

    def test_connection_check_rejects_configuration_without_a_model_call(self) -> None:
        def invalid_factory(*_args: object, **_kwargs: object) -> object:
            raise ModelConfigurationError("missing")

        self.assertEqual(
            check_model_connection(_model("openai"), invalid_factory),
            {
                "state": "failed",
                "reason": "configuration",
                "detail": "missing",
                "modelCalls": 0,
                "maxOutputTokens": 1,
            },
        )


class ModelListTests(unittest.TestCase):
    """Each provider's official SDK client, replaced by a stand-in that records how it was built."""

    def _client(self, listed: list[object], built: list[dict[str, object]]) -> type:
        class Client:
            def __init__(self, **options: object) -> None:
                built.append(options)
                self.models = SimpleNamespace(list=lambda **_: iter(listed))

        return Client

    def test_lists_a_compatible_service_with_the_openai_sdk_at_its_base_url_once_per_id(
        self,
    ) -> None:
        built: list[dict[str, object]] = []
        listed = [SimpleNamespace(id=name) for name in ("qwen3", "llama4", "qwen3", " ")]
        with mock.patch("openai.OpenAI", self._client(listed, built)):
            names = list_models(_model("openai-compatible", base_url="http://127.0.0.1:11434/v1/"))

        self.assertEqual(names, ["qwen3", "llama4"])
        self.assertEqual(
            built,
            [{
                "api_key": "provider-secret",
                "base_url": "http://127.0.0.1:11434/v1",
                "max_retries": 0,
                "timeout": 20.0,
            }],
        )

    def test_lists_anthropic_models_with_the_anthropic_sdk(self) -> None:
        built: list[dict[str, object]] = []
        listed = [SimpleNamespace(id="claude-opus-5-5"), SimpleNamespace(id="claude-sonnet-5-5")]
        with mock.patch("anthropic.Anthropic", self._client(listed, built)):
            names = list_models(
                _model("anthropic", base_url="https://api.anthropic.com", protocol="messages")
            )

        self.assertEqual(names, ["claude-opus-5-5", "claude-sonnet-5-5"])
        self.assertEqual(built[0]["max_retries"], 0)

    def test_lists_only_the_gemini_models_that_generate_content_by_their_ids(self) -> None:
        built: list[dict[str, object]] = []
        listed = [
            SimpleNamespace(
                name="models/gemini-3-pro", supported_actions=["generateContent", "countTokens"]
            ),
            SimpleNamespace(
                name="models/text-embedding-005", supported_actions=["embedContent"]
            ),
        ]
        with mock.patch("google.genai.Client", self._client(listed, built)):
            names = list_models(
                _model(
                    "google-gemini",
                    base_url="https://generativelanguage.googleapis.com/v1beta",
                    protocol="generate-content",
                )
            )

        self.assertEqual(names, ["gemini-3-pro"])
        self.assertEqual(built[0]["api_key"], "provider-secret")

    def test_classifies_a_provider_failure_without_its_own_text(self) -> None:
        class RefusedError(Exception):
            status_code = 401

        class Client:
            def __init__(self, **_: object) -> None:
                self.models = SimpleNamespace(list=self._refuse)

            def _refuse(self) -> list[object]:
                raise RefusedError("Incorrect API key provided: provider-secret")

        with mock.patch("openai.OpenAI", Client), self.assertRaises(ModelInvocationError) as raised:
            list_models(_model("openai"))

        self.assertEqual(raised.exception.detail, "authentication")
        self.assertNotIn("provider-secret", str(raised.exception))

    def test_rejects_a_model_that_is_not_set_up_before_building_a_client(self) -> None:
        unset = {**_model("openai"), "apiKey": None}
        with mock.patch("openai.OpenAI") as client, self.assertRaises(ModelConfigurationError):
            list_models(unset)
        client.assert_not_called()


def _model(
    provider: str,
    base_url: str = "https://api.openai.com/v1",
    protocol: str = "responses",
) -> dict[str, object]:
    return {
        "provider": provider,
        "protocol": protocol,
        "baseUrl": base_url,
        "model": "paper-model",
        "authentication": "api-key",
        "apiKey": "provider-secret",
    }


def _limits() -> dict[str, object]:
    return {"maxOutputTokens": 6000, "maxModelCalls": 1}


if __name__ == "__main__":
    unittest.main()
