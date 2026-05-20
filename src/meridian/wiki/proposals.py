from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.vault import append_wiki_log, init_wiki_vault, slugify


@dataclass(frozen=True)
class QueryWritebackProposalResult:
    proposal_dir: Path
    proposal_path: Path
    manifest_path: Path
    log_path: Path | None


def propose_query_writeback(
    *,
    wiki_root: Path,
    query: str,
    context_path: Path,
    title: str,
    proposal_type: str = "synthesis",
    body_path: Path | None = None,
    out_dir: Path | None = None,
    notes: str = "",
    overwrite: bool = False,
    update_log: bool = True,
) -> QueryWritebackProposalResult:
    if proposal_type not in {"synthesis", "comparison", "decision", "idea"}:
        raise ValueError("proposal_type must be synthesis, comparison, decision, or idea")
    if not query.strip():
        raise ValueError("query must not be empty")
    if not title.strip():
        raise ValueError("title must not be empty")
    if not context_path.exists():
        raise FileNotFoundError(f"context JSON does not exist: {context_path}")

    init_wiki_vault(wiki_root=wiki_root)
    context = json.loads(context_path.read_text(encoding="utf-8"))
    proposal_dir = out_dir or wiki_root / ".drafts/proposals" / slugify(title)
    if proposal_dir.exists() and any(proposal_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"proposal directory already exists: {proposal_dir}")
    proposal_dir.mkdir(parents=True, exist_ok=True)

    body = body_path.read_text(encoding="utf-8").strip() if body_path else ""
    created_at = datetime.now(timezone.utc).isoformat()
    proposal_path = proposal_dir / "proposal.md"
    manifest_path = proposal_dir / "proposal.json"
    sources = _sources_from_context(context)
    proposal_path.write_text(
        _render_proposal(
            title=title,
            proposal_type=proposal_type,
            query=query,
            context_path=context_path,
            context=context,
            body=body,
            notes=notes,
            created_at=created_at,
            sources=sources,
        ),
        encoding="utf-8",
    )
    manifest = {
        "schema_version": "meridian.query_writeback_proposal.v0",
        "created_at": created_at,
        "wiki_root": str(wiki_root),
        "proposal_type": proposal_type,
        "title": title,
        "query": query,
        "context_path": str(context_path),
        "proposal_path": str(proposal_path),
        "sources": sources,
        "status": "draft",
        "publish_policy": "proposal_only",
        "separation_contract": {
            "source_facts": "Must cite retrieved wiki pages or source artifacts.",
            "wiki_synthesis": "May infer relationships, but must remain marked as synthesis until reviewed.",
            "user_ideas": "Must not be attributed to paper authors or source facts.",
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log_path = None
    if update_log:
        log_path = append_wiki_log(
            wiki_root=wiki_root,
            action="query",
            title=title,
            lines=[
                f"Draft write-back proposal: `{proposal_path.relative_to(wiki_root)}`",
                f"Query: {query}",
                "Canonical wiki pages were not changed by this proposal.",
            ],
        )
    return QueryWritebackProposalResult(
        proposal_dir=proposal_dir,
        proposal_path=proposal_path,
        manifest_path=manifest_path,
        log_path=log_path,
    )


def _sources_from_context(context: dict[str, Any]) -> list[dict[str, Any]]:
    sources = []
    for result in context.get("results") or []:
        relative_path = str(result.get("relative_path") or "")
        title = str(result.get("title") or relative_path)
        if not relative_path:
            continue
        sources.append(
            {
                "title": title,
                "relative_path": relative_path,
                "page_id": result.get("page_id"),
                "review_state": result.get("review_state"),
                "quality_gate": result.get("quality_gate"),
                "confidence": result.get("confidence"),
                "matched_sections": [item.get("heading") for item in result.get("matched_sections") or []],
            }
        )
    return sources


def _render_proposal(
    *,
    title: str,
    proposal_type: str,
    query: str,
    context_path: Path,
    context: dict[str, Any],
    body: str,
    notes: str,
    created_at: str,
    sources: list[dict[str, Any]],
) -> str:
    frontmatter = [
        "---",
        'type: "wiki_update_proposal"',
        f'proposal_type: "{_escape(proposal_type)}"',
        f'title: "{_escape(title)}"',
        'status: "draft"',
        f'created: "{created_at[:10]}"',
        f'updated: "{created_at[:10]}"',
        f'query: "{_escape(query)}"',
        f'context_packet: "{_escape(str(context_path))}"',
        "sources:",
        *[f'  - "[[{Path(source["relative_path"]).with_suffix("").as_posix()}|{_escape(source["title"])}]]"' for source in sources],
        'confidence: "low"',
        'review_state: "proposal"',
        "---",
    ]
    source_lines = []
    for source in sources:
        link = f"[[{Path(source['relative_path']).with_suffix('').as_posix()}|{source['title']}]]"
        matched = ", ".join(str(item) for item in source.get("matched_sections") or [] if item) or "inspect page"
        source_lines.append(
            f"- {link} - review_state: `{source.get('review_state')}`; quality_gate: `{source.get('quality_gate')}`; read first: {matched}"
        )
    if not source_lines:
        source_lines.append("- No retrieved wiki pages were available; do not publish synthesis until retrieval is fixed.")

    synthesis_body = body or (
        "Draft the synthesis here after reading the retrieved pages. Keep source facts, wiki synthesis, "
        "and user ideas in their separate sections below."
    )
    return "\n".join(
        frontmatter
        + [
            f"# {title}",
            "",
            "## Query",
            "",
            query,
            "",
            "## Retrieved Context",
            "",
            *source_lines,
            "",
            "## Source Facts To Preserve",
            "",
            "- Add only facts that are directly supported by retrieved pages or source artifacts.",
            "",
            "## Wiki Synthesis Draft",
            "",
            synthesis_body,
            "",
            "## User Ideas / Decisions",
            "",
            notes or "- No user-specific idea or decision has been recorded for this proposal.",
            "",
            "## Uncertainty / Gaps",
            "",
            "- Verify every source-fact claim before canonical publish.",
            "- Keep weak retrieval results as retrieval gaps, not as scientific conclusions.",
            "",
            "## Publish Proposal",
            "",
            "- Suggested destination: `wiki/syntheses/` for synthesis/comparison, or `wiki/decisions/` if a reviewed decision page is introduced later.",
            "- Required before publish: inspect retrieved pages, fill source facts with provenance, and decide whether the synthesis should update topic/method pages.",
            "",
            "## Retrieval Context JSON Summary",
            "",
            "```json",
            json.dumps(
                {
                    "query": context.get("query"),
                    "result_count": len(context.get("results") or []),
                    "results": [
                        {
                            "title": item.get("title"),
                            "relative_path": item.get("relative_path"),
                            "matched_frontmatter": item.get("matched_frontmatter"),
                        }
                        for item in context.get("results") or []
                    ],
                },
                indent=2,
                ensure_ascii=False,
            ),
            "```",
        ]
    ).rstrip() + "\n"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
