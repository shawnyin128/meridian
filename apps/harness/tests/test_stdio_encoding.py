import json
import os
import subprocess
import sys
from queue import Empty, Queue
from threading import Thread
from unittest import TestCase

CLI_MODEL = {"source": "cli", "cli": "codex"}
LIMITS = {"maxOutputTokens": 2000, "maxModelCalls": 1, "timeoutSeconds": 60}
ANSWER = "宽度 16 之后，接受长度的增长被验证开销抵消。"


def chat_turn(
    code_page: str, text: str, title: str, history: list[dict[str, str]]
) -> dict[str, object]:
    """Run the real Harness with its stdio defaulting to `code_page`, drive one subscription chat
    turn the way Core does, in UTF-8 bytes, and return what the model call was asked and how the
    turn ended."""
    child = subprocess.Popen(
        [sys.executable, "-m", "meridian_harness"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env={
            **os.environ, "PYTHONIOENCODING": code_page, "PYTHONPATH": os.pathsep.join(sys.path),
        },
    )
    assert child.stdin is not None and child.stdout is not None
    lines: Queue[bytes] = Queue()

    def read() -> None:
        assert child.stdout is not None
        for line in iter(child.stdout.readline, b""):
            lines.put(line)
        lines.put(b"")

    Thread(target=read, daemon=True).start()

    def send(message: dict[str, object]) -> None:
        assert child.stdin is not None
        child.stdin.write(json.dumps(message, ensure_ascii=False).encode("utf-8") + b"\n")
        child.stdin.flush()

    asked: object = None
    ended: object = None
    try:
        while ended is None:
            try:
                line = lines.get(timeout=30)
            except Empty:
                ended = {"harness": "gave no answer"}
                break
            if line == b"":
                assert child.stderr is not None
                stderr = child.stderr.read().decode("utf-8", "replace")
                ended = {"harness": "exited", "stderr": stderr[-300:]}
                break
            message = json.loads(line.decode("utf-8"))
            if message.get("event") == "ready":
                send({"type": "request", "id": 1, "method": "chat.answer", "params": {
                    "chatId": "chat-1", "text": text, "model": CLI_MODEL, "limits": LIMITS,
                }})
            elif message.get("method") == "chat.context":
                send({"type": "response", "id": 1, "callbackId": message["callbackId"], "ok": True,
                      "result": {"title": title, "history": history}})
            elif message.get("method") == "model.invoke":
                asked = message["params"]
                send({"type": "response", "id": 1, "callbackId": message["callbackId"], "ok": True,
                      "result": {"output": ANSWER}})
            else:
                ended = message
    finally:
        child.stdin.close()
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
        assert child.stderr is not None
        child.stderr.close()
        child.stdout.close()
    return {"asked": asked, "ended": ended}


class StdioEncodingTests(TestCase):
    """The Harness speaks UTF-8 on its stdio whatever code page Windows gives it."""

    def check(self, code_page: str, text: str, title: str, history: list[dict[str, str]]) -> None:
        turn = chat_turn(code_page, text, title, history)
        self.assertEqual(
            turn["ended"], {"type": "response", "id": 1, "ok": True, "result": {"answer": ANSWER}}
        )
        asked = turn["asked"]
        assert isinstance(asked, dict)
        self.assertEqual(asked["message"], text)
        self.assertIn(title, asked["system"])
        for turn_held in history:
            self.assertIn(turn_held["text"], asked["prompt"])

    def test_a_short_chinese_message(self) -> None:
        for code_page in ("cp936", "cp1252"):
            with self.subTest(code_page=code_page):
                self.check(code_page, "好", "新对话", [])

    def test_a_long_chinese_message(self) -> None:
        for code_page in ("cp936", "cp1252"):
            with self.subTest(code_page=code_page):
                long_text = "论文的方法为什么在宽度十六之后不再变好？" * 600
                self.check(code_page, long_text, "新对话", [])

    def test_a_chinese_context(self) -> None:
        history = [
            {"role": "user", "text": "树宽怎么定？"},
            {"role": "assistant", "text": "接受长度" * 1750},
        ]
        for code_page in ("cp936", "cp1252"):
            with self.subTest(code_page=code_page):
                self.check(code_page, "接着说", "推测解码的树宽怎么定", history)

    def test_a_chinese_context_that_decodes_under_cp1252(self) -> None:
        self.check("cp1252", "好", "chat", [{"role": "assistant", "text": "好" * 7000}])
