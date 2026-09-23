from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, BinaryIO, Callable

from meridian import __version__
from meridian.lab import apply_lab_update, materialize_lab_graph, record_lab_result
from meridian.mcp import adapter
from meridian.wiki.workspace import resolve_workspace
from meridian.workspace_protocol import (
    EVENT_KINDS,
    add_workspace_agent_idea,
    add_workspace_agent_task,
    add_workspace_event,
    inspect_project_workspace,
    read_project_plan,
    read_workspace_changes,
    read_workspace_idea,
    read_workspace_node_ideas,
)

SERVER_NAME = "meridian-paper-wiki"
SERVER_VERSION = __version__
DEFAULT_PROTOCOL_VERSION = "2024-11-05"
STALE_SERVER_WARNING = (
    "Warning: Meridian's code on disk changed after this MCP server started, so its tools may be "
    "missing or outdated. Tell the user to restart the agent session to load the current Meridian tools."
)
LAB_FOCUS_GUIDANCE = (
    "Lab Focus: when the user starts, resumes, restarts, or reopens work on a node (any wording), "
    "activate_node it (or reopen_node if it is supported/dead) before the first real step; no need to ask. "
    "Several nodes may be active at once; starting one does not deactivate the others unless the user says "
    "they are stopping or pausing it. Record a record_history checkpoint on each design decision or finished "
    "experiment run. When work on a node ends, record completion through lab_result or update_node."
)
PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def source_stamp() -> int:
    """Return the newest modification time, in nanoseconds, among the Meridian package's Python files."""

    return max(path.stat().st_mtime_ns for path in PACKAGE_ROOT.rglob("*.py"))


JsonDict = dict[str, Any]


class MeridianMCPServer:
    """Small MCP stdio server around Meridian's scenario-facing surfaces.

    The server intentionally keeps the protocol layer thin: JSON-RPC request
    handling, tool schemas, and compact MCP responses live here; all wiki
    behavior remains in ``meridian.mcp.adapter`` and the existing Meridian core.
    """

    def __init__(
        self,
        *,
        default_wiki_root: Path | None = None,
        default_workspace_root: Path | None = None,
    ) -> None:
        self.default_wiki_root = default_wiki_root
        self.default_workspace_root = default_workspace_root
        self.loaded_source_stamp = source_stamp()

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
                "context/read/trace, and Update Wiki through wiki_propose/wiki_proposal_status/audit. "
                "The App owns paper ingest, aggregation structure, and body edits; an agent may only "
                "propose a conclusion a project found and summarised, as claim ops with experiment "
                "evidence, and the user reviews it in the App. "
                "Project Workspace exposes status/plan/event_add for App-agent coordination. "
                "Coding context starts with read-only changes, then expands only referenced ideas or nodes. "
                "Lab exposes graph/update/result for agent-owned research state; App-owned plans remain read-only. "
                f"{LAB_FOCUS_GUIDANCE}"
            ),
        }

    def _call_tool(self, params: JsonDict) -> JsonDict:
        name = str(params.get("name") or "")
        arguments = dict(params.get("arguments") or {})
        if name not in TOOL_CALLS:
            result = _tool_error(f"unknown Meridian MCP tool: {name}")
        else:
            try:
                result = _tool_result(TOOL_CALLS[name](self, arguments))
            except Exception as exc:
                result = _tool_error(adapter.call_chain_error_payload(exc))
        if source_stamp() != self.loaded_source_stamp:
            result = {**result, "content": [*result["content"], {"type": "text", "text": STALE_SERVER_WARNING}]}
        return result

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

    def workspace_root(self, arguments: JsonDict) -> Path:
        explicit = arguments.get("workspace_root")
        if explicit:
            return Path(str(explicit))
        if self.default_workspace_root is not None:
            return self.default_workspace_root
        return Path.cwd()


def tool_definitions() -> list[JsonDict]:
    return [
        {
            "name": "meridian.capabilities",
            "description": "List Meridian workflows and scenario-facing MCP tools.",
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
                    "max_chars_per_result": {"type": "integer", "default": 1200, "minimum": 200},
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
            "name": "meridian.wiki_propose",
            "description": (
                "Update Wiki: propose a conclusion a project found and summarised, as claim ops "
                "(addClaim, reviseClaim, addEvidence, markConflict, resolveConflict, retractClaim). "
                "Never import papers, restructure aggregations, or edit bodies; addClaim/reviseClaim "
                "need at least one experiment evidence item, and a node named as evidence must have a "
                "recorded conclusion (record_conclusion). The user reviews the proposal in the App; "
                "this tool only writes to the review inbox."
            ),
            "inputSchema": _schema(
                {
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "ops": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "Claim ops only: addClaim, reviseClaim, addEvidence, markConflict, resolveConflict, retractClaim.",
                    },
                    "title": {"type": "string", "description": "One sentence for the review list."},
                    "trigger": {
                        "type": "object",
                        "description": "Where the conclusion came from.",
                        "properties": {
                            "project": {"type": "string"},
                            "node": {"type": "string"},
                        },
                        "required": ["project"],
                        "additionalProperties": False,
                    },
                    "rationale": {"type": "string"},
                },
                required=["ops", "title", "trigger"],
            ),
        },
        {
            "name": "meridian.wiki_proposal_status",
            "description": "Update Wiki: check a submitted proposal's review status, or list recent proposals.",
            "inputSchema": _schema(
                {
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "key": {"type": "string", "description": "The key returned by wiki_propose. Omit to list recent proposals."},
                    "limit": {"type": "integer", "default": 10, "minimum": 1, "maximum": 100},
                }
            ),
        },
        {
            "name": "meridian.audit",
            "description": "Update Wiki: read the App's deterministic wiki signals (lint findings); report if it has not run yet.",
            "inputSchema": _schema(
                {
                    "wiki_root": {"type": "string", "description": "Canonical wiki root. Defaults to the active user Paper Wiki workspace."},
                    "scope": {"type": "string", "default": "summary"},
                }
            ),
        },
        {
            "name": "meridian.workspace_status",
            "description": "Project Workspace: validate the App plan and repository-owned graph/event views.",
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                }
            ),
        },
        {
            "name": "meridian.workspace_plan",
            "description": "Project Workspace: read the App-owned project plan without changing it.",
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                }
            ),
        },
        {
            "name": "meridian.workspace_changes",
            "description": "Coding context: read App-owned project and idea changes after an opaque cursor without scanning the whole workspace.",
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                    "cursor": {
                        "type": "string",
                        "description": "Opaque next_cursor returned by the previous call. Omit for a bounded recent baseline.",
                    },
                    "limit": {"type": "integer", "default": 20, "minimum": 1, "maximum": 100},
                    "kinds": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional exact change kinds to return.",
                    },
                }
            ),
        },
        {
            "name": "meridian.workspace_idea",
            "description": "Coding context: expand one current App-owned idea referenced by the change list.",
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                    "idea_id": {"type": "string"},
                },
                required=["idea_id"],
            ),
        },
        {
            "name": "meridian.workspace_event_add",
            "description": (
                "Project Workspace: append one compact, structured event backed by an existing repository "
                "evidence file. title = the conclusion in one line; detail = key numbers or parameters; "
                "kind = start (began a node), reopen, result, decision, complete, or note."
            ),
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                    "event_id": {"type": "string", "description": "Stable idempotency key for the event."},
                    "title": {"type": "string", "description": "The conclusion in one line, shown as the record title."},
                    "kind": {
                        "type": "string",
                        "enum": sorted(EVENT_KINDS),
                        "description": "start, reopen, result, decision, complete, or note.",
                    },
                    "detail": {
                        "type": "string",
                        "description": "Optional key numbers or parameters, shown under the title.",
                    },
                    "source": {
                        "type": "string",
                        "description": "Existing evidence file relative to the repository root.",
                    },
                    "date": {"type": "string", "description": "YYYY-MM-DD; defaults to the local current date."},
                    "node": {"type": "string", "description": "Optional Meridian Lab graph node id."},
                },
                required=["event_id", "title", "kind", "source"],
            ),
        },
        {
            "name": "meridian.workspace_idea_add",
            "description": (
                "Project Workspace: record one new research idea found while working, so the Meridian App "
                "adds it to the project's idea list."
            ),
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                    "idea_id": {"type": "string", "description": "Stable idempotency key for the idea."},
                    "title": {"type": "string", "description": "The idea in one line, at most 160 characters."},
                    "body": {"type": "string", "description": "The mechanism, hypothesis or direction worth revisiting."},
                    "context": {
                        "type": "string",
                        "description": "What the work was about when the idea came up, shown as its source.",
                    },
                    "date": {"type": "string", "description": "YYYY-MM-DD; defaults to the local current date."},
                    "node": {"type": "string", "description": "Optional Meridian Lab graph node id it relates to."},
                },
                required=["idea_id", "title", "body"],
            ),
        },
        {
            "name": "meridian.workspace_task_add",
            "description": (
                "Project Workspace: add one clear, concrete next step the user and you agreed on to the "
                "project plan as a task; the App marks it as added by an agent and the user deletes what "
                "they do not want. A general direction or hypothesis is a Lab node or an idea, not a task."
            ),
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                    "task_id": {"type": "string", "description": "Stable idempotency key for the task."},
                    "title": {"type": "string", "description": "The step in one line, at most 160 characters."},
                    "note": {"type": "string", "description": "Optional Markdown note: what done means, inputs, commands."},
                    "date": {"type": "string", "description": "YYYY-MM-DD the task is planned for; defaults to today."},
                },
                required=["task_id", "title"],
            ),
        },
        {
            "name": "meridian.lab_graph",
            "description": "Lab: read the current Markdown-backed research graph and detailed health without changing it.",
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                }
            ),
        },
        {
            "name": "meridian.lab_node",
            "description": "Coding context: expand one Lab node, its local relationships, detailed research state, and linked App ideas.",
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                    "node_id": {"type": "string"},
                },
                required=["node_id"],
            ),
        },
        {
            "name": "meridian.lab_update",
            "description": (
                "Lab: apply a strict meridian.lab.update.v1 packet through the Markdown control plane and "
                "refresh the generated graph. link_task/unlink_task {node_id, task_id} tie a plan task to the "
                "one node it belongs to; record_conclusion {node_id, text, evidence: [experiment ids]} writes "
                "a supported or dead node's conclusion for the owner to verify. " + LAB_FOCUS_GUIDANCE
            ),
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                    "packet": {
                        "type": "object",
                        "description": "Strict meridian.lab.update.v1 packet. Boundary-changing operations require accepted user confirmation in the packet.",
                    },
                },
                required=["packet"],
            ),
        },
        {
            "name": "meridian.lab_result",
            "description": "Lab: atomically attach experiment evidence to one node and publish its compact App-visible event. Pass experiment to write a new record at source in the same call.",
            "inputSchema": _schema(
                {
                    "workspace_root": {
                        "type": "string",
                        "description": "Repository or .meridian root. Defaults to the configured root or server cwd.",
                    },
                    "node_id": {"type": "string", "description": "Existing Lab graph node id."},
                    "event_id": {"type": "string", "description": "Stable idempotency key for the App-visible event."},
                    "summary": {"type": "string", "description": "Compact agent progress summary shown in the App."},
                    "source": {
                        "type": "string",
                        "description": ".meridian/experiments/<id>.md relative to the repository root: an existing record, or where a new one is written when experiment is given.",
                    },
                    "impact": {
                        "type": "string",
                        "enum": ["supports", "refutes", "updates", "unclear"],
                    },
                    "date": {"type": "string", "description": "YYYY-MM-DD; defaults to the local current date."},
                    "state": {
                        "type": "string",
                        "enum": ["unresolved", "repairable", "supported", "dead"],
                        "description": "Optional resulting node state. repairable/dead still require accepted confirmation.",
                    },
                    "next_action": {"type": "string", "description": "Optional replacement for the node's next action."},
                    "user_confirmation": {
                        "type": "object",
                        "description": "Confirmation packet for boundary-changing state transitions.",
                    },
                    "experiment": {
                        "type": "object",
                        "description": "New experiment record to write at source; rejected when source already exists.",
                        "properties": {
                            "title": {"type": "string"},
                            "validity": {"type": "string", "enum": ["valid", "invalid", "uncertain"]},
                            "question": {"type": "string", "description": "What the experiment tests."},
                            "command": {"type": "string", "description": "Command, config, and output location."},
                            "result": {"type": "string", "description": "The observation."},
                            "interpretation": {"type": "string", "description": "What the result changes and what it does not prove."},
                        },
                        "required": ["title", "validity", "question", "command", "result", "interpretation"],
                        "additionalProperties": False,
                    },
                },
                required=["node_id", "event_id", "summary", "source", "impact"],
            ),
        },
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Meridian MCP stdio server")
    parser.add_argument("--wiki-root", default=os.environ.get("MERIDIAN_WIKI_ROOT"))
    parser.add_argument("--workspace-root", default=os.environ.get("MERIDIAN_WORKSPACE_ROOT"))
    args = parser.parse_args(argv)
    server = MeridianMCPServer(
        default_wiki_root=Path(args.wiki_root) if args.wiki_root else None,
        default_workspace_root=Path(args.workspace_root) if args.workspace_root else None,
    )
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
        max_chars_per_result=int(arguments.get("max_chars_per_result") or 1200),
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


def _call_wiki_propose(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    ops = arguments.get("ops")
    if not isinstance(ops, list):
        raise TypeError("ops must be an array of claim operations")
    trigger = arguments.get("trigger")
    if not isinstance(trigger, dict):
        raise TypeError("trigger must be an object with a project")
    return adapter.wiki_propose(
        wiki_root=server.wiki_root(arguments),
        ops=ops,
        title=_required(arguments, "title"),
        trigger=trigger,
        rationale=str(arguments["rationale"]) if arguments.get("rationale") not in (None, "") else None,
    )


def _call_wiki_proposal_status(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return adapter.wiki_proposal_status(
        wiki_root=server.wiki_root(arguments),
        key=str(arguments["key"]) if arguments.get("key") not in (None, "") else None,
        limit=int(arguments.get("limit") or 10),
    )


def _call_audit(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return adapter.audit(
        wiki_root=server.wiki_root(arguments),
        scope=str(arguments.get("scope") or "summary"),
    )


def _call_workspace_status(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return inspect_project_workspace(server.workspace_root(arguments))


def _call_workspace_plan(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return read_project_plan(server.workspace_root(arguments))


def _call_workspace_changes(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    kinds = arguments.get("kinds")
    if kinds is not None and not isinstance(kinds, list):
        raise TypeError("kinds must be an array")
    payload = read_workspace_changes(
        server.workspace_root(arguments),
        cursor=str(arguments["cursor"]) if arguments.get("cursor") not in (None, "") else None,
        limit=int(arguments.get("limit") or 20),
        kinds=[str(kind) for kind in kinds] if kinds is not None else None,
    )
    workspace_arguments = (
        {"workspace_root": str(arguments["workspace_root"])}
        if arguments.get("workspace_root") not in (None, "")
        else {}
    )
    for change in payload.get("changes", []):
        expansions: list[JsonDict] = []
        for ref in change.get("refs", []):
            if ref.get("kind") == "project":
                candidate = {
                    "tool": "meridian.workspace_plan",
                    "arguments": dict(workspace_arguments),
                }
            elif ref.get("kind") == "idea":
                candidate = {
                    "tool": "meridian.workspace_idea",
                    "arguments": {**workspace_arguments, "idea_id": ref.get("id")},
                }
            elif ref.get("kind") == "node":
                candidate = {
                    "tool": "meridian.lab_node",
                    "arguments": {**workspace_arguments, "node_id": ref.get("id")},
                }
            else:
                continue
            if candidate not in expansions:
                expansions.append(candidate)
        change["expand"] = expansions
    return payload


def _call_workspace_idea(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return read_workspace_idea(
        server.workspace_root(arguments),
        _required(arguments, "idea_id"),
    )


def _call_workspace_event_add(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return add_workspace_event(
        server.workspace_root(arguments),
        event_id=_required(arguments, "event_id"),
        text=_required(arguments, "title"),
        source=_required(arguments, "source"),
        event_date=str(arguments["date"]) if arguments.get("date") not in (None, "") else None,
        node=str(arguments["node"]) if arguments.get("node") not in (None, "") else None,
        kind=_required(arguments, "kind"),
        detail=str(arguments["detail"]) if arguments.get("detail") not in (None, "") else None,
    )


def _call_workspace_idea_add(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return add_workspace_agent_idea(
        server.workspace_root(arguments),
        idea_id=_required(arguments, "idea_id"),
        title=_required(arguments, "title"),
        body=_required(arguments, "body"),
        context=str(arguments["context"]) if arguments.get("context") not in (None, "") else None,
        idea_date=str(arguments["date"]) if arguments.get("date") not in (None, "") else None,
        node=str(arguments["node"]) if arguments.get("node") not in (None, "") else None,
    )


def _call_workspace_task_add(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    return add_workspace_agent_task(
        server.workspace_root(arguments),
        task_id=_required(arguments, "task_id"),
        title=_required(arguments, "title"),
        note=str(arguments["note"]) if arguments.get("note") not in (None, "") else None,
        task_date=str(arguments["date"]) if arguments.get("date") not in (None, "") else None,
    )


def _call_lab_graph(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    result = materialize_lab_graph(server.workspace_root(arguments))
    return {
        "schema_version": "meridian.mcp_lab_graph.v1",
        "graph": result.graph,
        "health": result.health,
    }


def _call_lab_node(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    root = server.workspace_root(arguments)
    node_id = _required(arguments, "node_id")
    result = materialize_lab_graph(root)
    graph = result.graph
    node = next((item for item in graph.get("nodes", []) if item.get("id") == node_id), None)
    if node is None:
        raise ValueError(f"Lab node does not exist: {node_id}")
    edges = graph.get("edges", [])
    return {
        "schema_version": "meridian.mcp_lab_node.v1",
        "node": node,
        "detail": (graph.get("node_details") or {}).get(node_id),
        "incoming": [edge for edge in edges if edge.get("target") == node_id],
        "outgoing": [edge for edge in edges if edge.get("source") == node_id],
        "active": node_id in graph.get("active_nodes", []),
        "linked_ideas": read_workspace_node_ideas(root, node_id),
        "health": result.health,
    }


def _call_lab_update(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    packet = arguments.get("packet")
    if not isinstance(packet, dict):
        raise TypeError("packet is required and must be an object")
    return apply_lab_update(server.workspace_root(arguments), packet)


def _call_lab_result(server: MeridianMCPServer, arguments: JsonDict) -> JsonDict:
    confirmation = arguments.get("user_confirmation")
    if confirmation is not None and not isinstance(confirmation, dict):
        raise TypeError("user_confirmation must be an object")
    experiment = arguments.get("experiment")
    if experiment is not None and not isinstance(experiment, dict):
        raise TypeError("experiment must be an object")
    return record_lab_result(
        server.workspace_root(arguments),
        node_id=_required(arguments, "node_id"),
        event_id=_required(arguments, "event_id"),
        summary=_required(arguments, "summary"),
        source=_required(arguments, "source"),
        impact=_required(arguments, "impact"),
        event_date=str(arguments["date"]) if arguments.get("date") not in (None, "") else None,
        state=str(arguments["state"]) if arguments.get("state") not in (None, "") else None,
        next_action=str(arguments["next_action"]) if arguments.get("next_action") not in (None, "") else None,
        user_confirmation=confirmation,
        experiment=experiment,
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
    "meridian.wiki_propose": _call_wiki_propose,
    "meridian.wiki_proposal_status": _call_wiki_proposal_status,
    "meridian.audit": _call_audit,
    "meridian.workspace_status": _call_workspace_status,
    "meridian.workspace_plan": _call_workspace_plan,
    "meridian.workspace_changes": _call_workspace_changes,
    "meridian.workspace_idea": _call_workspace_idea,
    "meridian.workspace_event_add": _call_workspace_event_add,
    "meridian.workspace_idea_add": _call_workspace_idea_add,
    "meridian.workspace_task_add": _call_workspace_task_add,
    "meridian.lab_graph": _call_lab_graph,
    "meridian.lab_node": _call_lab_node,
    "meridian.lab_update": _call_lab_update,
    "meridian.lab_result": _call_lab_result,
}
