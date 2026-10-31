from __future__ import annotations

import argparse
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.mcp.server import MeridianMCPServer

JsonDict = dict[str, Any]


def run_stdio_harness(
    *,
    wiki_root: Path,
    out_path: Path | None = None,
    fixture_root: Path | None = None,
) -> dict[str, Any]:
    """Run a deterministic MCP-client-style JSON-RPC smoke sequence.

    The main wiki is used for read-only Use Wiki calls. Disposable wiki and
    project-workspace fixtures validate the write paths without mutating the
    user's canonical vault or research repository.
    """
    created_at = datetime.now(timezone.utc).isoformat()
    main_server = MeridianMCPServer(default_wiki_root=wiki_root)
    transcript: list[JsonDict] = []

    def call(server: MeridianMCPServer, message: JsonDict) -> JsonDict:
        response = server.handle_message(message)
        if response is None:
            response = {"jsonrpc": "2.0", "id": message.get("id"), "result": None}
        transcript.append({"request": message, "response": response})
        return response

    initialize = call(
        main_server,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "clientInfo": {"name": "meridian-harness", "version": "0.1"}},
        },
    )
    tools = call(main_server, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})

    context = call(
        main_server,
        _tool_call(
            3,
            "meridian.context",
            {
                "query": "I need prerequisite concepts and implementation checks for KV-cache compression debugging.",
                "wiki_root": str(wiki_root),
                "top_k": 6,
            },
        ),
    )
    context_payload = _tool_payload(context)
    first_page = _first_canonical_path(context_payload)

    read = call(
        main_server,
        _tool_call(4, "meridian.read", {"page": first_page, "wiki_root": str(wiki_root), "max_chars": 1800}),
    )
    trace = call(
        main_server,
        _tool_call(5, "meridian.trace", {"page": first_page, "wiki_root": str(wiki_root), "max_chars": 1200}),
    )
    blocked_read = call(
        main_server,
        _tool_call(6, "meridian.read", {"page": ".drafts/ingests/internal/paper.md", "wiki_root": str(wiki_root)}),
    )
    audit = call(main_server, _tool_call(7, "meridian.audit", {"wiki_root": str(wiki_root), "scope": "all"}))

    fixture_result = _run_fixture_propose_sequence(fixture_root=fixture_root)
    transcript.extend(fixture_result["transcript"])
    workspace_result = _run_workspace_sequence()
    transcript.extend(workspace_result["transcript"])

    payload = {
        "schema_version": "meridian.mcp_stdio_harness.v1",
        "created_at": created_at,
        "wiki_root": str(wiki_root),
        "status": _status(
            initialize=initialize,
            tools=tools,
            context=context,
            read=read,
            trace=trace,
            blocked_read=blocked_read,
            audit=audit,
            fixture_result=fixture_result,
            workspace_result=workspace_result,
        ),
        "summary": {
            "server_name": (initialize.get("result") or {}).get("serverInfo", {}).get("name"),
            "tool_count": len((tools.get("result") or {}).get("tools") or []),
            "context_result_count": context_payload.get("result_count"),
            "read_page": _tool_payload(read).get("page"),
            "trace_page": _tool_payload(trace).get("page"),
            "blocked_internal_read": bool((blocked_read.get("result") or {}).get("isError")),
            "fixture_propose_status": fixture_result["propose_payload"].get("status"),
            "fixture_proposal_status": fixture_result["proposal_status_payload"].get("status"),
            "workspace_status": workspace_result["status_payload"].get("status"),
            "workspace_plan_revision": workspace_result["plan_payload"].get("revision"),
            "workspace_change_cursor_status": workspace_result["changes_payload"].get("cursor_status"),
            "workspace_idea_id": (workspace_result["idea_payload"].get("idea") or {}).get("id"),
            "workspace_node_id": (workspace_result["node_payload"].get("node") or {}).get("id"),
            "workspace_event_status": workspace_result["event_payload"].get("status"),
            "lab_graph_health": workspace_result["graph_payload"].get("health", {}).get("status"),
            "lab_update_status": workspace_result["update_payload"].get("status"),
            "lab_result_status": workspace_result["result_payload"].get("status"),
        },
        "expected_tools": [
            "meridian.capabilities",
            "meridian.context",
            "meridian.read",
            "meridian.trace",
            "meridian.wiki_propose",
            "meridian.wiki_proposal_status",
            "meridian.audit",
            "meridian.workspace_status",
            "meridian.workspace_plan",
            "meridian.workspace_changes",
            "meridian.workspace_idea",
            "meridian.workspace_event_add",
            "meridian.workspace_idea_add",
            "meridian.lab_graph",
            "meridian.lab_node",
            "meridian.lab_update",
            "meridian.lab_result",
        ],
        "transcript": transcript,
    }
    target = out_path or wiki_root / ".index/mcp-stdio-harness.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    payload["report_path"] = str(target)
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a deterministic Meridian MCP client-style harness")
    parser.add_argument("--wiki-root", type=Path, default=Path("wiki"), help="Main canonical wiki root for read-only MCP calls.")
    parser.add_argument("--out", type=Path, default=None, help="Optional JSON report path.")
    parser.add_argument("--fixture-root", type=Path, default=None, help="Optional disposable fixture wiki root for apply smoke.")
    args = parser.parse_args(argv)
    result = run_stdio_harness(wiki_root=args.wiki_root, out_path=args.out, fixture_root=args.fixture_root)
    print(json.dumps({"status": result["status"], "report_path": result["report_path"], "summary": result["summary"]}, indent=2, ensure_ascii=False))
    return 0 if result["status"] == "pass" else 1


def _run_fixture_propose_sequence(*, fixture_root: Path | None) -> JsonDict:
    temp_dir: tempfile.TemporaryDirectory[str] | None = None
    if fixture_root is None:
        temp_dir = tempfile.TemporaryDirectory(prefix="meridian-mcp-fixture-")
        wiki_root = Path(temp_dir.name) / "wiki"
    else:
        wiki_root = fixture_root
    _write_fixture_wiki(wiki_root)
    server = MeridianMCPServer(default_wiki_root=wiki_root)
    transcript: list[JsonDict] = []

    def call(message: JsonDict) -> JsonDict:
        response = server.handle_message(message)
        if response is None:
            response = {"jsonrpc": "2.0", "id": message.get("id"), "result": None}
        transcript.append({"request": message, "response": response})
        return response

    context = call(
        _tool_call(
            101,
            "meridian.context",
            {
                "wiki_root": str(wiki_root),
                "query": "activation outlier implementation probe planning",
                "top_k": 4,
            },
        )
    )
    propose = call(
        _tool_call(
            102,
            "meridian.wiki_propose",
            {
                "wiki_root": str(wiki_root),
                "title": "Fixture activation outlier probe supports smoothing",
                "trigger": {"project": "fixture-project", "node": "fixture.A"},
                "ops": [
                    {
                        "op": "addClaim",
                        "page": "topics/quantization-error",
                        "claim": {
                            "id": "fixture-outlier-probe",
                            "text": "Fixture: the no-smoothing ablation confirms activation outliers dominate error.",
                            "evidence": [{"kind": "experiment", "project": "fixture-project", "node": "fixture.A"}],
                        },
                    }
                ],
            },
        )
    )
    propose_payload = _tool_payload(propose)
    status = call(
        _tool_call(
            103,
            "meridian.wiki_proposal_status",
            {"wiki_root": str(wiki_root), "key": propose_payload.get("key")},
        )
    )
    status_payload = _tool_payload(status)
    audit = call(_tool_call(104, "meridian.audit", {"wiki_root": str(wiki_root)}))
    result = {
        "fixture_root": str(wiki_root),
        "context_payload": _tool_payload(context),
        "propose_payload": propose_payload,
        "proposal_status_payload": status_payload,
        "audit_payload": _tool_payload(audit),
        "transcript": transcript,
    }
    if temp_dir is not None:
        temp_dir.cleanup()
    return result


def _write_fixture_wiki(wiki_root: Path) -> None:
    """Write a minimal new-format (aggregation) vault: one topic with a paper member."""
    topics = wiki_root / "topics"
    papers = wiki_root / "papers"
    topics.mkdir(parents=True, exist_ok=True)
    papers.mkdir(parents=True, exist_ok=True)
    (wiki_root / "schema.yaml").write_text(
        "\n".join(
            [
                "version: 1",
                "kinds:",
                "  topic:",
                "    dir: topics",
                "    label: Topic",
                "    describe: {section: Problem, hint: what is hard here}",
                "sections:",
                "  - {key: experiments, label: Experiments}",
                "  - {key: open, label: Open questions}",
                "anchor:",
                "  require_quote: true",
                "",
            ]
        ),
        encoding="utf-8",
    )
    (topics / "quantization-error.md").write_text(
        "\n".join(
            [
                "---",
                'kind: "topic"',
                'title: "Quantization error"',
                "aliases: []",
                "parents: []",
                "columns: []",
                'updated: "2026-09-16"',
                "---",
                "<!-- generated:children -->",
                "## Sub-aggregations",
                "(none)",
                "<!-- /generated -->",
                "<!-- generated:table -->",
                "## Table",
                "| Paper |",
                "|---|",
                "| [[papers/fixture-activation-outliers|Fixture Activation Outliers]] |",
                "<!-- /generated -->",
                "<!-- generated:claims -->",
                "## Conclusions",
                "(none yet)",
                "<!-- /generated -->",
                "",
                "## Problem",
                "Activation outlier probes are useful before changing a quantization kernel.",
                "",
                "## Experiments",
                "",
                "## Open questions",
                "",
            ]
        ),
        encoding="utf-8",
    )
    (papers / "fixture-activation-outliers.md").write_text(
        "\n".join(
            [
                "---",
                'type: "paper"',
                'title: "Fixture Activation Outliers"',
                'status: "active"',
                'created: "2026-09-16"',
                'updated: "2026-09-16"',
                'source_id: "fixture-source"',
                "memberships:",
                '  - in: "topics/quantization-error"',
                "    cells: []",
                "---",
                "## What this covers",
                "Outlier-aware quantization checks whether rare high-magnitude activations dominate scaling and downstream error.",
                "",
            ]
        ),
        encoding="utf-8",
    )


def _run_workspace_sequence(*, fixture_root: Path | None = None) -> JsonDict:
    temp_dir: tempfile.TemporaryDirectory[str] | None = None
    if fixture_root is None:
        temp_dir = tempfile.TemporaryDirectory(prefix="meridian-workspace-mcp-fixture-")
        workspace_root = Path(temp_dir.name) / "repo"
    else:
        workspace_root = fixture_root
    _write_workspace_fixture(workspace_root)
    server = MeridianMCPServer(default_workspace_root=workspace_root)
    transcript: list[JsonDict] = []

    def call(message: JsonDict) -> JsonDict:
        response = server.handle_message(message)
        if response is None:
            response = {"jsonrpc": "2.0", "id": message.get("id"), "result": None}
        transcript.append({"request": message, "response": response})
        return response

    status = call(_tool_call(201, "meridian.workspace_status", {}))
    plan = call(_tool_call(202, "meridian.workspace_plan", {}))
    changes = call(
        _tool_call(
            208,
            "meridian.workspace_changes",
            {"cursor": "fixture-feed:0"},
        )
    )
    idea = call(
        _tool_call(
            209,
            "meridian.workspace_idea",
            {"idea_id": "fixture-idea"},
        )
    )
    node = call(
        _tool_call(
            210,
            "meridian.lab_node",
            {"node_id": "fixture.A"},
        )
    )
    event = call(
        _tool_call(
            203,
            "meridian.workspace_event_add",
            {
                "event_id": "fixture-probe-complete",
                "date": "2026-09-16",
                "title": "Fixture probe completed",
                "kind": "result",
                "source": ".meridian/experiments/fixture-probe.md",
                "node": "fixture.A",
            },
        )
    )
    graph = call(_tool_call(204, "meridian.lab_graph", {}))
    update = call(
        _tool_call(
            205,
            "meridian.lab_update",
            {
                "packet": {
                    "schema": "meridian.lab.update.v1",
                    "intent": "create_fixture_branch",
                    "target_thread": "fixture",
                    "changes": [
                        {
                            "op": "create_node",
                            "node_id": "fixture.B",
                            "title": "Fixture repair branch",
                            "parent": "fixture.A",
                            "next_action": "Run the fixture repair probe.",
                        },
                        {"op": "activate_node", "node_id": "fixture.B"},
                    ],
                    "user_confirmation": {
                        "required_for": ["create_node"],
                        "status": "accepted",
                    },
                }
            },
        )
    )
    lab_result = call(
        _tool_call(
            206,
            "meridian.lab_result",
            {
                "node_id": "fixture.B",
                "event_id": "fixture-result-complete",
                "date": "2026-09-16",
                "summary": "Fixture experiment supports the repair branch",
                "source": ".meridian/experiments/fixture-probe.md",
                "impact": "supports",
                "state": "supported",
                "next_action": "Run the next fixture probe.",
            },
        )
    )
    graph_after = call(_tool_call(207, "meridian.lab_graph", {}))
    result = {
        "workspace_root": str(workspace_root),
        "status_payload": _tool_payload(status),
        "plan_payload": _tool_payload(plan),
        "changes_payload": _tool_payload(changes),
        "idea_payload": _tool_payload(idea),
        "node_payload": _tool_payload(node),
        "event_payload": _tool_payload(event),
        "graph_payload": _tool_payload(graph),
        "update_payload": _tool_payload(update),
        "result_payload": _tool_payload(lab_result),
        "graph_after_payload": _tool_payload(graph_after),
        "transcript": transcript,
    }
    if temp_dir is not None:
        temp_dir.cleanup()
    return result


def _write_workspace_fixture(workspace_root: Path) -> None:
    meridian_root = workspace_root / ".meridian"
    (meridian_root / "control").mkdir(parents=True, exist_ok=True)
    (meridian_root / "experiments").mkdir(parents=True, exist_ok=True)
    (meridian_root / "threads").mkdir(parents=True, exist_ok=True)
    (meridian_root / "proposals").mkdir(parents=True, exist_ok=True)
    (meridian_root / "workspace.json").write_text(
        json.dumps(
            {
                "schema_version": "meridian.workspace.v1",
                "project": {"id": "fixture-project", "name": "Fixture Project"},
                "surfaces": {
                    "plan": {"path": ".meridian/control/plan.json", "writer": "meridian-app"},
                    "changes": {
                        "path": ".meridian/control/changes.json",
                        "writer": "meridian-app",
                    },
                    "graph": {"path": ".meridian/graph/graph.json", "writer": "workspace"},
                    "events": {"path": ".meridian/events/events.json", "writer": "workspace"},
                },
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (meridian_root / "control/changes.json").write_text(
        json.dumps(
            {
                "schema_version": "meridian.workspace-changes.v1",
                "project_id": "fixture-project",
                "epoch": "fixture-feed",
                "next_sequence": 2,
                "ideas": [
                    {
                        "id": "fixture-idea",
                        "title": "Use the fixture root",
                        "body": "Keep implementation aligned with fixture.A.",
                        "archived": False,
                        "created": "2026-09-16",
                        "updated": "2026-09-16",
                        "node": "fixture.A",
                        "source": {"chat_title": "Fixture discussion"},
                    }
                ],
                "changes": [
                    {
                        "sequence": 1,
                        "at": "2026-09-16T00:00:00Z",
                        "kind": "idea.node_linked",
                        "summary": "Fixture idea linked to fixture.A",
                        "refs": [
                            {"kind": "project", "id": "fixture-project"},
                            {"kind": "idea", "id": "fixture-idea"},
                            {"kind": "node", "id": "fixture.A"},
                        ],
                    }
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (meridian_root / "control/plan.json").write_text(
        json.dumps(
            {
                "schema_version": "meridian.project-plan.v1",
                "revision": "fixture-revision",
                "updated_at": "2026-09-16T00:00:00Z",
                "project": {"id": "fixture-project", "name": "Fixture Project"},
                "tasks": [{"id": "fixture-task", "title": "Run fixture probe"}],
                "milestones": [],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (meridian_root / "experiments/fixture-probe.md").write_text(
        "---\n"
        "type: research-experiment\n"
        "id: fixture-probe\n"
        "validity: valid\n"
        "primary_target: fixture.B\n"
        "---\n"
        "# Experiment: Fixture probe\n\n"
        "## Question\n\nDoes the fixture branch accept a source-backed result?\n\n"
        "## Command / Config / Output\n\n- command: `fixture-probe`\n- output: deterministic\n\n"
        "## Result\n\nThe deterministic fixture completed.\n\n"
        "## Validity\n\n`valid`\n\n"
        "## Interpretation\n\nThe MCP result return path is connected.\n",
        encoding="utf-8",
    )
    (meridian_root / "state.md").write_text(
        "---\ntype: lab-state\nactive_thread: fixture\nactive_nodes: [fixture.A]\n---\n# State\n",
        encoding="utf-8",
    )
    (meridian_root / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
    (meridian_root / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
    (meridian_root / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
    (meridian_root / "threads/fixture.md").write_text(
        "---\ntype: research-thread\ntitle: Fixture\n---\n"
        "# Research Thread: Fixture\n\n"
        "## Approach Tree\n\n"
        "### Node A: Fixture root\n\n"
        "- mode: `unresolved`\n\n"
        "#### Next Action\n\n"
        "Run the fixture probe.\n",
        encoding="utf-8",
    )


def _tool_call(request_id: int, name: str, arguments: JsonDict) -> JsonDict:
    return {"jsonrpc": "2.0", "id": request_id, "method": "tools/call", "params": {"name": name, "arguments": arguments}}


def _tool_payload(response: JsonDict) -> JsonDict:
    result = response.get("result") or {}
    content = result.get("content") or []
    if not content:
        return {}
    return json.loads(str(content[0].get("text") or "{}"))


def _first_canonical_path(context_payload: JsonDict) -> str:
    for item in context_payload.get("results_summary") or []:
        path = item.get("canonical_path")
        if path:
            return str(path)
    raise ValueError("context call returned no canonical page path")


def _status(
    *,
    initialize: JsonDict,
    tools: JsonDict,
    context: JsonDict,
    read: JsonDict,
    trace: JsonDict,
    blocked_read: JsonDict,
    audit: JsonDict,
    fixture_result: JsonDict,
    workspace_result: JsonDict,
) -> str:
    if "error" in initialize or "error" in tools or "error" in context or "error" in read or "error" in trace or "error" in audit:
        return "fail"
    tool_names = {tool.get("name") for tool in (tools.get("result") or {}).get("tools") or []}
    expected = {
        "meridian.capabilities",
        "meridian.context",
        "meridian.read",
        "meridian.trace",
        "meridian.wiki_propose",
        "meridian.wiki_proposal_status",
        "meridian.audit",
        "meridian.workspace_status",
        "meridian.workspace_plan",
        "meridian.workspace_changes",
        "meridian.workspace_idea",
        "meridian.workspace_event_add",
        "meridian.workspace_idea_add",
        "meridian.lab_graph",
        "meridian.lab_node",
        "meridian.lab_update",
        "meridian.lab_result",
    }
    if expected - tool_names:
        return "fail"
    if not _tool_payload(context).get("results_summary"):
        return "fail"
    if not (_tool_payload(read).get("body") or _tool_payload(read).get("sections")):
        return "fail"
    if not _tool_payload(trace).get("page"):
        return "fail"
    if not ((blocked_read.get("result") or {}).get("isError")):
        return "fail"
    if fixture_result["propose_payload"].get("status") != "submitted":
        return "fail"
    if fixture_result["proposal_status_payload"].get("status") != "waiting_for_app":
        return "fail"
    if fixture_result["audit_payload"].get("status") != "not_run":
        return "fail"
    if workspace_result["status_payload"].get("status") != "ready":
        return "fail"
    if workspace_result["plan_payload"].get("revision") != "fixture-revision":
        return "fail"
    if workspace_result["changes_payload"].get("cursor_status") != "ok":
        return "fail"
    if (workspace_result["idea_payload"].get("idea") or {}).get("id") != "fixture-idea":
        return "fail"
    if (workspace_result["node_payload"].get("node") or {}).get("id") != "fixture.A":
        return "fail"
    if not workspace_result["node_payload"].get("linked_ideas"):
        return "fail"
    if workspace_result["event_payload"].get("status") != "created":
        return "fail"
    if workspace_result["graph_payload"].get("health", {}).get("status") != "pass":
        return "fail"
    if workspace_result["update_payload"].get("status") != "applied":
        return "fail"
    if workspace_result["result_payload"].get("status") != "applied":
        return "fail"
    graph_after = workspace_result["graph_after_payload"].get("graph", {})
    if "fixture.B" not in {node.get("id") for node in graph_after.get("nodes", [])}:
        return "fail"
    if graph_after.get("active_nodes") != ["fixture.A"]:
        return "fail"
    fixture_node = next((node for node in graph_after.get("nodes", []) if node.get("id") == "fixture.B"), {})
    if fixture_node.get("state") != "supported":
        return "fail"
    return "pass"


if __name__ == "__main__":
    raise SystemExit(main())
