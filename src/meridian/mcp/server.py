from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, BinaryIO, Callable

from meridian import __version__
from meridian.mcp import adapter
from meridian.wiki.workspace import resolve_workspace

SERVER_NAME = "meridian-paper-wiki"
SERVER_VERSION = __version__
DEFAULT_PROTOCOL_VERSION = "2024-11-05"


JsonDict = dict[str, Any]


class MeridianMCPServer:
    """Small MCP stdio server around the scenario-facing Meridian adapter.

    The server intentionally keeps the protocol layer thin: JSON-RPC request
    handling, tool schemas, and compact MCP responses live here; all wiki
    behavior remains in ``meridian.mcp.adapter`` and the existing Meridian core.
    """

    def __init__(self, *, default_wiki_root: Path | None = None) -> None:
        self.default_wiki_root = default_wiki_root

    def handle_message(self, message: JsonDict) -> JsonDict | None:
        method = str(message.get("method") or "")
        request_id = message.get("id")
        try:
            if method == "initialize":
                return self._response(request_id, self._initialize(message.get("params") or {}))
            if method == "tools/list":
                return self._response(request_id, {"tools": tool_definitions()})
            if method == "tools/call":
                return self._response(request_id, self._call_tool(message.get("params") or {}))
            if method == "ping":
                return self._response(request_id, {})
            if method in {"notifications/initialized", "notifications/cancelled"}:
                return None
            if method in {"resources/list", "prompts/list"}:
                return self._response(request_id, {method.split("/")[0]: []})
            return self._error(request_id, -32601, f"Method not found: {method}")
        except Exception as exc:  # pragma: no cover - exact exception paths are tested through tool calls.
            return self._error(request_id, -32000, str(exc))

    def serve_stdio(self, *, stdin: Any = None, stdout: Any = None) -> int:
        input_stream = getattr(stdin or sys.stdin, "buffer", stdin or sys.stdin)
        output_stream = getattr(stdout or sys.stdout, "buffer", stdout or sys.stdout)
        for line in input_stream:
            first_line = _bytes(line)
            if not first_line.strip():
                continue
            framed = first_line.lower().startswith(b"content-length:")
            try:
                if framed:
                    message = _read_framed_message(input_stream, first_line)
                else:
                    message = json.loads(first_line.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
                response = self._error(None, -32700, f"Parse error: {exc}")
            else:
                response = self.handle_message(message)
            if response is None:
                continue
            _write_message(output_stream, response, framed=framed)
            output_stream.flush()
        return 0

    def _initialize(self, params: JsonDict) -> JsonDict:
        requested_protocol = params.get("protocolVersion") or DEFAULT_PROTOCOL_VERSION
        return {
            "protocolVersion": requested_protocol,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            "instructions": (
                "Meridian Paper Wiki exposes two workflows: Use Wiki through "
                "context/read/trace and Update Wiki through update/propose/apply/audit."
            ),
        }

    def _call_tool(self, params: JsonDict) -> JsonDict:
        name = str(params.get("name") or "")
        arguments = dict(params.get("arguments") or {})
        if name not in TOOL_CALLS:
            return _tool_error(f"unknown Meridian MCP tool: {name}")
        try:
            payload = TOOL_CALLS[name](self, arguments)
        except Exception as exc:
            return _tool_error(adapter.call_chain_error_payload(exc))
        return _tool_result(payload)

    @staticmethod
    def _response(request_id: Any, result: JsonDict) -> JsonDict:
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    @staticmethod
    def _error(request_id: Any, code: int, message: str) -> JsonDict:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}

    def wiki_root(self, arguments: JsonDict) -> Path:
        explicit = arguments.get("wiki_root")
        if explicit:
            return Path(str(explicit))
        if self.default_wiki_root is not None:
            return self.default_wiki_root
        workspace = resolve_workspace()
        if workspace is not None:
            return workspace.wiki_root
        raise FileNotFoundError(adapter.NEEDS_INIT_MESSAGE)


def tool_definitions() -> list[JsonDict]:
    return [
        {
            "name": "meridian.capabilities",
            "description": "List Meridian Paper Wiki workflows and scenario-facing MCP tools.",
            "inputSchema": _schema({"detail": {"type": "string", "default": "summary"}}),
        },
        {
            "name": "meridian.context",
            "description": "Use Wiki: retrieve compact canonical wiki context for a research or coding intent.",
            "inputSchema": _schema(
                {
                    "query": {"type": "string"},
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "top_k": {"type": "integer", "default": 6},
                },
                required=["query"],
            ),
        },
        {
            "name": "meridian.read",
            "description": "Use Wiki: read selected sections from a canonical wiki page.",
            "inputSchema": _schema(
                {
                    "page": {"type": "string"},
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "sections": {"type": "array", "items": {"type": "string"}},
                    "max_chars": {"type": "integer", "default": 2400},
                },
                required=["page"],
            ),
        },
        {
            "name": "meridian.trace",
            "description": "Use Wiki: trace provenance, evidence, and trust state for a canonical wiki page.",
            "inputSchema": _schema(
                {
                    "page": {"type": "string"},
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "max_chars": {"type": "integer", "default": 1600},
                },
                required=["page"],
            ),
        },
        {
            "name": "meridian.update",
            "description": "Update Wiki: add a paper source or user insight through the durable wiki flow.",
            "inputSchema": _schema(
                {
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "source_path": {"type": "string"},
                    "paper": {"type": "string"},
                    "note": {"type": "string"},
                    "insight_type": {"type": "string", "default": "paper-note"},
                }
            ),
        },
        {
            "name": "meridian.propose",
            "description": "Update Wiki: create a lintable write-back proposal from retrieved context.",
            "inputSchema": _schema(
                {
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "query": {"type": "string"},
                    "title": {"type": "string"},
                    "proposal_type": {"type": "string", "default": "synthesis"},
                    "context_path": {"type": "string"},
                    "user_note": {"type": "string"},
                },
                required=["query", "title"],
            ),
        },
        {
            "name": "meridian.apply",
            "description": "Update Wiki: lint and publish a proposal when it is safe to canonicalize.",
            "inputSchema": _schema(
                {
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "proposal_manifest": {"type": "string"},
                    "overwrite": {"type": "boolean", "default": False},
                },
                required=["proposal_manifest"],
            ),
        },
        {
            "name": "meridian.audit",
            "description": "Update Wiki: return compact deterministic wiki health and repair pointers.",
            "inputSchema": _schema(
                {
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "scope": {"type": "string", "default": "summary"},
                }
            ),
        },
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Meridian Paper Wiki MCP stdio server")
    parser.add_argument("--wiki-root", default=os.environ.get("MERIDIAN_WIKI_ROOT"))
    args = parser.parse_args(argv)
    server = MeridianMCPServer(default_wiki_root=Path(args.wiki_root) if args.wiki_root else None)
    return server.serve_stdio()


def _schema(properties: JsonDict, *, required: list[str] | None = None) -> JsonDict:
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


def _bytes(line: bytes | str) -> bytes:
    if isinstance(line, bytes):
        return line
    return line.encode("utf-8")


def _read_framed_message(input_stream: BinaryIO, first_line: bytes) -> JsonDict:
    content_length: int | None = _parse_content_length(first_line)
    while True:
        header_line = _bytes(input_stream.readline())
        if header_line in {b"", b"\r\n", b"\n"}:
            break
        parsed = _parse_content_length(header_line)
        if parsed is not None:
            content_length = parsed
    if content_length is None:
        raise ValueError("missing Content-Length header")
    payload = input_stream.read(content_length)
    if len(payload) != content_length:
        raise ValueError("incomplete framed JSON-RPC payload")
    return json.loads(payload.decode("utf-8"))


def _parse_content_length(header_line: bytes) -> int | None:
    name, sep, value = header_line.partition(b":")
    if not sep or name.strip().lower() != b"content-length":
        return None
    try:
        length = int(value.strip())
    except ValueError as exc:
        raise ValueError("invalid Content-Length header") from exc
    if length < 0:
        raise ValueError("negative Content-Length header")
    return length


def _write_message(output_stream: BinaryIO, response: JsonDict, *, framed: bool) -> None:
    payload = json.dumps(response, ensure_ascii=False).encode("utf-8")
    if framed:
        output_stream.write(f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii"))
        output_stream.write(payload)
        return
    output_stream.write(payload + b"\n")


def _tool_result(payload: JsonDict) -> JsonDict:
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    return {"content": [{"type": "text", "text": text}]}


def _tool_error(error: str | JsonDict) -> JsonDict:
    if isinstance(error, dict):
        payload = error
    else:
        payload = {
            "status": "error",
            "error_code": "tool_error",
            "message": error,
            "next_action": "Inspect the tool arguments and retry.",
        }
    return {
        "content": [{"type": "text", "text": json.dumps(payload, indent=2, ensure_ascii=False)}],
        "isError": True,
    }


def _call_capabilities(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return adapter.capabilities(detail=str(arguments.get("detail") or "summary"))


def _call_context(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return adapter.context(
        query=_required(arguments, "query"),
        wiki_root=server.wiki_root(arguments),
        top_k=int(arguments.get("top_k") or 6),
    )


def _call_read(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    sections = arguments.get("sections")
    return adapter.read(
        page=_required(arguments, "page"),
        wiki_root=server.wiki_root(arguments),
        sections=list(sections) if isinstance(sections, list) else None,
        max_chars=int(arguments.get("max_chars") or 2400),
    )


def _call_trace(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return adapter.trace(
        page=_required(arguments, "page"),
        wiki_root=server.wiki_root(arguments),
        max_chars=int(arguments.get("max_chars") or 1600),
    )


def _call_update(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    source_path = arguments.get("source_path")
    return adapter.update(
        wiki_root=server.wiki_root(arguments),
        source_path=Path(str(source_path)) if source_path else None,
        paper=arguments.get("paper"),
        note=arguments.get("note"),
        insight_type=str(arguments.get("insight_type") or "paper-note"),
    )


def _call_propose(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    context_path = arguments.get("context_path")
    return adapter.propose(
        wiki_root=server.wiki_root(arguments),
        query=_required(arguments, "query"),
        title=_required(arguments, "title"),
        proposal_type=str(arguments.get("proposal_type") or "synthesis"),
        context_path=Path(str(context_path)) if context_path else None,
        user_note=str(arguments.get("user_note") or ""),
    )


def _call_apply(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return adapter.apply(
        proposal_manifest=Path(_required(arguments, "proposal_manifest")),
        wiki_root=server.wiki_root(arguments),
        overwrite=bool(arguments.get("overwrite") or False),
    )


def _call_audit(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return adapter.audit(
        wiki_root=server.wiki_root(arguments),
        scope=str(arguments.get("scope") or "summary"),
    )


def _required(arguments: JsonDict, key: str) -> str:
    value = arguments.get(key)
    if value in (None, ""):
        raise ValueError(f"{key} is required")
    return str(value)


TOOL_CALLS: dict[str, Callable[[MeridianMCPServer, JsonDict], JsonDict]] = {
    "meridian.capabilities": _call_capabilities,
    "meridian.context": _call_context,
    "meridian.read": _call_read,
    "meridian.trace": _call_trace,
    "meridian.update": _call_update,
    "meridian.propose": _call_propose,
    "meridian.apply": _call_apply,
    "meridian.audit": _call_audit,
}
