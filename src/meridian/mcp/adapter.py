from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from meridian.mcp.app_library import app_native_candidates, app_native_catalog_records
from meridian.mcp.context_contract import CONTEXT_SCHEMA_VERSION, build_context_packet
from meridian.wiki.claims import ProposalValidationError
from meridian.wiki.context_paths import default_mcp_context_out_dir
from meridian.wiki.corpus import (
    parse_frontmatter,
    retrieve_papers,
    split_sections,
    strip_frontmatter,
)
from meridian.wiki.pages import (
    generated_regions,
    page_children,
    page_members,
    page_version,
    resolve_page,
    resolve_vault_root,
)
from meridian.wiki.propose import submit_wiki_proposal
from meridian.wiki.queue import (
    find_proposal_record,
    inbox_has_key,
    read_proposal_records,
    read_wiki_signals,
)
from meridian.wiki.workspace import resolve_workspace
from meridian.workspace_protocol import WorkspaceProtocolError

TOOL_SCHEMA_VERSION = "meridian.mcp_adapter.v1"
NEEDS_INIT_MESSAGE = "No Paper Wiki workspace is configured."
NEEDS_INIT_NEXT_ACTION = (
    "Create a Paper Wiki library through the Meridian App, then register it with "
    "meridian wiki init --library-root <library-root>, or pass wiki_root explicitly."
)
INDEX_WRITE_NEXT_ACTION = (
    "Grant write access to the Paper Wiki library or run the same request in "
    "an environment that can write the wiki's `.meridian/` directory."
)


def capabilities(*, detail: str = "summary") -> dict[str, Any]:
    """Return the small product-facing Meridian tool surface."""
    tools = [
        {
            "name": "meridian.context",
            "workflow": "Use Wiki",
            "summary": "Search the canonical wiki for a research or coding intent.",
            "inputs": ["query", "wiki_root", "top_k", "max_chars_per_result"],
            "outputs": ["context", "context_path", "context_json_path", "results_summary"],
        },
        {
            "name": "meridian.read",
            "workflow": "Use Wiki",
            "summary": "Read one wiki page: frontmatter (memberships, claims), body, and generated regions.",
            "inputs": ["page", "wiki_root", "sections", "max_chars"],
            "outputs": ["frontmatter", "generated", "body", "version"],
        },
        {
            "name": "meridian.trace",
            "workflow": "Use Wiki",
            "summary": "Trace a page's links: parents/children/members/memberships, claim evidence and conflicts.",
            "inputs": ["page", "wiki_root", "max_chars"],
            "outputs": ["parents", "children", "members", "memberships", "claims", "version"],
        },
        {
            "name": "meridian.wiki_propose",
            "workflow": "Update Wiki",
            "summary": (
                "Propose a conclusion a project found and summarised, as claim ops. "
                "The user reviews it in the App; this tool never writes wiki content directly."
            ),
            "inputs": ["ops", "title", "trigger", "rationale", "wiki_root"],
            "outputs": ["key", "path", "named_pages"],
        },
        {
            "name": "meridian.wiki_proposal_status",
            "workflow": "Update Wiki",
            "summary": "Check whether a submitted proposal is waiting, applied, or rejected.",
            "inputs": ["key", "wiki_root", "limit"],
            "outputs": ["status", "record", "records"],
        },
        {
            "name": "meridian.audit",
            "workflow": "Update Wiki",
            "summary": "Read the App's deterministic wiki signals (lint findings), computed by Core.",
            "inputs": ["wiki_root", "scope"],
            "outputs": ["generated_at", "signals"],
        },
        {
            "name": "meridian.workspace_status",
            "workflow": "Project Workspace",
            "summary": "Validate the App-owned plan and repository-owned graph/event views.",
            "inputs": ["workspace_root"],
            "outputs": ["status", "project", "surfaces"],
        },
        {
            "name": "meridian.workspace_plan",
            "workflow": "Project Workspace",
            "summary": "Read the App-owned project plan without changing it.",
            "inputs": ["workspace_root"],
            "outputs": ["revision", "project", "tasks", "milestones"],
        },
        {
            "name": "meridian.workspace_changes",
            "workflow": "Coding Context",
            "summary": "Read bounded App-owned changes after an opaque client cursor.",
            "inputs": ["workspace_root", "cursor", "limit", "kinds"],
            "outputs": ["cursor_status", "next_cursor", "has_more", "changes"],
        },
        {
            "name": "meridian.workspace_idea",
            "workflow": "Coding Context",
            "summary": "Expand one current project-linked idea referenced by the change list.",
            "inputs": ["workspace_root", "idea_id"],
            "outputs": ["project_id", "idea"],
        },
        {
            "name": "meridian.workspace_event_add",
            "workflow": "Project Workspace",
            "summary": "Append an idempotent App-visible event backed by durable repository evidence.",
            "inputs": ["workspace_root", "event_id", "text", "source", "date", "node"],
            "outputs": ["status", "path", "event"],
        },
        {
            "name": "meridian.workspace_idea_add",
            "workflow": "Project Workspace",
            "summary": "Record an idempotent research idea found while working, for the App's idea list.",
            "inputs": ["workspace_root", "idea_id", "title", "body", "context", "date", "node"],
            "outputs": ["status", "path", "idea"],
        },
        {
            "name": "meridian.lab_graph",
            "workflow": "Lab",
            "summary": "Read the current Markdown-backed research graph and its health without changing App planning state.",
            "inputs": ["workspace_root"],
            "outputs": ["graph", "health"],
        },
        {
            "name": "meridian.lab_node",
            "workflow": "Coding Context",
            "summary": "Expand one research node, its local edges, details, and linked ideas.",
            "inputs": ["workspace_root", "node_id"],
            "outputs": ["node", "detail", "incoming", "outgoing", "linked_ideas", "health"],
        },
        {
            "name": "meridian.lab_update",
            "workflow": "Lab",
            "summary": "Validate and apply a strict Lab update packet, then refresh the App-visible graph projection.",
            "inputs": ["workspace_root", "packet"],
            "outputs": ["status", "validation", "written_paths", "graph_health"],
        },
        {
            "name": "meridian.lab_result",
            "workflow": "Lab",
            "summary": "Atomically attach an experiment to a Lab node, optionally writing the new record first, and publish its compact App-visible event.",
            "inputs": [
                "workspace_root",
                "node_id",
                "event_id",
                "summary",
                "source",
                "impact",
                "date",
                "state",
                "next_action",
                "user_confirmation",
                "experiment",
            ],
            "outputs": ["status", "evidence", "event", "lab_update", "written_paths"],
        },
    ]
    response: dict[str, Any] = {
        "schema_version": TOOL_SCHEMA_VERSION,
        "entry_model": {
            "entries": ["Prompt/Skill", "MCP"],
            "workflows": ["Update Wiki", "Use Wiki", "Project Workspace", "Lab"],
            "source_of_truth": (
                "The Meridian App owns paper ingest, aggregation structure, and every wiki write. "
                "Coding agents only read the wiki and propose conclusions for review."
            ),
        },
        "context_contract": CONTEXT_SCHEMA_VERSION,
        "tools": tools,
    }
    if detail == "full":
        response["examples"] = [
            {
                "workflow": "Use Wiki",
                "call": {"tool": "meridian.context", "query": "I need prerequisite concepts for KV-cache compression debugging."},
            },
            {
                "workflow": "Update Wiki",
                "call": {
                    "tool": "meridian.wiki_propose",
                    "title": "把「宽度 6 处收益拐点」写入 speculative-decoding",
                    "trigger": {"project": "draft", "node": "exp1"},
                    "ops": [
                        {
                            "op": "addClaim",
                            "page": "topics/speculative-decoding",
                            "claim": {
                                "id": "knee",
                                "text": "单请求场景下,draft 树加宽的收益在宽度约 6 处出现拐点",
                                "evidence": [{"kind": "experiment", "project": "draft", "node": "exp1"}],
                            },
                        }
                    ],
                },
            },
            {
                "workflow": "Project Workspace",
                "call": {
                    "tool": "meridian.workspace_event_add",
                    "workspace_root": "/path/to/research-repo",
                    "event_id": "latency-probe-complete",
                    "text": "Latency probe passed on A100",
                    "source": ".meridian/experiments/latency-probe.md",
                },
            },
            {
                "workflow": "Lab",
                "call": {
                    "tool": "meridian.lab_result",
                    "workspace_root": "/path/to/research-repo",
                    "node_id": "speculative-decoding.B",
                    "event_id": "baseline-latency-complete",
                    "summary": "Baseline latency probe supports the lightweight draft path",
                    "source": ".meridian/experiments/baseline-latency.md",
                    "impact": "supports",
                    "state": "supported",
                },
            },
        ]
    return response


def context(
    *,
    query: str,
    wiki_root: Path,
    top_k: int = 6,
    strategy: str = "v1",
    max_chars_per_result: int = 1200,
    out_dir: Path | None = None,
) -> dict[str, Any]:
    """Search the wiki and return a compact context packet."""
    if max_chars_per_result < 200:
        raise ValueError("max_chars_per_result must be >= 200")
    target_dir = out_dir or default_mcp_context_out_dir(query)
    packet_path = target_dir / "context.md"
    result_path = target_dir / "context.json"
    records = app_native_catalog_records(wiki_root)
    candidates = app_native_candidates(records, query=query, limit=max(80, top_k * 20))
    records_by_id = {str(record["page_id"]): record for record in candidates}
    result = retrieve_papers(
        query=query,
        wiki_root=wiki_root,
        catalog_records=candidates,
        top_k=top_k,
        strategy=strategy,
        packet_path=packet_path,
    )
    context_packet = build_context_packet(
        query=query,
        results=result.results,
        layout="app_native",
        top_k=top_k,
        max_chars_per_result=max_chars_per_result,
        warnings=result.warnings,
        records_by_id=records_by_id,
    )
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_text(json.dumps(context_packet, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.context",
        "workflow": "Use Wiki",
        "query": query,
        "context": context_packet,
        "context_path": str(packet_path),
        "context_json_path": str(result_path),
        "result_count": len(result.results),
        "results_summary": [_summarize_result(item) for item in result.results],
    }


def read(
    *,
    page: str,
    wiki_root: Path,
    sections: list[str] | None = None,
    max_chars: int = 2400,
) -> dict[str, Any]:
    """Read one wiki page: frontmatter (memberships/claims), generated regions, and body."""
    record = resolve_page(wiki_root, page)
    path = Path(str(record["path"]))
    text = path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(text)
    body = strip_frontmatter(text)
    regions, prose = generated_regions(body)
    result_type = str(frontmatter.get("type") or frontmatter.get("kind") or record.get("type") or "page")
    payload: dict[str, Any] = {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.read",
        "workflow": "Use Wiki",
        "page": record["relative_path"],
        "result_type": result_type,
        "title": frontmatter.get("title") or path.stem,
        "version": page_version(path),
        "frontmatter": frontmatter,
        "generated": {name: _trim(content, max_chars=max_chars) for name, content in regions.items()},
    }
    if sections:
        parsed_sections = split_sections(prose)
        payload["sections"] = {
            heading: _trim(parsed_sections[heading], max_chars=max_chars)
            for heading in sections
            if parsed_sections.get(heading)
        }
    else:
        payload["body"] = _trim(prose, max_chars=max_chars)
    return payload


def trace(*, page: str, wiki_root: Path, max_chars: int = 1600) -> dict[str, Any]:
    """Trace a page's links: parents/children/members/memberships, claim evidence and conflicts."""
    records = app_native_catalog_records(wiki_root)
    record = resolve_page(wiki_root, page, records=records)
    page_id = str(record["page_id"])
    path = Path(str(record["path"]))
    frontmatter = record.get("raw_frontmatter") or {}
    result_type = str(frontmatter.get("type") or frontmatter.get("kind") or record.get("type") or "page")
    id_to_title = {str(item["page_id"]): str(item.get("title") or item["page_id"]) for item in records}
    payload: dict[str, Any] = {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.trace",
        "workflow": "Use Wiki",
        "page": record["relative_path"],
        "title": record.get("title"),
        "result_type": result_type,
        "version": page_version(path),
    }
    if result_type == "paper":
        payload["memberships"] = record.get("_memberships") or []
    else:
        payload["parents"] = [
            {"id": str(parent), "title": id_to_title.get(str(parent), str(parent))}
            for parent in frontmatter.get("parents") or []
        ]
        payload["children"] = page_children(wiki_root, page_id, records=records)
        payload["members"] = page_members(wiki_root, page_id, records=records)
        payload["claims"] = [_trim_claim(claim, max_chars=max_chars) for claim in frontmatter.get("claims") or []]
    return payload


def wiki_propose(
    *,
    wiki_root: Path,
    ops: list[dict[str, Any]],
    title: str,
    trigger: dict[str, Any],
    rationale: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Propose a conclusion (claim ops only) for the App's review queue."""
    if not isinstance(trigger, dict):
        raise ProposalValidationError("trigger must be an object with a project")
    result = submit_wiki_proposal(
        wiki_root=wiki_root,
        ops=ops,
        title=title,
        project=str(trigger.get("project") or ""),
        node=str(trigger["node"]) if trigger.get("node") not in (None, "") else None,
        rationale=rationale,
        model=model,
    )
    return {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.wiki_propose",
        "workflow": "Update Wiki",
        "status": "submitted",
        "key": result["key"],
        "path": result["path"],
        "named_pages": result["named_pages"],
        "next_action": "meridian.wiki_proposal_status",
    }


def wiki_proposal_status(*, wiki_root: Path, key: str | None = None, limit: int = 10) -> dict[str, Any]:
    """Check the queue for a submitted proposal, or list recent ones."""
    vault_root = resolve_vault_root(wiki_root)
    base: dict[str, Any] = {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.wiki_proposal_status",
        "workflow": "Update Wiki",
    }
    if key:
        record = find_proposal_record(vault_root, key)
        if record is not None:
            return {**base, "key": key, "status": record.get("status"), "record": record}
        waiting = inbox_has_key(vault_root, key)
        return {
            **base,
            "key": key,
            "status": "waiting_for_app" if waiting else "unknown",
            "message": (
                "Waiting for the App to scan the proposal inbox."
                if waiting
                else "No proposal with this key was found in the inbox or the queue."
            ),
        }
    records = read_proposal_records(vault_root)[: max(1, limit)]
    return {**base, "count": len(records), "records": records}


def audit(*, wiki_root: Path, scope: str = "summary") -> dict[str, Any]:
    """Read the App's deterministic wiki signals."""
    vault_root = resolve_vault_root(wiki_root)
    payload = read_wiki_signals(vault_root)
    base = {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.audit",
        "workflow": "Update Wiki",
        "scope": scope,
    }
    if payload is None:
        return {
            **base,
            "status": "not_run",
            "generated_at": None,
            "signal_count": 0,
            "signals": [],
            "message": "No wiki-signals.json yet; the App must run at least once against this vault.",
        }
    signals = payload.get("signals") or []
    return {
        **base,
        "status": "ok",
        "generated_at": payload.get("generated_at"),
        "signal_count": len(signals),
        "signals": signals if scope == "all" else signals[:20],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Meridian MCP adapter JSON bridge")
    parser.add_argument(
        "tool",
        choices=["capabilities", "context", "read", "trace", "wiki-propose", "wiki-proposal-status", "audit"],
    )
    parser.add_argument("--wiki-root", default=None)
    parser.add_argument("--query")
    parser.add_argument("--page")
    parser.add_argument("--detail", default="summary")
    parser.add_argument("--top-k", type=int, default=6)
    parser.add_argument("--max-chars-per-result", type=int, default=1200)
    parser.add_argument("--title")
    parser.add_argument("--project")
    parser.add_argument("--node")
    parser.add_argument("--ops", help="Path to a JSON file with the claim ops array.")
    parser.add_argument("--key")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--scope", default="summary")
    args = parser.parse_args(argv)

    try:
        wiki_root: Path | None = None
        if args.tool != "capabilities":
            wiki_root = Path(args.wiki_root) if args.wiki_root else _default_wiki_root()

        if args.tool == "capabilities":
            payload = capabilities(detail=args.detail)
        elif args.tool == "context":
            if not args.query:
                parser.error("--query is required for context")
            payload = context(
                query=args.query,
                wiki_root=wiki_root,
                top_k=args.top_k,
                max_chars_per_result=args.max_chars_per_result,
            )
        elif args.tool == "read":
            if not args.page:
                parser.error("--page is required for read")
            payload = read(page=args.page, wiki_root=wiki_root)
        elif args.tool == "trace":
            if not args.page:
                parser.error("--page is required for trace")
            payload = trace(page=args.page, wiki_root=wiki_root)
        elif args.tool == "wiki-propose":
            if not args.title or not args.project or not args.ops:
                parser.error("--title, --project, and --ops are required for wiki-propose")
            ops = json.loads(Path(args.ops).read_text(encoding="utf-8"))
            payload = wiki_propose(
                wiki_root=wiki_root,
                ops=ops,
                title=args.title,
                trigger={"project": args.project, "node": args.node},
            )
        elif args.tool == "wiki-proposal-status":
            payload = wiki_proposal_status(wiki_root=wiki_root, key=args.key, limit=args.limit)
        else:
            payload = audit(wiki_root=wiki_root, scope=args.scope)
    except Exception as exc:
        print(format_call_chain_error(exc), file=sys.stderr)
        return 1
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


def _summarize_result(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": item.get("title"),
        "canonical_path": item.get("canonical_path") or item.get("relative_path"),
        "result_type": item.get("result_type"),
        "knowledge_role": item.get("knowledge_role"),
        "score": item.get("score"),
        "why": item.get("selection_reasons") or [],
    }


def _trim_claim(claim: dict[str, Any], *, max_chars: int) -> dict[str, Any]:
    if not isinstance(claim, dict):
        return claim
    trimmed = dict(claim)
    if isinstance(trimmed.get("text"), str):
        trimmed["text"] = _trim(trimmed["text"], max_chars=max_chars)
    return trimmed


def _trim(value: str, *, max_chars: int) -> str:
    compact = re.sub(r"\n{3,}", "\n\n", value.strip())
    if len(compact) <= max_chars:
        return compact
    return compact[: max_chars - 1].rstrip() + "…"


def missing_workspace_error_payload() -> dict[str, Any]:
    return {
        "status": "error",
        "error_code": "needs_init",
        "message": NEEDS_INIT_MESSAGE,
        "next_action": NEEDS_INIT_NEXT_ACTION,
    }


def call_chain_error_payload(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, ProposalValidationError):
        return {
            "status": "error",
            "error_code": "invalid_proposal",
            "message": str(exc),
            "next_action": "Fix the claim op and resubmit; agents may only submit the six claim ops.",
        }
    if isinstance(exc, WorkspaceProtocolError):
        return {
            "status": "error",
            "error_code": "workspace_protocol_error",
            "message": str(exc),
            "next_action": (
                "Check the repository root, initialize the App workspace binding, and keep evidence paths "
                "inside the repository before retrying."
            ),
        }
    if isinstance(exc, FileNotFoundError) and NEEDS_INIT_MESSAGE in str(exc):
        return missing_workspace_error_payload()
    if isinstance(exc, PermissionError):
        filename = getattr(exc, "filename", None)
        return {
            "status": "error",
            "error_code": "workspace_index_write_failed",
            "message": "Meridian could not write to the Paper Wiki library.",
            "path": str(filename) if filename else "",
            "next_action": INDEX_WRITE_NEXT_ACTION,
        }
    return {
        "status": "error",
        "error_code": "call_chain_error",
        "message": str(exc),
        "next_action": "Inspect the Meridian setup, workspace path, and command arguments, then retry.",
    }


def format_call_chain_error(exc: Exception) -> str:
    payload = call_chain_error_payload(exc)
    parts = [str(payload["error_code"]), str(payload["message"]), f"Next action: {payload['next_action']}"]
    if payload.get("path"):
        parts.insert(2, f"Path: {payload['path']}")
    return "\n".join(parts)


def _default_wiki_root() -> Path:
    workspace = resolve_workspace()
    if workspace is not None:
        return workspace.wiki_root
    raise FileNotFoundError(NEEDS_INIT_MESSAGE)
