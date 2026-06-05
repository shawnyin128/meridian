from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import sys
from pathlib import Path
from typing import Any

from meridian.wiki.commands import (
    add_insight_wiki,
    health_wiki,
    insight_lint_wiki,
    proposal_lint_wiki,
    propose_writeback_wiki,
    publish_insight_wiki,
    publish_proposal_wiki,
    retrieve_wiki,
)
from meridian.wiki.workspace import resolve_workspace
from meridian.wiki.corpus import (
    build_knowledge_catalogs,
    build_paper_catalog,
    build_synthesis_catalog,
    parse_frontmatter,
    split_sections,
    strip_frontmatter,
)

CANONICAL_DIRS = {"papers", "syntheses", "methods", "topics", "concepts", "claims", "evidence"}
TOOL_SCHEMA_VERSION = "meridian.mcp_adapter.v0"
NEEDS_INIT_MESSAGE = "No Paper Wiki workspace is configured."
NEEDS_INIT_NEXT_ACTION = (
    "Run meridian wiki init --library-root <paper-wiki-library-root> "
    "or initialize through the meridian setup skill."
)
INDEX_WRITE_NEXT_ACTION = (
    "Grant write access to the Paper Wiki library or run the same request in "
    "an environment that can write the wiki .index directory."
)
DEFAULT_PAPER_QUALITY_RUBRIC = Path("eval/rubrics/paper_wiki_quality_v0.md")


def capabilities(*, detail: str = "summary") -> dict[str, Any]:
    """Return the small product-facing Meridian tool surface."""
    tools = [
        {
            "name": "meridian.context",
            "workflow": "Use Wiki",
            "summary": "Retrieve compact canonical wiki context for a research or coding intent.",
            "inputs": ["query", "wiki_root", "top_k"],
            "outputs": ["context_path", "context_json_path", "results_summary"],
        },
        {
            "name": "meridian.read",
            "workflow": "Use Wiki",
            "summary": "Read selected sections from a canonical wiki page.",
            "inputs": ["page", "wiki_root", "sections"],
            "outputs": ["page", "frontmatter", "sections"],
        },
        {
            "name": "meridian.trace",
            "workflow": "Use Wiki",
            "summary": "Return provenance and linked evidence/source chain for a canonical page.",
            "inputs": ["page", "wiki_root"],
            "outputs": ["page", "provenance", "links", "evidence_sections"],
        },
        {
            "name": "meridian.update",
            "workflow": "Update Wiki",
            "summary": "Add a user insight, or prepare a complete CLI ingest handoff for a local PDF source.",
            "inputs": ["local source_path or note", "wiki_root", "paper"],
            "outputs": ["artifact_summary", "next_action", "run_command", "fallback_command"],
        },
        {
            "name": "meridian.propose",
            "workflow": "Update Wiki",
            "summary": "Turn retrieved context or a note into a lintable wiki proposal.",
            "inputs": ["query", "context_path", "title", "proposal_type"],
            "outputs": ["proposal_path", "proposal_manifest", "publish_plan"],
        },
        {
            "name": "meridian.apply",
            "workflow": "Update Wiki",
            "summary": "Lint and publish an existing proposal when it is safe to canonicalize.",
            "inputs": ["proposal_manifest", "wiki_root"],
            "outputs": ["status", "published_path", "lint_report"],
        },
        {
            "name": "meridian.audit",
            "workflow": "Update Wiki",
            "summary": "Return a compact deterministic wiki health summary for maintenance decisions.",
            "inputs": ["wiki_root", "scope"],
            "outputs": ["health_level", "overall_score", "top_repairs", "report_paths"],
        },
    ]
    response: dict[str, Any] = {
        "schema_version": TOOL_SCHEMA_VERSION,
        "entry_model": {
            "entries": ["Prompt/Skill", "MCP"],
            "workflows": ["Update Wiki", "Use Wiki"],
            "source_of_truth": "Configured Markdown vault under the active Paper Wiki workspace.",
        },
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
                    "tool": "meridian.propose",
                    "query": "Compare evidence for activation outlier smoothing across PTQ papers.",
                    "proposal_type": "synthesis",
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
    out_dir: Path | None = None,
) -> dict[str, Any]:
    """Retrieve a compact context packet and return summary metadata."""
    target_dir = out_dir or Path("/private/tmp/meridian-context") / f"mcp-{_slug(query)}"
    packet_path = target_dir / "context.md"
    result_path = target_dir / "context.json"
    result = retrieve_wiki(
        query=query,
        wiki_root=wiki_root,
        top_k=top_k,
        strategy=strategy,
        packet_path=packet_path,
        result_path=result_path,
    )
    return {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.context",
        "workflow": "Use Wiki",
        "query": query,
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
    """Read selected sections from a canonical wiki page."""
    page_path = _resolve_canonical_page(page=page, wiki_root=wiki_root)
    text = page_path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(text)
    parsed_sections = split_sections(strip_frontmatter(text))
    selected = sections or _default_sections_for_page(frontmatter=frontmatter, parsed_sections=parsed_sections)
    selected_sections = {
        heading: _trim(parsed_sections.get(heading, ""), max_chars=max_chars)
        for heading in selected
        if parsed_sections.get(heading)
    }
    return {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.read",
        "workflow": "Use Wiki",
        "page": _relative_to_wiki(page_path, wiki_root=wiki_root),
        "result_type": frontmatter.get("type") or page_path.parent.name.rstrip("s"),
        "title": frontmatter.get("title") or page_path.stem,
        "frontmatter": frontmatter,
        "sections": selected_sections,
    }


def trace(*, page: str, wiki_root: Path, max_chars: int = 1600) -> dict[str, Any]:
    """Return provenance fields and provenance-bearing sections for a page."""
    page_path = _resolve_canonical_page(page=page, wiki_root=wiki_root)
    text = page_path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(text)
    parsed_sections = split_sections(strip_frontmatter(text))
    provenance_fields = {
        key: frontmatter.get(key)
        for key in (
            "source_id",
            "source_pdf",
            "source_papers",
            "sources",
            "related_papers",
            "related_claims",
            "related_evidence",
            "confidence",
            "review_state",
            "quality_state",
            "trust_state",
            "evolution_state",
        )
        if frontmatter.get(key) not in (None, "", [])
    }
    evidence_sections = {
        heading: _trim(parsed_sections[heading], max_chars=max_chars)
        for heading in (
            "Evidence Map",
            "Evidence / Provenance",
            "Provenance",
            "Source",
            "Supporting Evidence",
            "Contradicting Evidence",
            "Source Facts",
        )
        if heading in parsed_sections and parsed_sections[heading].strip()
    }
    return {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.trace",
        "workflow": "Use Wiki",
        "page": _relative_to_wiki(page_path, wiki_root=wiki_root),
        "title": frontmatter.get("title") or page_path.stem,
        "result_type": frontmatter.get("type") or page_path.parent.name.rstrip("s"),
        "provenance": provenance_fields,
        "links": _canonical_links(frontmatter),
        "evidence_sections": evidence_sections,
    }


def update(
    *,
    wiki_root: Path,
    source_path: Path | None = None,
    paper: str | None = None,
    note: str | None = None,
    insight_type: str = "paper-note",
) -> dict[str, Any]:
    """Scenario-facing update entry for source ingest or user insight."""
    if note:
        if not paper:
            raise ValueError("paper is required when adding a user note")
        draft = add_insight_wiki(
            wiki_root=wiki_root,
            paper=paper,
            note=note,
            insight_type=insight_type,
        )
        lint = insight_lint_wiki(insight_manifest=draft.manifest_path, wiki_root=wiki_root)
        publishable = lint.status == "pass"
        return {
            "schema_version": TOOL_SCHEMA_VERSION,
            "tool": "meridian.update",
            "workflow": "Update Wiki",
            "update_type": "user_insight",
            "status": "drafted",
            "matched_paper": str(draft.target_page) if draft.target_page else None,
            "insight_manifest": str(draft.manifest_path),
            "insight_draft": str(draft.insight_path),
            "lint_status": lint.status,
            "next_action": "publish_insight" if publishable else "review_match_or_lint_findings",
        }
    if source_path:
        source = Path(source_path).expanduser()
        slug = _slug(source.stem)
        workspace = resolve_workspace(wiki_root=wiki_root)
        effective_wiki_root = workspace.wiki_root if workspace is not None else wiki_root
        managed_source_root = workspace.source_root if workspace is not None else effective_wiki_root / "raw" / "sources"
        out_dir = effective_wiki_root / ".drafts" / "ingests" / slug
        rubric_path = _default_paper_quality_rubric()
        run_command = [
            "meridian",
            "wiki",
            "flow",
            str(source),
            "--wiki-root",
            str(effective_wiki_root),
            "--out",
            str(out_dir),
            "--rubric",
            str(rubric_path),
        ]
        fallback_command = ["python3", "-m", "meridian", *run_command[1:]]
        return {
            "schema_version": TOOL_SCHEMA_VERSION,
            "tool": "meridian.update",
            "workflow": "Update Wiki",
            "update_type": "source",
            "status": "ready_for_ingest_flow",
            "handoff_type": "cli_ingest_flow",
            "source_path": str(source),
            "source_kind": "local_pdf_path",
            "input_contract": {
                "accepted_source_forms": ["local_pdf_path"],
                "url_handling": "For an HTTP(S) paper URL, download it to a local PDF first and pass that path as source_path.",
                "unsupported_source_forms": ["url"],
            },
            "wiki_root": str(effective_wiki_root),
            "managed_source_root": str(managed_source_root),
            "suggested_out_dir": str(out_dir),
            "rubric": {
                "required": True,
                "name": "paper_wiki_quality_v0",
                "path": str(rubric_path),
            },
            "next_action": "run_ingest_flow",
            "run_command": run_command,
            "fallback_command": fallback_command,
            "example_execution_primitive": _shell_join(run_command),
            "fallback_execution_primitive": _shell_join(fallback_command),
            "permission_boundary": {
                "writes_wiki_root": str(effective_wiki_root),
                "writes_managed_source_root": str(managed_source_root),
                "requires_write_access": True,
            },
            "minimum_completion": [
                "Managed source PDF",
                "Canonical wiki page",
                "Quality gate",
                "Review state",
                "Flow status",
            ],
            "post_ingest_checks": [
                "catalog/index rebuilt by flow",
                "git clean or explicit git auto-commit status",
                "report managed source path and canonical page path",
            ],
        }
    raise ValueError("source_path or note is required")


def _default_paper_quality_rubric() -> Path:
    candidates: list[Path] = []
    core_root = os.environ.get("MERIDIAN_CORE_ROOT")
    if core_root:
        candidates.append(Path(core_root).expanduser() / DEFAULT_PAPER_QUALITY_RUBRIC)
    candidates.extend(
        [
            Path(__file__).resolve().parents[3] / DEFAULT_PAPER_QUALITY_RUBRIC,
            Path.cwd() / DEFAULT_PAPER_QUALITY_RUBRIC,
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return DEFAULT_PAPER_QUALITY_RUBRIC


def _shell_join(command: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in command)


def propose(
    *,
    wiki_root: Path,
    query: str,
    title: str,
    proposal_type: str = "synthesis",
    context_path: Path | None = None,
    user_note: str = "",
    out_dir: Path | None = None,
) -> dict[str, Any]:
    """Create a lintable write-back proposal from retrieval context."""
    effective_context = context_path
    context_result: dict[str, Any] | None = None
    if effective_context is None:
        context_result = context(query=query, wiki_root=wiki_root, top_k=6)
        effective_context = Path(str(context_result["context_json_path"]))
    draft = propose_writeback_wiki(
        wiki_root=wiki_root,
        query=query,
        context_path=effective_context,
        title=title,
        proposal_type=proposal_type,
        user_note=user_note,
        out_dir=out_dir,
    )
    lint = proposal_lint_wiki(proposal_manifest=draft.manifest_path, wiki_root=wiki_root)
    return {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.propose",
        "workflow": "Update Wiki",
        "proposal_type": proposal_type,
        "proposal_path": str(draft.proposal_path),
        "proposal_manifest": str(draft.manifest_path),
        "publish_plan": str(draft.publish_plan_path),
        "source_context": str(draft.source_context_path),
        "lint_status": lint.status,
        "context": context_result,
        "next_action": "apply" if lint.status == "pass" else "review_proposal_lint",
    }


def apply(*, proposal_manifest: Path, wiki_root: Path, overwrite: bool = False) -> dict[str, Any]:
    """Lint and publish a write-back proposal."""
    lint = proposal_lint_wiki(proposal_manifest=proposal_manifest, wiki_root=wiki_root, overwrite=overwrite)
    if lint.status != "pass":
        return {
            "schema_version": TOOL_SCHEMA_VERSION,
            "tool": "meridian.apply",
            "workflow": "Update Wiki",
            "status": "blocked_by_lint",
            "proposal_manifest": str(proposal_manifest),
            "lint_report": str(lint.report_path),
            "findings": lint.findings,
        }
    published = publish_proposal_wiki(proposal_manifest=proposal_manifest, wiki_root=wiki_root, overwrite=overwrite)
    return {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.apply",
        "workflow": "Update Wiki",
        "status": "published",
        "published_path": str(published.page_path),
        "publish_result": str(proposal_manifest.parent / "publish-result.json"),
        "lint_report": str(lint.report_path),
    }


def audit(*, wiki_root: Path, scope: str = "summary") -> dict[str, Any]:
    """Return compact deterministic wiki health for maintenance."""
    profile = "release" if scope == "all" else "daily"
    result = health_wiki(wiki_root=wiki_root, profile=profile, repair_plan=scope in {"all", "repair"})
    payload = json.loads(result.report_path.read_text(encoding="utf-8"))
    return {
        "schema_version": TOOL_SCHEMA_VERSION,
        "tool": "meridian.audit",
        "workflow": "Update Wiki",
        "scope": scope,
        "health_level": payload.get("health_level"),
        "overall_score": payload.get("overall_score"),
        "main_insight": payload.get("main_insight"),
        "dimensions": [
            {"name": item.get("name"), "score": item.get("score")}
            for item in payload.get("dimensions", [])
            if isinstance(item, dict)
        ],
        "top_repairs": payload.get("repair_queue", [])[:3],
        "hard_failures": payload.get("hard_failures", []),
        "reports": {
            "health_json": str(result.report_path),
            "health_markdown": str(result.markdown_path),
            "health_html": str(result.html_path),
            "repair_plan": str(result.repair_plan_path) if result.repair_plan_path else None,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Meridian MCP adapter JSON bridge")
    parser.add_argument("tool", choices=["capabilities", "context", "read", "trace", "update", "propose", "apply", "audit"])
    parser.add_argument("--wiki-root", default=None)
    parser.add_argument("--query")
    parser.add_argument("--page")
    parser.add_argument("--detail", default="summary")
    parser.add_argument("--top-k", type=int, default=6)
    parser.add_argument("--source-path")
    parser.add_argument("--paper")
    parser.add_argument("--note")
    parser.add_argument("--insight-type", default="paper-note")
    parser.add_argument("--title")
    parser.add_argument("--proposal-type", default="synthesis")
    parser.add_argument("--context-path")
    parser.add_argument("--proposal-manifest")
    parser.add_argument("--overwrite", action="store_true")
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
            payload = context(query=args.query, wiki_root=wiki_root, top_k=args.top_k)
        elif args.tool == "read":
            if not args.page:
                parser.error("--page is required for read")
            payload = read(page=args.page, wiki_root=wiki_root)
        elif args.tool == "trace":
            if not args.page:
                parser.error("--page is required for trace")
            payload = trace(page=args.page, wiki_root=wiki_root)
        elif args.tool == "update":
            payload = update(
                wiki_root=wiki_root,
                source_path=Path(args.source_path) if args.source_path else None,
                paper=args.paper,
                note=args.note,
                insight_type=args.insight_type,
            )
        elif args.tool == "propose":
            if not args.query:
                parser.error("--query is required for propose")
            if not args.title:
                parser.error("--title is required for propose")
            payload = propose(
                wiki_root=wiki_root,
                query=args.query,
                title=args.title,
                proposal_type=args.proposal_type,
                context_path=Path(args.context_path) if args.context_path else None,
            )
        elif args.tool == "apply":
            if not args.proposal_manifest:
                parser.error("--proposal-manifest is required for apply")
            payload = apply(
                proposal_manifest=Path(args.proposal_manifest),
                wiki_root=wiki_root,
                overwrite=args.overwrite,
            )
        else:
            payload = audit(wiki_root=wiki_root, scope=args.scope)
    except Exception as exc:
        print(format_call_chain_error(exc), file=sys.stderr)
        return 1
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


def _resolve_canonical_page(*, page: str, wiki_root: Path) -> Path:
    raw = page.strip()
    if not raw:
        raise ValueError("page must not be empty")
    candidate = Path(raw)
    if candidate.is_absolute() and candidate.exists():
        return _assert_canonical(candidate, wiki_root=wiki_root)
    if raw.endswith(".md"):
        direct = wiki_root / raw
        if direct.exists():
            return _assert_canonical(direct, wiki_root=wiki_root)
    if "/" in raw:
        direct = wiki_root / f"{raw}.md"
        if direct.exists():
            return _assert_canonical(direct, wiki_root=wiki_root)

    records = _load_catalog_records(wiki_root=wiki_root)
    normalized = _norm(raw)
    for record in records:
        candidates = [
            str(record.get("page_id") or ""),
            str(record.get("relative_path") or ""),
            str(record.get("title") or ""),
            *[str(item) for item in ((record.get("routing") or {}).get("aliases") or [])],
        ]
        if any(_norm(item).rstrip(".md") == normalized.rstrip(".md") for item in candidates):
            return _assert_canonical(_record_page_path(record, wiki_root=wiki_root), wiki_root=wiki_root)
    matches = [record for record in records if normalized in _norm(str(record.get("title") or ""))]
    if len(matches) == 1:
        return _assert_canonical(_record_page_path(matches[0], wiki_root=wiki_root), wiki_root=wiki_root)
    if matches:
        titles = ", ".join(str(item.get("relative_path") or item.get("title")) for item in matches[:8])
        raise ValueError(f"ambiguous page reference: {page}; candidates: {titles}")
    raise FileNotFoundError(f"canonical wiki page not found: {page}")


def _assert_canonical(path: Path, *, wiki_root: Path) -> Path:
    resolved = path.resolve()
    root = wiki_root.resolve()
    try:
        rel = resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"page is outside wiki root: {path}") from exc
    if not rel.parts or rel.parts[0] not in CANONICAL_DIRS:
        raise ValueError(f"page is not a canonical retrieval page: {rel.as_posix()}")
    if any(part in {".drafts", ".versions"} for part in rel.parts):
        raise ValueError(f"internal artifact is not readable through MCP entry: {rel.as_posix()}")
    return resolved


def _record_page_path(record: dict[str, Any], *, wiki_root: Path) -> Path:
    raw = Path(str(record.get("path") or record.get("relative_path") or ""))
    return raw if raw.is_absolute() else wiki_root / raw


def _relative_to_wiki(path: Path, *, wiki_root: Path) -> str:
    return path.resolve().relative_to(wiki_root.resolve()).as_posix()


def _load_catalog_records(*, wiki_root: Path) -> list[dict[str, Any]]:
    build_paper_catalog(wiki_root=wiki_root)
    build_synthesis_catalog(wiki_root=wiki_root)
    build_knowledge_catalogs(wiki_root=wiki_root)
    records = []
    for name in ("papers", "syntheses", "methods", "topics", "concepts", "claims", "evidence"):
        path = wiki_root / ".index" / f"{name}.jsonl"
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(json.loads(line))
    return records


def _default_sections_for_page(*, frontmatter: dict[str, Any], parsed_sections: dict[str, str]) -> list[str]:
    page_type = str(frontmatter.get("type") or "")
    preferred = {
        "paper": ["What To Remember", "Mechanism", "Evidence Map", "Limitations / Uncertainty", "User Insights"],
        "concept": ["What It Is", "Why It Matters", "Implementation Implications", "Common Failure Modes", "Minimal Checks / Probes", "Evidence / Provenance"],
        "method": ["What It Is", "Mechanism", "Implementation Hooks", "Failure Modes", "Prerequisite Concepts", "Evidence"],
        "topic": ["Scope", "Key Papers", "Method Families", "Key Concepts", "Claims", "Retrieval Hooks"],
        "claim": ["Claim", "Supporting Evidence", "Contradicting Evidence", "Scope", "Provenance"],
        "evidence": ["Evidence Item", "Source", "Metric or Observation", "Supports", "Limits", "Reliability"],
    }.get(page_type, ["What This Page Is For", "Source Facts", "Wiki Synthesis", "Evidence Map", "Open Questions"])
    return [heading for heading in preferred if heading in parsed_sections] or list(parsed_sections.keys())[:5]


def _summarize_result(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": item.get("title"),
        "canonical_path": item.get("canonical_path") or item.get("relative_path"),
        "result_type": item.get("result_type"),
        "knowledge_role": item.get("knowledge_role"),
        "score": item.get("score"),
        "why": item.get("selection_reasons") or [],
    }


def _canonical_links(frontmatter: dict[str, Any]) -> dict[str, Any]:
    return {
        key: frontmatter.get(key)
        for key in (
            "sources",
            "source_papers",
            "related_papers",
            "related_methods",
            "related_topics",
            "related_concepts",
            "related_claims",
            "related_evidence",
            "prerequisite_for",
            "supports",
            "contradicts",
        )
        if frontmatter.get(key) not in (None, "", [])
    }


def _trim(value: str, *, max_chars: int) -> str:
    compact = re.sub(r"\n{3,}", "\n\n", value.strip())
    if len(compact) <= max_chars:
        return compact
    return compact[: max_chars - 1].rstrip() + "…"


def _slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-")
    return slug[:80] or "wiki-context"


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9./_-]+", " ", value.lower())).strip()


def missing_workspace_error_payload() -> dict[str, Any]:
    return {
        "status": "error",
        "error_code": "needs_init",
        "message": NEEDS_INIT_MESSAGE,
        "next_action": NEEDS_INIT_NEXT_ACTION,
    }


def call_chain_error_payload(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, FileNotFoundError) and NEEDS_INIT_MESSAGE in str(exc):
        return missing_workspace_error_payload()
    if isinstance(exc, PermissionError):
        filename = getattr(exc, "filename", None)
        return {
            "status": "error",
            "error_code": "workspace_index_write_failed",
            "message": "Meridian could not refresh the Paper Wiki index.",
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
