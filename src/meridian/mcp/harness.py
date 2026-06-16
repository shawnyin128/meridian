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

    The main wiki is used for read-only Use Wiki calls. A small disposable
    fixture wiki is used for proposal/apply so the harness can validate the
    Update Wiki path without mutating the user's canonical vault.
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

    fixture_result = _run_fixture_update_sequence(fixture_root=fixture_root)
    transcript.extend(fixture_result["transcript"])

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
        ),
        "summary": {
            "server_name": (initialize.get("result") or {}).get("serverInfo", {}).get("name"),
            "tool_count": len((tools.get("result") or {}).get("tools") or []),
            "context_result_count": context_payload.get("result_count"),
            "read_page": _tool_payload(read).get("page"),
            "trace_page": _tool_payload(trace).get("page"),
            "blocked_internal_read": bool(((blocked_read.get("result") or {}).get("isError"))),
            "fixture_apply_status": fixture_result["apply_payload"].get("status"),
            "fixture_published_path": fixture_result["apply_payload"].get("published_path"),
        },
        "expected_tools": [
            "meridian.capabilities",
            "meridian.context",
            "meridian.read",
            "meridian.trace",
            "meridian.update",
            "meridian.propose",
            "meridian.apply",
            "meridian.audit",
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


def _run_fixture_update_sequence(*, fixture_root: Path | None) -> JsonDict:
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
            "meridian.propose",
            {
                "wiki_root": str(wiki_root),
                "query": "activation outlier implementation probe planning",
                "title": "Fixture Activation Outlier Probe Synthesis",
                "proposal_type": "synthesis",
                "context_path": _tool_payload(context).get("context_json_path"),
            },
        )
    )
    propose_payload = _tool_payload(propose)
    apply = call(
        _tool_call(
            103,
            "meridian.apply",
            {
                "wiki_root": str(wiki_root),
                "proposal_manifest": propose_payload.get("proposal_manifest"),
            },
        )
    )
    apply_payload = _tool_payload(apply)
    result = {
        "fixture_root": str(wiki_root),
        "context_payload": _tool_payload(context),
        "propose_payload": propose_payload,
        "apply_payload": apply_payload,
        "transcript": transcript,
    }
    if temp_dir is not None:
        temp_dir.cleanup()
    return result


def _write_fixture_wiki(wiki_root: Path) -> None:
    paper = wiki_root / "papers/Fixture-Activation-Outliers.md"
    paper.parent.mkdir(parents=True, exist_ok=True)
    (wiki_root / "syntheses").mkdir(parents=True, exist_ok=True)
    paper.write_text(
        "\n".join(
            [
                "---",
                'type: "paper"',
                'title: "Fixture Activation Outliers"',
                "aliases:",
                '  - "FixtureOutliers"',
                "topics:",
                '  - "activation outliers"',
                '  - "quantization error"',
                "methods:",
                '  - "post-training quantization"',
                '  - "outlier-aware quantization"',
                "settings:",
                '  - "weight-activation quantization"',
                'confidence: "medium"',
                'review_state: "auto_converged"',
                'quality_state: "text_converged"',
                'validation_state: "text_converged"',
                'trust_state: "source_grounded_text"',
                'evolution_state: "active"',
                "---",
                "# Fixture Activation Outliers",
                "",
                "## What To Remember",
                "",
                "Activation outlier probes are useful before changing a quantization kernel.",
                "",
                "## Mechanism",
                "",
                "Outlier-aware quantization checks whether rare high-magnitude activations dominate scaling and downstream error.",
                "",
                "## Evidence Map",
                "",
                "The fixture evidence supports only MCP harness behavior, not a scientific claim.",
                "",
                "## Implementation Hooks",
                "",
                "Plot activation maxima and run a no-smoothing ablation before changing deployment kernels.",
            ]
        )
        + "\n",
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
) -> str:
    if "error" in initialize or "error" in tools or "error" in context or "error" in read or "error" in trace or "error" in audit:
        return "fail"
    tool_names = {tool.get("name") for tool in (tools.get("result") or {}).get("tools") or []}
    expected = {
        "meridian.capabilities",
        "meridian.context",
        "meridian.read",
        "meridian.trace",
        "meridian.update",
        "meridian.propose",
        "meridian.apply",
        "meridian.audit",
    }
    if expected - tool_names:
        return "fail"
    if not _tool_payload(context).get("results_summary"):
        return "fail"
    if not _tool_payload(read).get("sections"):
        return "fail"
    if not _tool_payload(trace).get("page"):
        return "fail"
    if not ((blocked_read.get("result") or {}).get("isError")):
        return "fail"
    if fixture_result["apply_payload"].get("status") != "published":
        return "fail"
    return "pass"


if __name__ == "__main__":
    raise SystemExit(main())
