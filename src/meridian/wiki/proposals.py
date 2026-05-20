from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.corpus import build_synthesis_catalog, parse_frontmatter, split_sections, strip_frontmatter
from meridian.wiki.vault import append_wiki_log, init_wiki_vault, rebuild_wiki_index, slugify


PROPOSAL_SCHEMA_VERSION = "meridian.query_writeback_proposal.v1"
PROPOSAL_LINT_SCHEMA_VERSION = "meridian.query_writeback_proposal_lint.v1"
PUBLISH_SCHEMA_VERSION = "meridian.query_writeback_publish.v1"
ALLOWED_PROPOSAL_TYPES = {"synthesis", "comparison", "method-family", "decision", "research-question"}
REQUIRED_FRONTMATTER_FIELDS = (
    "type",
    "title",
    "status",
    "created",
    "updated",
    "proposal_id",
    "query",
    "source_papers",
    "source_sections",
    "source_context",
    "user_inputs",
    "confidence",
    "review_state",
    "tags",
    "aliases",
    "topics",
    "methods",
    "related",
)
REQUIRED_BODY_SECTIONS = (
    "What This Page Is For",
    "Source Facts",
    "Wiki Synthesis",
    "User Ideas / Decisions",
    "Evidence Map",
    "Open Questions",
    "Retrieval Hooks",
    "Publish / Review Notes",
)


@dataclass(frozen=True)
class QueryWritebackProposalResult:
    proposal_dir: Path
    proposal_path: Path
    manifest_path: Path
    source_context_path: Path
    publish_plan_path: Path
    log_path: Path | None


@dataclass(frozen=True)
class ProposalLintResult:
    report_path: Path
    status: str
    findings: list[dict[str, Any]]


@dataclass(frozen=True)
class PublishProposalResult:
    page_path: Path
    catalog_path: Path
    lint_report_path: Path
    log_path: Path


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
    user_note: str = "",
    user_note_path: Path | None = None,
    overwrite: bool = False,
    update_log: bool = True,
) -> QueryWritebackProposalResult:
    normalized_type = _normalize_proposal_type(proposal_type)
    if not query.strip():
        raise ValueError("query must not be empty")
    if not title.strip():
        raise ValueError("title must not be empty")
    if not context_path.exists():
        raise FileNotFoundError(f"context JSON does not exist: {context_path}")
    if user_note_path is not None and not user_note_path.exists():
        raise FileNotFoundError(f"user note file does not exist: {user_note_path}")

    init_wiki_vault(wiki_root=wiki_root)
    context = json.loads(context_path.read_text(encoding="utf-8"))
    proposal_id = slugify(title)
    proposal_dir = out_dir or wiki_root / ".drafts/proposals" / proposal_id
    if proposal_dir.exists() and any(proposal_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"proposal directory already exists: {proposal_dir}")
    proposal_dir.mkdir(parents=True, exist_ok=True)

    body = body_path.read_text(encoding="utf-8").strip() if body_path else ""
    combined_note = _combined_user_note(notes=notes, user_note=user_note, user_note_path=user_note_path)
    created_at = datetime.now(timezone.utc).isoformat()
    created_date = created_at[:10]
    sources = _sources_from_context(context, wiki_root=wiki_root)
    source_sections = _source_sections(sources)
    source_context_path = proposal_dir / "source_context.json"
    proposal_path = proposal_dir / "proposal.md"
    manifest_path = proposal_dir / "proposal.json"
    publish_plan_path = proposal_dir / "publish_plan.md"
    target_path = wiki_root / "syntheses" / f"{proposal_id}.md"
    source_context = {
        "schema_version": "meridian.query_writeback_source_context.v1",
        "created_at": created_at,
        "query": query,
        "context_path": str(context_path),
        "results": sources,
    }
    source_context_path.write_text(json.dumps(source_context, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    proposal_path.write_text(
        _render_proposal(
            title=title,
            proposal_id=proposal_id,
            proposal_type=normalized_type,
            query=query,
            context_path=context_path,
            source_context_path=source_context_path,
            body=body,
            user_note=combined_note,
            created_date=created_date,
            sources=sources,
            source_sections=source_sections,
            target_path=target_path,
            wiki_root=wiki_root,
        ),
        encoding="utf-8",
    )
    manifest = {
        "schema_version": PROPOSAL_SCHEMA_VERSION,
        "created_at": created_at,
        "updated_at": created_at,
        "proposal_id": proposal_id,
        "wiki_root": str(wiki_root),
        "proposal_type": normalized_type,
        "title": title,
        "query": query,
        "context_path": str(context_path),
        "source_context_path": str(source_context_path),
        "proposal_path": str(proposal_path),
        "publish_plan_path": str(publish_plan_path),
        "publish_target": str(target_path),
        "sources": sources,
        "source_sections": source_sections,
        "user_inputs": _user_inputs(combined_note),
        "status": "draft",
        "publish_policy": "proposal_then_lint_then_publish",
        "separation_contract": {
            "source_facts": "Only directly supported claims from retrieved pages or source artifacts.",
            "wiki_synthesis": "Inferences across pages must stay marked as synthesis until reviewed.",
            "user_ideas": "User notes and decisions must not be attributed to paper authors or source facts.",
            "uncertainty": "Unknowns and weak retrieval should stay explicit rather than becoming conclusions.",
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    publish_plan_path.write_text(
        _render_publish_plan(manifest=manifest, sources=sources, wiki_root=wiki_root),
        encoding="utf-8",
    )
    log_path = None
    if update_log:
        log_path = append_wiki_log(
            wiki_root=wiki_root,
            action="query",
            title=title,
            lines=[
                f"Draft write-back proposal: `{proposal_path.relative_to(wiki_root)}`",
                f"Proposal type: `{normalized_type}`",
                f"Query: {query}",
                "Canonical wiki pages were not changed by this proposal.",
            ],
        )
    return QueryWritebackProposalResult(
        proposal_dir=proposal_dir,
        proposal_path=proposal_path,
        manifest_path=manifest_path,
        source_context_path=source_context_path,
        publish_plan_path=publish_plan_path,
        log_path=log_path,
    )


def lint_query_writeback_proposal(
    *,
    proposal_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
    overwrite: bool = False,
) -> ProposalLintResult:
    manifest = _load_manifest(proposal_manifest)
    findings: list[dict[str, Any]] = []
    if manifest.get("schema_version") != PROPOSAL_SCHEMA_VERSION:
        findings.append(_finding("error", "schema_version", "proposal manifest is not a v1 write-back proposal"))

    proposal_path = _resolve_path(manifest.get("proposal_path"), base=proposal_manifest.parent)
    source_context_path = _resolve_path(manifest.get("source_context_path"), base=proposal_manifest.parent)
    publish_plan_path = _resolve_path(manifest.get("publish_plan_path"), base=proposal_manifest.parent)
    target_path = _resolve_path(manifest.get("publish_target"), base=wiki_root)
    context_path = _resolve_path(manifest.get("context_path"), base=proposal_manifest.parent)

    for label, path in (
        ("proposal_path", proposal_path),
        ("source_context_path", source_context_path),
        ("publish_plan_path", publish_plan_path),
        ("context_path", context_path),
    ):
        if path is None or not path.exists():
            findings.append(_finding("error", "missing_artifact", f"{label} does not exist", path=str(path) if path else None))

    frontmatter: dict[str, Any] = {}
    sections: dict[str, str] = {}
    if proposal_path is not None and proposal_path.exists():
        text = proposal_path.read_text(encoding="utf-8")
        frontmatter = parse_frontmatter(text)
        sections = split_sections(strip_frontmatter(text))
        for field in REQUIRED_FRONTMATTER_FIELDS:
            if field not in frontmatter:
                findings.append(_finding("error", "missing_frontmatter_field", f"frontmatter missing `{field}`", path=str(proposal_path)))
        for section in REQUIRED_BODY_SECTIONS:
            if section not in sections:
                findings.append(_finding("error", "missing_required_section", f"proposal missing section `{section}`", path=str(proposal_path)))

    if target_path is None:
        findings.append(_finding("error", "missing_publish_target", "proposal manifest has no publish target"))
    elif target_path.exists() and not overwrite:
        findings.append(_finding("error", "publish_target_exists", f"publish target already exists: {target_path}", path=str(target_path)))

    sources = list(manifest.get("sources") or [])
    if not sources:
        findings.append(_finding("error", "insufficient_provenance", "proposal has no retrieved sources"))
    for source in sources:
        relative_path = str(source.get("relative_path") or "")
        if not relative_path:
            findings.append(_finding("error", "insufficient_provenance", "source entry has no relative path"))
            continue
        page_path = wiki_root / relative_path
        if not page_path.exists():
            findings.append(_finding("error", "missing_source_page", f"referenced source page is missing: {relative_path}", path=relative_path))
        if not source.get("matched_sections"):
            findings.append(_finding("warn", "weak_provenance", f"source has no matched sections: {relative_path}", path=relative_path))

    if _has_source_quality_hold(sources):
        source_facts = sections.get("Source Facts", "")
        evidence_map = sections.get("Evidence Map", "")
        warning_text = _norm(f"{source_facts}\n{evidence_map}")
        if "not scientific evidence" not in warning_text or "cleanup" not in warning_text:
            findings.append(
                _finding(
                    "error",
                    "source_quality_as_scientific_evidence",
                    "source-quality hold sources must be marked as cleanup/provenance only, not scientific evidence",
                )
            )

    if frontmatter and manifest.get("proposal_id") and frontmatter.get("proposal_id") != manifest.get("proposal_id"):
        findings.append(_finding("error", "proposal_id_mismatch", "frontmatter proposal_id does not match manifest"))
    if manifest.get("proposal_type") not in ALLOWED_PROPOSAL_TYPES:
        findings.append(_finding("error", "invalid_proposal_type", "proposal_type is not allowed"))

    status = "fail" if any(item["severity"] == "error" for item in findings) else "pass"
    payload = {
        "schema_version": PROPOSAL_LINT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "wiki_root": str(wiki_root),
        "proposal_manifest": str(proposal_manifest),
        "status": status,
        "findings": findings,
    }
    report_path = out_path or proposal_manifest.parent / "proposal-lint.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return ProposalLintResult(report_path=report_path, status=status, findings=findings)


def publish_query_writeback_proposal(
    *,
    proposal_manifest: Path,
    wiki_root: Path,
    overwrite: bool = False,
) -> PublishProposalResult:
    lint_result = lint_query_writeback_proposal(
        proposal_manifest=proposal_manifest,
        wiki_root=wiki_root,
        overwrite=overwrite,
    )
    if lint_result.status != "pass":
        raise ValueError(f"proposal lint failed: {lint_result.report_path}")
    manifest = _load_manifest(proposal_manifest)
    proposal_path = _resolve_path(manifest.get("proposal_path"), base=proposal_manifest.parent)
    target_path = _resolve_path(manifest.get("publish_target"), base=wiki_root)
    if proposal_path is None or target_path is None:
        raise ValueError("proposal manifest is missing proposal_path or publish_target")
    if target_path.exists() and not overwrite:
        raise FileExistsError(f"publish target already exists: {target_path}")

    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(
        _render_canonical_page(
            proposal_text=proposal_path.read_text(encoding="utf-8"),
            manifest=manifest,
            wiki_root=wiki_root,
        ),
        encoding="utf-8",
    )
    index_path = rebuild_wiki_index(wiki_root=wiki_root)
    catalog = build_synthesis_catalog(wiki_root=wiki_root)
    log_path = append_wiki_log(
        wiki_root=wiki_root,
        action="publish",
        title=str(manifest.get("title") or target_path.stem),
        lines=[
            f"Published write-back proposal: `{target_path.relative_to(wiki_root)}`",
            f"Proposal manifest: `{proposal_manifest.relative_to(wiki_root) if proposal_manifest.is_relative_to(wiki_root) else proposal_manifest}`",
            f"Updated index: `{index_path.relative_to(wiki_root)}`",
            f"Updated synthesis catalog: `{catalog.catalog_path.relative_to(wiki_root)}`",
        ],
    )
    publish_manifest = {
        "schema_version": PUBLISH_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "proposal_manifest": str(proposal_manifest),
        "page_path": str(target_path),
        "catalog_path": str(catalog.catalog_path),
        "lint_report_path": str(lint_result.report_path),
        "log_path": str(log_path),
        "status": "published",
    }
    (proposal_manifest.parent / "publish-result.json").write_text(
        json.dumps(publish_manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return PublishProposalResult(
        page_path=target_path,
        catalog_path=catalog.catalog_path,
        lint_report_path=lint_result.report_path,
        log_path=log_path,
    )


def _sources_from_context(context: dict[str, Any], *, wiki_root: Path) -> list[dict[str, Any]]:
    sources = []
    for result in context.get("results") or []:
        relative_path = str(result.get("relative_path") or "")
        title = str(result.get("title") or relative_path)
        if not relative_path:
            continue
        page_path = wiki_root / relative_path
        page_frontmatter: dict[str, Any] = {}
        if page_path.exists():
            page_frontmatter = parse_frontmatter(page_path.read_text(encoding="utf-8"))
        source_type = str(result.get("type") or result.get("result_type") or page_frontmatter.get("type") or "paper")
        quality_gate = result.get("quality_gate") or page_frontmatter.get("quality_gate")
        review_state = result.get("review_state") or page_frontmatter.get("review_state")
        confidence = result.get("confidence") or page_frontmatter.get("confidence")
        source_quality = _source_quality_state(
            quality_gate=quality_gate,
            review_state=review_state,
            confidence=confidence,
            frontmatter=page_frontmatter,
        )
        sources.append(
            {
                "title": title,
                "relative_path": relative_path,
                "page_id": result.get("page_id") or Path(relative_path).with_suffix("").as_posix(),
                "result_type": source_type,
                "review_state": review_state,
                "quality_gate": quality_gate,
                "confidence": confidence,
                "source_quality_state": source_quality,
                "matched_sections": [
                    {
                        "heading": item.get("heading"),
                        "score": item.get("score"),
                        "snippet": item.get("snippet"),
                    }
                    for item in result.get("matched_sections") or []
                ],
                "matched_frontmatter": result.get("matched_frontmatter") or {},
                "selection_reasons": result.get("selection_reasons") or [],
            }
        )
    return sources


def _render_proposal(
    *,
    title: str,
    proposal_id: str,
    proposal_type: str,
    query: str,
    context_path: Path,
    source_context_path: Path,
    body: str,
    user_note: str,
    created_date: str,
    sources: list[dict[str, Any]],
    source_sections: list[str],
    target_path: Path,
    wiki_root: Path,
) -> str:
    source_papers = [source["page_id"] for source in sources]
    topics = _routing_values(sources, "topics")[:12]
    methods = _routing_values(sources, "methods")[:12]
    related = _dedupe([source["page_id"] for source in sources])[:12]
    aliases = _dedupe([title, query])[:4]
    frontmatter = [
        "---",
        f'type: "{_escape(proposal_type)}"',
        f'title: "{_escape(title)}"',
        'status: "draft"',
        f'created: "{created_date}"',
        f'updated: "{created_date}"',
        f'proposal_id: "{_escape(proposal_id)}"',
        f'query: "{_escape(query)}"',
        "source_papers:",
        *_yaml_list(source_papers),
        "source_sections:",
        *_yaml_list(source_sections),
        f'source_context: "{_escape(_relative_or_absolute(source_context_path, wiki_root))}"',
        "user_inputs:",
        *_yaml_list(_user_inputs(user_note)),
        'confidence: "low"',
        'review_state: "proposal"',
        "tags:",
        *_yaml_list(["paper-wiki/proposal", f"paper-wiki/{proposal_type}"]),
        "aliases:",
        *_yaml_list(aliases),
        "topics:",
        *_yaml_list(topics),
        "methods:",
        *_yaml_list(methods),
        "related:",
        *_yaml_list(related),
        "---",
    ]
    source_lines = _source_fact_lines(sources)
    retrieval_hooks = _retrieval_hooks(query=query, title=title, topics=topics, methods=methods)
    synthesis_body = body or "- Draft synthesis placeholder: write cross-paper interpretation here after checking the source facts above."
    return "\n".join(
        frontmatter
        + [
            f"# {title}",
            "",
            "## What This Page Is For",
            "",
            f"- Proposal type: `{proposal_type}`.",
            f"- Original research query: {query}",
            f"- Publish target after review: `{_relative_or_absolute(target_path, wiki_root)}`.",
            "- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.",
            "",
            "## Source Facts",
            "",
            *source_lines,
            "",
            "## Wiki Synthesis",
            "",
            synthesis_body,
            "",
            "## User Ideas / Decisions",
            "",
            user_note or "- No user-specific idea or decision has been recorded for this proposal.",
            "",
            "## Evidence Map",
            "",
            *_evidence_map_lines(sources),
            "",
            "## Open Questions",
            "",
            "- Which source facts are strong enough to preserve as canonical synthesis?",
            "- Which retrieved pages are adjacent context rather than direct evidence?",
            "- What should be checked against raw PDFs or user annotations before using this in a research decision?",
            "",
            "## Retrieval Hooks",
            "",
            *retrieval_hooks,
            "",
            "## Publish / Review Notes",
            "",
            "- Run `meridian wiki proposal-lint` before publishing.",
            "- Keep source facts, wiki synthesis, and user ideas separated during review.",
            "- Do not promote source-quality holds as scientific evidence.",
        ]
    ).rstrip() + "\n"


def _render_publish_plan(*, manifest: dict[str, Any], sources: list[dict[str, Any]], wiki_root: Path) -> str:
    target = Path(str(manifest["publish_target"]))
    lines = [
        f"# Publish Plan: {manifest['title']}",
        "",
        f"- Proposal id: `{manifest['proposal_id']}`",
        f"- Proposal type: `{manifest['proposal_type']}`",
        f"- Target: `{_relative_or_absolute(target, wiki_root)}`",
        "- Required command: `meridian wiki proposal-lint <proposal.json> --wiki-root wiki`",
        "- Publish command: `meridian wiki publish-proposal <proposal.json> --wiki-root wiki`",
        "",
        "## Source Handling",
        "",
    ]
    for source in sources:
        quality = source.get("source_quality_state")
        lines.append(f"- [[{Path(source['relative_path']).with_suffix('').as_posix()}|{source['title']}]] - `{quality}`")
    if _has_source_quality_hold(sources):
        lines.extend(
            [
                "",
                "## Source-Quality Guard",
                "",
                "- At least one source is a quality hold. It can only support cleanup/provenance notes, not scientific evidence.",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def _render_canonical_page(*, proposal_text: str, manifest: dict[str, Any], wiki_root: Path) -> str:
    proposal_body = strip_frontmatter(proposal_text)
    proposal_sections = split_sections(proposal_body)
    created = str(manifest.get("created_at") or datetime.now(timezone.utc).isoformat())[:10]
    updated = datetime.now(timezone.utc).date().isoformat()
    sources = list(manifest.get("sources") or [])
    source_papers = [str(source.get("page_id") or Path(str(source.get("relative_path"))).with_suffix("").as_posix()) for source in sources]
    source_sections = list(manifest.get("source_sections") or _source_sections(sources))
    user_inputs = list(manifest.get("user_inputs") or [])
    proposal_type = str(manifest.get("proposal_type") or "synthesis")
    title = str(manifest.get("title") or "Untitled Synthesis")
    source_context = str(manifest.get("source_context_path") or "")
    topics = _routing_values(sources, "topics")[:12]
    methods = _routing_values(sources, "methods")[:12]
    related = _dedupe(source_papers)[:12]
    fm = [
        "---",
        f'type: "{_escape(proposal_type)}"',
        f'title: "{_escape(title)}"',
        'status: "draft"',
        f'created: "{created}"',
        f'updated: "{updated}"',
        f'proposal_id: "{_escape(str(manifest.get("proposal_id") or ""))}"',
        f'query: "{_escape(str(manifest.get("query") or ""))}"',
        "source_papers:",
        *_yaml_list(source_papers),
        "source_sections:",
        *_yaml_list(source_sections),
        f'source_context: "{_escape(_relative_or_absolute(Path(source_context), wiki_root) if source_context else "")}"',
        "user_inputs:",
        *_yaml_list(user_inputs),
        'confidence: "low"',
        'review_state: "published_proposal"',
        "tags:",
        *_yaml_list(["paper-wiki/synthesis", f"paper-wiki/{proposal_type}"]),
        "aliases:",
        *_yaml_list([title, str(manifest.get("query") or "")]),
        "topics:",
        *_yaml_list(topics),
        "methods:",
        *_yaml_list(methods),
        "related:",
        *_yaml_list(related),
        f"source_quality_risk: {str(_has_source_quality_hold(sources)).lower()}",
        "---",
        f"# {title}",
        "",
    ]
    body_lines = []
    for section in REQUIRED_BODY_SECTIONS:
        body_lines.extend([f"## {section}", ""])
        body_lines.append(proposal_sections.get(section, "").strip() or "- Empty in proposal; fill during review.")
        body_lines.append("")
    body_lines.extend(["## Source Links", ""])
    for source in sources:
        body_lines.append(f"- [[{Path(source['relative_path']).with_suffix('').as_posix()}|{source['title']}]]")
    if not sources:
        body_lines.append("- No source links recorded.")
    return "\n".join(fm + body_lines).rstrip() + "\n"


def _source_fact_lines(sources: list[dict[str, Any]]) -> list[str]:
    lines = []
    for source in sources:
        link = f"[[{Path(source['relative_path']).with_suffix('').as_posix()}|{source['title']}]]"
        quality = str(source.get("source_quality_state") or "unknown")
        if quality == "hold":
            lines.append(f"- {link}: source-quality hold; use only for cleanup/provenance. It is not scientific evidence.")
        else:
            lines.append(f"- {link}: retrieved source page; extract only directly supported facts with page/section provenance.")
        for matched in source.get("matched_sections") or []:
            heading = matched.get("heading")
            snippet = str(matched.get("snippet") or "").strip()
            if heading:
                lines.append(f"  - `{heading}`: {snippet or 'inspect section before using as evidence'}")
    if not lines:
        return ["- No retrieved wiki pages were available; do not publish synthesis until retrieval is fixed."]
    return lines


def _evidence_map_lines(sources: list[dict[str, Any]]) -> list[str]:
    lines = []
    for source in sources:
        link = f"[[{Path(source['relative_path']).with_suffix('').as_posix()}|{source['title']}]]"
        if source.get("source_quality_state") == "hold":
            lines.append(f"- {link}: cleanup/provenance only; not scientific evidence.")
            continue
        matched = [str(item.get("heading")) for item in source.get("matched_sections") or [] if item.get("heading")]
        lines.append(f"- {link}: candidate evidence sections: {', '.join(matched) if matched else 'needs manual section selection'}.")
    return lines or ["- No evidence candidates yet."]


def _retrieval_hooks(*, query: str, title: str, topics: list[str], methods: list[str]) -> list[str]:
    hooks = [
        f'- Query: "{query}"',
        f'  Use because: It is the original research intent that produced `{title}`.',
    ]
    if methods:
        hooks.extend(
            [
                f'- Query: "I need a cross-paper synthesis around {methods[0]} and its implementation or evidence boundaries."',
                "  Use because: This page links retrieved papers, mechanism notes, and open checks.",
            ]
        )
    if topics:
        hooks.extend(
            [
                f'- Query: "I am mapping papers related to {topics[0]} and need a higher-level summary rather than a single paper."',
                "  Use because: This page is a synthesis artifact with source links and uncertainty notes.",
            ]
        )
    return hooks


def _source_sections(sources: list[dict[str, Any]]) -> list[str]:
    sections = []
    for source in sources:
        page_id = str(source.get("page_id") or Path(str(source.get("relative_path"))).with_suffix("").as_posix())
        for item in source.get("matched_sections") or []:
            heading = item.get("heading")
            if heading:
                sections.append(f"{page_id}#{heading}")
    return _dedupe(sections)


def _routing_values(sources: list[dict[str, Any]], field: str) -> list[str]:
    values = []
    for source in sources:
        frontmatter = source.get("matched_frontmatter") or {}
        for value in frontmatter.get(field) or []:
            values.append(str(value))
    return _dedupe(values)


def _normalize_proposal_type(value: str) -> str:
    normalized = value.strip().lower().replace("_", "-")
    if normalized == "idea":
        normalized = "research-question"
    if normalized not in ALLOWED_PROPOSAL_TYPES:
        allowed = ", ".join(sorted(ALLOWED_PROPOSAL_TYPES))
        raise ValueError(f"proposal_type must be one of: {allowed}")
    return normalized


def _combined_user_note(*, notes: str, user_note: str, user_note_path: Path | None) -> str:
    chunks = []
    if notes.strip():
        chunks.append(notes.strip())
    if user_note.strip():
        chunks.append(user_note.strip())
    if user_note_path is not None:
        chunks.append(user_note_path.read_text(encoding="utf-8").strip())
    return "\n\n".join(chunk for chunk in chunks if chunk)


def _user_inputs(note: str) -> list[str]:
    return ["inline_user_note"] if note.strip() else []


def _source_quality_state(
    *,
    quality_gate: Any,
    review_state: Any,
    confidence: Any,
    frontmatter: dict[str, Any],
) -> str:
    fields = " ".join(
        str(value or "").lower()
        for value in (
            quality_gate,
            review_state,
            frontmatter.get("source_quality_risk"),
            frontmatter.get("status"),
        )
    )
    if any(token in fields for token in ("hold", "fail", "source_quality", "source-quality")):
        return "hold"
    return "usable"


def _has_source_quality_hold(sources: list[dict[str, Any]]) -> bool:
    return any(str(source.get("source_quality_state") or "").lower() == "hold" for source in sources)


def _load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"proposal manifest does not exist: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _resolve_path(value: Any, *, base: Path) -> Path | None:
    if not value:
        return None
    path = Path(str(value))
    if path.is_absolute():
        return path
    return base / path


def _relative_or_absolute(path: Path, wiki_root: Path) -> str:
    try:
        return path.relative_to(wiki_root).as_posix()
    except ValueError:
        return str(path)


def _yaml_list(values: list[str]) -> list[str]:
    if not values:
        return []
    return [f'  - "{_escape(str(value))}"' for value in values if str(value).strip()]


def _dedupe(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        normalized = value.strip()
        key = normalized.lower()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _finding(severity: str, code: str, message: str, *, path: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"severity": severity, "code": code, "message": message}
    if path is not None:
        payload["path"] = path
    return payload


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
