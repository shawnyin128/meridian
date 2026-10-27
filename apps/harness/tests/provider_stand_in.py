"""OpenAI- and Anthropic-protocol model services that answer without a provider, for tests."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import httpx
from langchain_openai import ChatOpenAI


class ProviderStandIn:
    """Answers every request with `reply` and keeps each request body in `requests`.

    `reply` is the structured answer the service returns: the arguments of the one tool call when
    the request offers tools, and otherwise the message text. A `text` reply is returned as plain
    message text even when the request offers tools.
    """

    def __init__(self, reply: dict[str, object] | None = None, *, text: str | None = None) -> None:
        self.reply = reply
        self.text = text
        self.requests: list[dict[str, object]] = []

    def model(self, *, responses: bool) -> ChatOpenAI:
        """A LangChain model on this service, speaking the Responses or the Chat Completions API."""

        return ChatOpenAI(
            model="stand-in-model",
            api_key="stand-in-key",
            base_url="https://stand-in.test/v1",
            max_retries=0,
            use_responses_api=responses,
            http_client=httpx.Client(transport=httpx.MockTransport(self._answer)),
        )

    def _answer(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.requests.append(body)
        arguments = json.dumps(self.reply, ensure_ascii=False)
        tool = "tools" in body and self.text is None
        text = self.text if self.text is not None else arguments
        if request.url.path.endswith("/responses"):
            name = body["tools"][0]["name"] if tool else ""
            item = (
                {
                    "type": "function_call", "id": "fc_1", "call_id": "call_1", "name": name,
                    "arguments": arguments, "status": "completed",
                }
                if tool
                else {
                    "type": "message", "id": "msg_1", "role": "assistant", "status": "completed",
                    "content": [{"type": "output_text", "text": text, "annotations": []}],
                }
            )
            return httpx.Response(200, json={
                "id": "resp_1", "object": "response", "created_at": 0, "status": "completed",
                "model": "stand-in-model", "output": [item], "parallel_tool_calls": False,
                "tool_choice": "auto", "tools": [],
                "usage": {
                    "input_tokens": 1, "output_tokens": 1, "total_tokens": 2,
                    "input_tokens_details": {"cached_tokens": 0},
                    "output_tokens_details": {"reasoning_tokens": 0},
                },
            })
        message: dict[str, object] = (
            {
                "role": "assistant", "content": None,
                "tool_calls": [{
                    "id": "call_1", "type": "function",
                    "function": {
                        "name": body["tools"][0]["function"]["name"], "arguments": arguments,
                    },
                }],
            }
            if tool
            else {"role": "assistant", "content": text}
        )
        return httpx.Response(200, json={
            "id": "chatcmpl-1", "object": "chat.completion", "created": 0,
            "model": "stand-in-model",
            "choices": [{"index": 0, "message": message, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        })


class AnthropicStandIn:
    """An Anthropic Messages service on a local HTTP server, answering every request with `reply`
    as the message text and `usage` as its token counts, and keeping each request body in
    `requests`. Use it as a context manager; `runtime` is the runtime model Core sends for it.
    """

    def __init__(self, reply: dict[str, object], usage: dict[str, int] | None = None) -> None:
        self.reply = reply
        self.usage = usage or {"input_tokens": 1, "output_tokens": 1}
        self.requests: list[dict[str, object]] = []
        stand_in = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802
                body = json.loads(self.rfile.read(int(self.headers["content-length"])))
                stand_in.requests.append(body)
                answer = json.dumps({
                    "id": "msg_1", "type": "message", "role": "assistant",
                    "model": "stand-in-model", "stop_reason": "end_turn", "stop_sequence": None,
                    "content": [{"type": "text", "text": json.dumps(stand_in.reply)}],
                    "usage": stand_in.usage,
                }).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(answer)))
                self.end_headers()
                self.wfile.write(answer)

            def log_message(self, format: str, *args: object) -> None:  # noqa: A002, ARG002
                return

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = Thread(target=self._server.serve_forever, daemon=True)

    @property
    def runtime(self) -> dict[str, object]:
        return {
            "provider": "anthropic", "protocol": "messages",
            "baseUrl": f"http://127.0.0.1:{self._server.server_address[1]}",
            "model": "stand-in-model", "authentication": "api-key", "apiKey": "stand-in-key",
        }

    def __enter__(self) -> AnthropicStandIn:
        self._thread.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self._server.shutdown()
        self._server.server_close()
