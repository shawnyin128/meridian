from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.corpus import (
    build_paper_catalog,
    build_synthesis_catalog,
    parse_frontmatter,
    retrieve_papers,
    split_sections,
    strip_frontmatter,
)
from meridian.wiki.vault import append_wiki_log, init_wiki_vault, rebuild_wiki_index, slugify


REFINEMENT_SCHEMA_VERSION = "meridian.wiki_refinement.v1"
REFINEMENT_LINT_SCHEMA_VERSION = "meridian.wiki_refinement_lint.v1"
REFINEMENT_PUBLISH_SCHEMA_VERSION = "meridian.wiki_refinement_publish.v1"

ALLOWED_REFINEMENT_TYPES = {
    "paper-refinement",
    "synthesis-refinement",
    "method-refinement",
    "topic-refinement",
    "claim-refinement",
    "evidence-refinement",
}
ALLOWED_CHANGE_CLASSES = {
    "source_fact_correction",
    "wiki_synthesis_update",
    "user_insight_integration",
    "retrieval_metadata_update",
    "structure_cleanup",
    "stale_claim_update",
    "crosslink_update",
    "decision_update",
}
CANONICAL_DIRS = {"papers", "syntheses", "methods", "topics", "claims", "evidence"}


@dataclass(frozen=True)
class RefinementDraftResult:
    status: str
    refinement_dir: Path
    refinement_path: Path | None
    manifest_path: Path
    diff_path: Path | None
    source_context_path: Path
    publish_plan_path: Path | None
    target_page: Path | None
    candidate_count: int


@dataclass(frozen=True)
class RefinementLintResult:
    report_path: Path
    status: str
    findings: list[dict[str, Any]]


@dataclass(frozen=True)
class PublishRefinementResult:
    page_path: Path
    snapshot_path: Path
    catalog_path: Path
    lint_report_path: Path
    log_path: Path


def propose_refinement(
    *,
    wiki_root: Path,
    target: str,
    reason: str,
    note: str = "",
    note_file: Path | None = None,
    change_class: str = "wiki_synthesis_update",
    from_insight: str | None = None,
    out_dir: Path | None = None,
    overwrite: bool = False,
) -> RefinementDraftResult:
    init_wiki_vault(wiki_root=wiki_root)
    normalized_change = _normalize_change_class(change_class)
    raw_note = _combined_note(note=note, note_file=note_file)
    if not reason.strip():
        raise ValueError("refinement reason must not be empty")
    if not raw_note.strip() and not from_insight:
        raise ValueError("refinement note or --from-insight must not be empty")

    match = match_target_page(wiki_root=wiki_root, query=target)
    created_at = datetime.now(timezone.utc).isoformat()
    base_slug = slugify(f"{target}-{normalized_change}-{_short_hash(reason + raw_note + str(from_insight or ''))}")
    refinement_dir = out_dir or wiki_root / ".drafts/refinements" / base_slug
    if refinement_dir.exists() and any(refinement_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"refinement directory already exists: {refinement_dir}")
    refinement_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = refinement_dir / "refinement.json"
    refinement_path = refinement_dir / "refinement.md"
    diff_path = refinement_dir / "diff.md"
    source_context_path = refinement_dir / "source_context.json"
    publish_plan_path = refinement_dir / "publish_plan.md"
    source_context_path.write_text(json.dumps(match, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if match["status"] != "matched":
        manifest = {
            "schema_version": REFINEMENT_SCHEMA_VERSION,
            "created_at": created_at,
            "updated_at": created_at,
            "status": match["status"],
            "publish_state": "blocked_disambiguation" if match["status"] == "ambiguous" else "blocked_no_match",
            "target_query": target,
            "reason": reason,
            "user_note_raw": raw_note,
            "change_class": normalized_change,
            "source_context_path": str(source_context_path),
            "candidates": match.get("candidates") or [],
        }
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        refinement_path.write_text(_render_disambiguation(manifest=manifest, match=match), encoding="utf-8")
        return RefinementDraftResult(
            status=match["status"],
            refinement_dir=refinement_dir,
            refinement_path=refinement_path,
            manifest_path=manifest_path,
            diff_path=None,
            source_context_path=source_context_path,
            publish_plan_path=None,
            target_page=None,
            candidate_count=len(match.get("candidates") or []),
        )

    target_info = dict(match["target"])
    target_page = wiki_root / str(target_info["relative_path"])
    target_text = target_page.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(target_text)
    body_sections = split_sections(strip_frontmatter(target_text))
    target_revision_before = _current_revision_id(target_text, frontmatter)
    insight_context = _find_insight_context(target_text, from_insight) if from_insight else None
    effective_note = _dedupe_note_parts([raw_note, str((insight_context or {}).get("summary") or "")])
    affected_sections = _affected_sections(reason=reason, note=effective_note, change_class=normalized_change, sections=body_sections)
    source_recheck_required = _source_recheck_required(normalized_change, reason, effective_note)
    refinement_id = f"refinement-{created_at[:10]}-{_short_hash(str(target_info.get('page_id')) + reason + effective_note)}"
    proposed_changes = [
        {
            "operation": "append_evolution_note",
            "section": "Evolution Notes",
            "affected_sections": affected_sections,
            "change_class": normalized_change,
            "proposed_update": _normalize_proposed_update(effective_note or reason),
            "boundary": _change_boundary(normalized_change, source_recheck_required),
            "provenance": _provenance_summary(from_insight=from_insight, target_info=target_info),
        }
    ]
    source_context = {
        "schema_version": "meridian.wiki_refinement_source_context.v1",
        "created_at": created_at,
        "target": target_info,
        "target_revision_before": target_revision_before,
        "frontmatter": frontmatter,
        "relevant_sections": {section: body_sections.get(section, "") for section in affected_sections if section in body_sections},
        "from_insight": insight_context,
    }
    source_context_path.write_text(json.dumps(source_context, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest = {
        "schema_version": REFINEMENT_SCHEMA_VERSION,
        "created_at": created_at,
        "updated_at": created_at,
        "status": "draft",
        "publish_state": "draft",
        "refinement_id": refinement_id,
        "refinement_type": _refinement_type_for_target(str(target_info.get("type") or target_info.get("directory") or "")),
        "target_query": target,
        "target_page": target_info["relative_path"],
        "target_title": target_info.get("title"),
        "target_type": target_info.get("type"),
        "target_revision_before": target_revision_before,
        "reason": reason,
        "user_note_raw": raw_note,
        "from_insight": from_insight,
        "proposed_changes": proposed_changes,
        "affected_sections": affected_sections,
        "change_class": normalized_change,
        "provenance_inputs": {
            "source_pages": [target_info["relative_path"]],
            "source_sections": [f"{target_info['page_id']}#{section}" for section in affected_sections if section in body_sections],
            "user_insights": [from_insight] if from_insight else [],
            "synthesis_pages": [target_info["relative_path"]] if target_info.get("type") in {"synthesis", "comparison", "method-family", "decision", "research-question"} else [],
            "retrieval_contexts": [],
        },
        "source_recheck_required": source_recheck_required,
        "confidence": "medium" if not source_recheck_required else "low",
        "source_context_path": str(source_context_path),
        "refinement_path": str(refinement_path),
        "diff_path": str(diff_path),
        "publish_plan_path": str(publish_plan_path),
        "match": match,
        "retrieval_impact": _retrieval_impact(normalized_change, affected_sections, effective_note),
        "separation_contract": {
            "source_facts": "Only update source-grounded sections after source re-check when source facts are corrected.",
            "wiki_synthesis": "Interpretive updates remain synthesis unless backed by explicit source provenance.",
            "user_insight": "User-supplied interpretation remains marked as user insight or refinement input.",
            "uncertainty": "Weak or disputed updates must remain visible as uncertainty or source re-check state.",
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    refinement_path.write_text(_render_refinement(manifest=manifest, source_context=source_context), encoding="utf-8")
    diff_path.write_text(_render_diff(manifest=manifest), encoding="utf-8")
    publish_plan_path.write_text(_render_publish_plan(manifest=manifest), encoding="utf-8")
    return RefinementDraftResult(
        status="matched",
        refinement_dir=refinement_dir,
        refinement_path=refinement_path,
        manifest_path=manifest_path,
        diff_path=diff_path,
        source_context_path=source_context_path,
        publish_plan_path=publish_plan_path,
        target_page=target_page,
        candidate_count=1,
    )


def lint_refinement(
    *,
    refinement_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
) -> RefinementLintResult:
    manifest = _load_manifest(refinement_manifest)
    findings: list[dict[str, Any]] = []
    if manifest.get("schema_version") != REFINEMENT_SCHEMA_VERSION:
        findings.append(_finding("error", "schema_version", "manifest is not a Meridian wiki refinement"))
    if manifest.get("status") != "draft":
        findings.append(_finding("error", "publish_blocked", f"refinement status blocks publish: {manifest.get('status')}"))
    if manifest.get("publish_state") != "draft":
        findings.append(_finding("error", "publish_blocked", f"publish_state blocks publish: {manifest.get('publish_state')}"))
    if manifest.get("change_class") not in ALLOWED_CHANGE_CLASSES:
        findings.append(_finding("error", "invalid_change_class", "change_class is not allowed"))
    if manifest.get("refinement_type") not in ALLOWED_REFINEMENT_TYPES:
        findings.append(_finding("error", "invalid_refinement_type", "refinement_type is not allowed"))
    target_page_value = str(manifest.get("target_page") or "")
    if not target_page_value:
        findings.append(_finding("error", "missing_target_page", "target page is missing"))
        target_page = None
    else:
        target_page = wiki_root / target_page_value
        if not target_page.exists():
            findings.append(_finding("error", "missing_target_page", f"target page does not exist: {target_page_value}", path=target_page_value))
        if _is_internal_or_noncanonical(target_page, wiki_root):
            findings.append(_finding("error", "noncanonical_target", "target must be a canonical wiki page, not a draft/version/internal artifact"))

    for label in ("refinement_path", "diff_path", "source_context_path", "publish_plan_path"):
        path = _resolve_path(manifest.get(label), base=refinement_manifest.parent)
        if path is None or not path.exists():
            findings.append(_finding("error", "missing_artifact", f"{label} does not exist", path=str(path) if path else None))

    current_sections: dict[str, str] = {}
    current_frontmatter: dict[str, Any] = {}
    if target_page is not None and target_page.exists():
        current_text = target_page.read_text(encoding="utf-8")
        current_frontmatter = parse_frontmatter(current_text)
        current_sections = split_sections(strip_frontmatter(current_text))
        current_revision = _current_revision_id(current_text, current_frontmatter)
        if str(manifest.get("target_revision_before") or "") != current_revision:
            findings.append(
                _finding(
                    "error",
                    "stale_target_revision",
                    "target page changed after refinement proposal; regenerate or rebase the refinement",
                    path=target_page_value,
                )
            )

    affected = [str(item) for item in manifest.get("affected_sections") or []]
    if not affected:
        findings.append(_finding("error", "missing_affected_sections", "affected_sections are missing"))
    allowed_new_sections = {"Evolution Notes", "User Insights", "Retrieval Hooks", "Open Questions", "Wiki Synthesis"}
    for section in affected:
        if current_sections and section not in current_sections and section not in allowed_new_sections:
            findings.append(_finding("error", "unknown_affected_section", f"affected section is not present or allowed as new section: {section}"))

    proposed_changes = list(manifest.get("proposed_changes") or [])
    if not proposed_changes:
        findings.append(_finding("error", "missing_proposed_changes", "proposed_changes are missing"))
    for change in proposed_changes:
        if not str(change.get("proposed_update") or "").strip():
            findings.append(_finding("error", "missing_proposed_update", "a proposed change has no proposed_update"))
        if not change.get("provenance"):
            findings.append(_finding("error", "missing_provenance", "a proposed change has no provenance"))

    if manifest.get("change_class") == "source_fact_correction" and manifest.get("source_recheck_required") is not True:
        findings.append(_finding("error", "source_recheck_required", "source fact correction must require source re-check"))
    if manifest.get("change_class") == "user_insight_integration":
        for change in proposed_changes:
            text = str(change.get("proposed_update") or "").lower()
            if "source fact" in text or "paper proves" in text or "authors prove" in text:
                findings.append(_finding("error", "user_insight_source_contamination", "user insight integration must not become source fact"))

    if not str(manifest.get("retrieval_impact") or "").strip():
        findings.append(_finding("error", "missing_retrieval_impact", "retrieval impact is missing"))

    provenance = dict(manifest.get("provenance_inputs") or {})
    if not any(provenance.get(key) for key in ("source_pages", "source_sections", "user_insights", "synthesis_pages", "retrieval_contexts")):
        findings.append(_finding("error", "missing_provenance_inputs", "provenance_inputs has no usable inputs"))

    source_quality_fields = " ".join(
        str(current_frontmatter.get(key) or "").lower()
        for key in ("source_quality_risk", "quality_gate", "review_state", "status")
    )
    if "hold" in source_quality_fields and manifest.get("change_class") in {"source_fact_correction", "wiki_synthesis_update"}:
        findings.append(_finding("error", "source_quality_as_scientific_evidence", "source-quality hold cannot be promoted as scientific evidence"))

    status = "fail" if any(item["severity"] == "error" for item in findings) else "pass"
    report = {
        "schema_version": REFINEMENT_LINT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "wiki_root": str(wiki_root),
        "refinement_manifest": str(refinement_manifest),
        "status": status,
        "findings": findings,
    }
    report_path = out_path or refinement_manifest.parent / "refinement-lint.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return RefinementLintResult(report_path=report_path, status=status, findings=findings)


def publish_refinement(
    *,
    refinement_manifest: Path,
    wiki_root: Path,
) -> PublishRefinementResult:
    lint = lint_refinement(refinement_manifest=refinement_manifest, wiki_root=wiki_root)
    if lint.status != "pass":
        raise ValueError(f"refinement lint failed: {lint.report_path}")
    manifest = _load_manifest(refinement_manifest)
    target_page = wiki_root / str(manifest["target_page"])
    original_text = target_page.read_text(encoding="utf-8")
    original_frontmatter = parse_frontmatter(original_text)
    snapshot_path = _write_snapshot(
        wiki_root=wiki_root,
        target_page=target_page,
        target_type=str(manifest.get("target_type") or original_frontmatter.get("type") or target_page.parent.name),
        revision_id=str(manifest.get("target_revision_before")),
        text=original_text,
    )
    updated_text = _apply_refinement_to_page(text=original_text, manifest=manifest, snapshot_path=snapshot_path, wiki_root=wiki_root)
    target_page.write_text(updated_text, encoding="utf-8")
    now = datetime.now(timezone.utc).isoformat()
    manifest["status"] = "published"
    manifest["publish_state"] = "published_to_canonical_revision"
    manifest["published_at"] = now
    manifest["updated_at"] = now
    manifest["snapshot_path"] = _relative_or_absolute(snapshot_path, wiki_root)
    refinement_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    index_path = rebuild_wiki_index(wiki_root=wiki_root)
    catalog_path = _rebuild_target_catalog(wiki_root=wiki_root, target_page=target_page)
    log_path = append_wiki_log(
        wiki_root=wiki_root,
        action="refine",
        title=str(manifest.get("target_title") or manifest.get("target_page") or "wiki refinement"),
        lines=[
            f"Published refinement `{manifest.get('refinement_id')}`.",
            f"Target page: `{manifest.get('target_page')}`",
            f"Snapshot: `{_relative_or_absolute(snapshot_path, wiki_root)}`",
            f"Change class: `{manifest.get('change_class')}`",
            f"Updated index: `{index_path.relative_to(wiki_root)}`",
            f"Updated catalog: `{catalog_path.relative_to(wiki_root)}`",
        ],
    )
    return PublishRefinementResult(
        page_path=target_page,
        snapshot_path=snapshot_path,
        catalog_path=catalog_path,
        lint_report_path=lint.report_path,
        log_path=log_path,
    )


def match_target_page(*, wiki_root: Path, query: str) -> dict[str, Any]:
    raw_query = query.strip()
    if not raw_query:
        return {"status": "no_match", "query": query, "candidates": []}
    path_match = _match_target_path(wiki_root=wiki_root, query=raw_query)
    if path_match is not None:
        return {"status": "matched", "query": query, "target": path_match, "candidates": [path_match], "match_strategy": "path"}

    records = _load_target_records(wiki_root)
    query_norm = _norm(raw_query)
    exact = [
        record
        for record in records
        if query_norm in {
            _norm(str(record.get("title") or "")),
            _norm(str(record.get("page_id") or "")),
            _norm(str(record.get("relative_path") or "")),
        }
        or query_norm in {_norm(str(alias)) for alias in (record.get("routing") or {}).get("aliases") or []}
    ]
    if len(exact) == 1:
        return {"status": "matched", "query": query, "target": _candidate(exact[0]), "candidates": [_candidate(exact[0])], "match_strategy": "exact"}
    if len(exact) > 1:
        return {"status": "ambiguous", "query": query, "candidates": [_candidate(item) for item in exact[:8]], "match_strategy": "exact"}

    retrieval = retrieve_papers(query=raw_query, wiki_root=wiki_root, catalog_records=records, top_k=5, strategy="v1").results
    candidates = [_candidate(item) for item in retrieval if float(item.get("score") or 0.0) > 0]
    if not candidates:
        return {"status": "no_match", "query": query, "candidates": [], "match_strategy": "retrieval"}
    if len(candidates) > 1 and float(candidates[1].get("score") or 0.0) >= float(candidates[0].get("score") or 0.0) * 0.85:
        return {"status": "ambiguous", "query": query, "candidates": candidates, "match_strategy": "retrieval"}
    return {"status": "matched", "query": query, "target": candidates[0], "candidates": candidates[:1], "match_strategy": "retrieval"}


def _load_target_records(wiki_root: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    paper_catalog = wiki_root / ".index/papers.jsonl"
    synthesis_catalog = wiki_root / ".index/syntheses.jsonl"
    build_paper_catalog(wiki_root=wiki_root, out_path=paper_catalog)
    build_synthesis_catalog(wiki_root=wiki_root, out_path=synthesis_catalog)
    for catalog_path in (paper_catalog, synthesis_catalog):
        if catalog_path.exists():
            with catalog_path.open("r", encoding="utf-8") as handle:
                records.extend(json.loads(line) for line in handle if line.strip())
    for directory in ("topics", "methods", "claims", "evidence"):
        for path in sorted((wiki_root / directory).glob("*.md")):
            records.append(_page_record(path, wiki_root=wiki_root))
    return records


def _page_record(path: Path, *, wiki_root: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    rel = path.relative_to(wiki_root)
    sections = split_sections(strip_frontmatter(text))
    return {
        "schema_version": "meridian.generic_page_catalog.v1",
        "page_id": rel.with_suffix("").as_posix(),
        "path": str(path),
        "relative_path": rel.as_posix(),
        "title": str(fm.get("title") or path.stem),
        "type": str(fm.get("type") or path.parent.name.rstrip("s")),
        "status": fm.get("status"),
        "review_state": fm.get("review_state"),
        "quality_gate": fm.get("quality_gate"),
        "confidence": fm.get("confidence"),
        "routing": {
            "aliases": _as_list(fm.get("aliases")),
            "topics": _as_list(fm.get("topics")),
            "methods": _as_list(fm.get("methods")),
            "settings": _as_list(fm.get("settings")),
            "datasets": _as_list(fm.get("datasets")),
            "metrics": _as_list(fm.get("metrics")),
            "models": _as_list(fm.get("models")),
            "claims": _as_list(fm.get("claims")),
        },
        "section_headings": list(sections.keys()),
        "section_previews": {heading: _preview(content, limit=700) for heading, content in sections.items()},
    }


def _match_target_path(*, wiki_root: Path, query: str) -> dict[str, Any] | None:
    path = Path(query)
    if not path.is_absolute() and not path.exists():
        path = wiki_root / path
    try:
        resolved = path.resolve()
        root = wiki_root.resolve()
        resolved.relative_to(root)
    except (ValueError, FileNotFoundError):
        return None
    if not path.exists() or path.suffix != ".md" or _is_internal_or_noncanonical(path, wiki_root):
        return None
    return _candidate(_page_record(path, wiki_root=wiki_root))


def _is_internal_or_noncanonical(path: Path, wiki_root: Path) -> bool:
    try:
        rel = path.resolve().relative_to(wiki_root.resolve())
    except ValueError:
        return True
    parts = rel.parts
    return not parts or parts[0] not in CANONICAL_DIRS or any(part in {".drafts", ".versions", ".index", "raw"} for part in parts)


def _apply_refinement_to_page(*, text: str, manifest: dict[str, Any], snapshot_path: Path, wiki_root: Path) -> str:
    frontmatter = parse_frontmatter(text)
    body = strip_frontmatter(text)
    previous_revision = str(manifest.get("target_revision_before") or _short_hash(text))
    new_revision = f"rev-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{_short_hash(previous_revision + str(manifest.get('refinement_id')))}"
    count = int(frontmatter.get("revision_count") or 0) + 1
    frontmatter["revision_id"] = new_revision
    frontmatter["revision_count"] = count
    frontmatter["previous_revision"] = previous_revision
    frontmatter["evolution_state"] = _evolution_state(manifest)
    frontmatter["last_refinement_id"] = str(manifest.get("refinement_id") or "")
    frontmatter["updated"] = datetime.now(timezone.utc).date().isoformat()
    markers = _dedupe([str(item) for item in _as_list(frontmatter.get("evolution_markers"))] + _evolution_markers(manifest))
    if markers:
        frontmatter["evolution_markers"] = markers
    note = _render_canonical_evolution_note(manifest=manifest, snapshot_path=snapshot_path, wiki_root=wiki_root)
    body = _append_to_section(body=body, heading="Evolution Notes", markdown=note)
    return _render_frontmatter(frontmatter) + "\n" + body.lstrip()


def _write_snapshot(*, wiki_root: Path, target_page: Path, target_type: str, revision_id: str, text: str) -> Path:
    directory = target_page.parent.name
    slug = target_page.stem
    safe_revision = slugify(revision_id)[:80] or "base"
    snapshot_path = wiki_root / ".versions" / directory / slug / f"{safe_revision}.md"
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(text, encoding="utf-8")
    return snapshot_path


def _append_to_section(*, body: str, heading: str, markdown: str) -> str:
    pattern = re.compile(rf"^## {re.escape(heading)}\s*$", flags=re.MULTILINE)
    match = pattern.search(body)
    if not match:
        return body.rstrip() + f"\n\n## {heading}\n\n{markdown.strip()}\n"
    next_match = re.search(r"^## .+$", body[match.end() :], flags=re.MULTILINE)
    insert_at = len(body) if next_match is None else match.end() + next_match.start()
    return body[:insert_at].rstrip() + "\n\n" + markdown.strip() + "\n\n" + body[insert_at:].lstrip()


def _render_canonical_evolution_note(*, manifest: dict[str, Any], snapshot_path: Path, wiki_root: Path) -> str:
    lines = [
        f"### {manifest.get('refinement_id')}",
        "",
        f"- Change class: `{manifest.get('change_class')}`",
        f"- Reason: {manifest.get('reason')}",
        f"- Source re-check required: `{bool(manifest.get('source_recheck_required'))}`",
        f"- Snapshot before publish: `{_relative_or_absolute(snapshot_path, wiki_root)}`",
        f"- Affected sections: {', '.join(str(item) for item in manifest.get('affected_sections') or [])}",
        f"- Retrieval impact: {manifest.get('retrieval_impact')}",
        "- Boundary: this entry records a reviewed refinement event; source facts still require source provenance.",
        "",
        "Proposed update:",
    ]
    for change in manifest.get("proposed_changes") or []:
        lines.append(f"- {change.get('proposed_update')}")
    if manifest.get("user_note_raw"):
        lines.extend(["", "User note:", f"> {str(manifest.get('user_note_raw')).replace(chr(10), ' ')}"])
    return "\n".join(lines).rstrip() + "\n"


def _render_refinement(*, manifest: dict[str, Any], source_context: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"# Refinement Proposal: {manifest.get('target_title')}",
            "",
            "## Target",
            "",
            f"- Page: `{manifest.get('target_page')}`",
            f"- Type: `{manifest.get('target_type')}`",
            f"- Revision before: `{manifest.get('target_revision_before')}`",
            "",
            "## Reason",
            "",
            str(manifest.get("reason") or ""),
            "",
            "## User / Refinement Note",
            "",
            str(manifest.get("user_note_raw") or "- No inline note; inspect `from_insight` or source context."),
            "",
            "## Current Relevant Sections",
            "",
            *[
                f"### {heading}\n\n{content or '- Empty section.'}\n"
                for heading, content in (source_context.get("relevant_sections") or {}).items()
            ],
            "## Proposed Section-Level Changes",
            "",
            *[
                f"- `{change.get('section')}` / `{change.get('change_class')}`: {change.get('proposed_update')}"
                for change in manifest.get("proposed_changes") or []
            ],
            "",
            "## Source Fact Boundary",
            "",
            _change_boundary(str(manifest.get("change_class") or ""), bool(manifest.get("source_recheck_required"))),
            "",
            "## Retrieval Impact",
            "",
            str(manifest.get("retrieval_impact") or ""),
            "",
            "## Publish Plan",
            "",
            f"- Run `meridian wiki refinement-lint {Path(str(manifest.get('refinement_path'))).with_name('refinement.json')} --wiki-root wiki`.",
            "- Publish only after lint passes.",
        ]
    ).rstrip() + "\n"


def _render_diff(*, manifest: dict[str, Any]) -> str:
    lines = [
        f"# Proposed Diff: {manifest.get('refinement_id')}",
        "",
        "This is a semantic diff, not a raw patch. The MVP publish path appends a canonical `Evolution Notes` entry and updates revision frontmatter.",
        "",
    ]
    for change in manifest.get("proposed_changes") or []:
        lines.extend(
            [
                f"## {change.get('section')}",
                "",
                f"- Operation: `{change.get('operation')}`",
                f"- Change class: `{change.get('change_class')}`",
                f"- Affected sections: {', '.join(change.get('affected_sections') or [])}",
                f"- Proposed update: {change.get('proposed_update')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def _render_publish_plan(*, manifest: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"# Publish Plan: {manifest.get('refinement_id')}",
            "",
            f"- Target: `{manifest.get('target_page')}`",
            f"- Target revision before: `{manifest.get('target_revision_before')}`",
            f"- Change class: `{manifest.get('change_class')}`",
            f"- Source re-check required: `{bool(manifest.get('source_recheck_required'))}`",
            "- Publish command: `meridian wiki publish-refinement <refinement.json> --wiki-root wiki`",
            "- Publish will create a `.versions/` snapshot before mutating the canonical page.",
        ]
    ).rstrip() + "\n"


def _render_disambiguation(*, manifest: dict[str, Any], match: dict[str, Any]) -> str:
    lines = [
        "# Refinement Target Needs Disambiguation",
        "",
        f"- Status: `{match.get('status')}`",
        f"- Query: `{manifest.get('target_query')}`",
        "- Canonical pages were not changed.",
        "",
        "## Candidates",
        "",
    ]
    for candidate in match.get("candidates") or []:
        lines.append(f"- `{candidate.get('relative_path')}` - {candidate.get('title')} (score: {candidate.get('score', 'n/a')})")
    if not match.get("candidates"):
        lines.append("- No candidates found.")
    return "\n".join(lines).rstrip() + "\n"


def _affected_sections(*, reason: str, note: str, change_class: str, sections: dict[str, str]) -> list[str]:
    text = _norm(f"{reason} {note}")
    affected: list[str] = []
    for heading in sections:
        if _norm(heading) and _norm(heading) in text:
            affected.append(heading)
    if "method" in text or "mechanism" in text:
        affected.extend(["Mechanism", "Mechanism Details To Verify"])
    if "retrieve" in text or change_class == "retrieval_metadata_update":
        affected.append("When To Retrieve This Paper")
    if "evidence" in text or "claim" in text:
        affected.append("Evidence Map")
    if "insight" in text or change_class == "user_insight_integration":
        affected.append("User Insights")
    if "synthesis" in text or change_class in {"wiki_synthesis_update", "decision_update"}:
        affected.append("Wiki Synthesis")
    if not affected:
        affected.append("Evolution Notes")
    return _dedupe([item for item in affected if item in sections or item in {"Evolution Notes", "User Insights", "When To Retrieve This Paper", "Wiki Synthesis", "Open Questions"}])


def _source_recheck_required(change_class: str, reason: str, note: str) -> bool:
    text = _norm(f"{reason} {note}")
    if change_class == "source_fact_correction":
        return True
    return any(token in text for token in ("source fact", "paper says", "authors claim", "wrong fact", "incorrect fact"))


def _normalize_proposed_update(note: str) -> str:
    cleaned = " ".join(note.split())
    return cleaned[:900] if cleaned else "Record refinement context and review the affected section."


def _change_boundary(change_class: str, source_recheck_required: bool) -> str:
    if change_class == "source_fact_correction" or source_recheck_required:
        return "This may affect source-grounded claims. Do not update Source Facts until the cited source page/PDF section has been re-checked."
    if change_class == "user_insight_integration":
        return "This integrates user-supplied interpretation. It must stay separate from paper source facts unless independently verified."
    if change_class == "decision_update":
        return "This is a user/wiki decision update, not a statement made by the paper."
    return "This is a wiki synthesis or metadata refinement. Preserve provenance and uncertainty."


def _retrieval_impact(change_class: str, affected_sections: list[str], note: str) -> str:
    if change_class == "retrieval_metadata_update" or "When To Retrieve This Paper" in affected_sections:
        return f"Future retrieval should use this refinement as an updated intent hook: {_preview(note, limit=220)}"
    if change_class == "stale_claim_update":
        return "Future retrieval should warn that the affected claim or section has stale/superseded context."
    return f"Future retrieval should expose the latest canonical revision and this evolution note when queries touch: {', '.join(affected_sections)}."


def _evolution_state(manifest: dict[str, Any]) -> str:
    change_class = str(manifest.get("change_class") or "")
    if bool(manifest.get("source_recheck_required")):
        return "needs_source_recheck"
    if change_class == "stale_claim_update":
        return "stale"
    return "active"


def _evolution_markers(manifest: dict[str, Any]) -> list[str]:
    markers = []
    text = _norm(" ".join([str(manifest.get("reason") or ""), str(manifest.get("user_note_raw") or ""), str(manifest.get("change_class") or "")]))
    if "stale" in text:
        markers.append("stale")
    if "superseded" in text:
        markers.append("superseded")
    if "conflict" in text or "contradict" in text:
        markers.append("conflicting_synthesis")
    if bool(manifest.get("source_recheck_required")):
        markers.append("needs_source_recheck")
    return markers


def _refinement_type_for_target(target_type: str) -> str:
    normalized = target_type.strip().lower()
    if normalized in {"synthesis", "comparison", "method-family", "decision", "research-question"}:
        return "synthesis-refinement"
    if normalized in {"method", "methods"}:
        return "method-refinement"
    if normalized in {"topic", "topics"}:
        return "topic-refinement"
    if normalized in {"claim", "claims"}:
        return "claim-refinement"
    if normalized in {"evidence"}:
        return "evidence-refinement"
    return "paper-refinement"


def _find_insight_context(page_text: str, insight_id: str | None) -> dict[str, Any] | None:
    if not insight_id:
        return None
    lines = page_text.splitlines()
    for index, line in enumerate(lines):
        if insight_id in line:
            window = "\n".join(lines[index : min(index + 10, len(lines))])
            summary = ""
            match = re.search(r"- Summary:\s*(.+)", window)
            if match:
                summary = match.group(1).strip()
            return {"insight_id": insight_id, "summary": summary, "context": window}
    return {"insight_id": insight_id, "summary": "", "context": "insight id was supplied but not found in target page"}


def _provenance_summary(*, from_insight: str | None, target_info: dict[str, Any]) -> dict[str, Any]:
    return {
        "target_page": target_info.get("relative_path"),
        "from_insight": from_insight,
        "provenance_kind": "user_insight" if from_insight else "user_supplied_refinement_note",
    }


def _current_revision_id(text: str, frontmatter: dict[str, Any]) -> str:
    existing = str(frontmatter.get("revision_id") or "").strip()
    if existing:
        return existing
    return f"base-{_short_hash(text)}"


def _candidate(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "page_id": record.get("page_id"),
        "relative_path": record.get("relative_path"),
        "title": record.get("title"),
        "type": record.get("type") or record.get("result_type"),
        "directory": Path(str(record.get("relative_path") or "")).parts[0] if record.get("relative_path") else "",
        "score": record.get("score"),
        "matched_sections": record.get("matched_sections") or [],
        "matched_frontmatter": record.get("matched_frontmatter") or {},
    }


def _rebuild_target_catalog(*, wiki_root: Path, target_page: Path) -> Path:
    if target_page.parent.name == "syntheses":
        return build_synthesis_catalog(wiki_root=wiki_root).catalog_path
    build_paper_catalog(wiki_root=wiki_root)
    if (wiki_root / "syntheses").exists():
        build_synthesis_catalog(wiki_root=wiki_root)
    return wiki_root / ".index/papers.jsonl"


def _render_frontmatter(values: dict[str, Any]) -> str:
    lines = ["---"]
    for key, value in values.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f'  - "{_escape(str(item))}"')
        elif isinstance(value, bool):
            lines.append(f"{key}: {str(value).lower()}")
        elif isinstance(value, int):
            lines.append(f"{key}: {value}")
        elif value is None:
            lines.append(f"{key}: null")
        else:
            lines.append(f'{key}: "{_escape(str(value))}"')
    lines.append("---")
    return "\n".join(lines) + "\n"


def _combined_note(*, note: str, note_file: Path | None) -> str:
    chunks = []
    if note.strip():
        chunks.append(note.strip())
    if note_file is not None:
        chunks.append(note_file.read_text(encoding="utf-8").strip())
    return "\n\n".join(chunk for chunk in chunks if chunk)


def _dedupe_note_parts(values: list[str]) -> str:
    return "\n\n".join(_dedupe([value for value in values if value.strip()]))


def _normalize_change_class(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_")
    if normalized not in ALLOWED_CHANGE_CLASSES:
        allowed = ", ".join(sorted(ALLOWED_CHANGE_CLASSES))
        raise ValueError(f"change_class must be one of: {allowed}")
    return normalized


def _resolve_path(value: Any, *, base: Path) -> Path | None:
    if not value:
        return None
    path = Path(str(value))
    if path.is_absolute():
        return path
    if path.exists():
        return path
    return base / path


def _load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"refinement manifest does not exist: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _relative_or_absolute(path: Path, wiki_root: Path) -> str:
    try:
        return path.relative_to(wiki_root).as_posix()
    except ValueError:
        return str(path)


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


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


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _preview(text: str, *, limit: int) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip() + "..."


def _short_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def _finding(severity: str, code: str, message: str, *, path: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"severity": severity, "code": code, "message": message}
    if path is not None:
        payload["path"] = path
    return payload


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
