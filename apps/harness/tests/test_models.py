"""Tests for LangChain model construction without external requests."""

import unittest

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
