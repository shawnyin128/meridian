from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.corpus import build_paper_catalog, parse_frontmatter, retrieve_papers, split_sections, strip_frontmatter
from meridian.wiki.vault import append_wiki_log, init_wiki_vault, rebuild_wiki_index, slugify


INSIGHT_SCHEMA_VERSION = "meridian.user_insight.v1"
INSIGHT_LINT_SCHEMA_VERSION = "meridian.user_insight_lint.v1"
INSIGHT_PUBLISH_SCHEMA_VERSION = "meridian.user_insight_publish.v1"
INSIGHT_INTERNALIZATION_SCHEMA_VERSION = "meridian.user_insight_internalization.v1"
ALLOWED_INSIGHT_TYPES = {
    "paper-note",
    "paper-correction",
    "research-insight",
    "retrieval-hint",
    "cross-paper-connection",
    "implementation-note",
    "limitation-note",
    "future-question",
}
ALLOWED_INTERNALIZATION_UPDATE_TYPES = {
    "personalized_interpretation",
    "mechanism_refinement",
    "implementation_hook",
    "retrieval_hook",
    "limitation_uncertainty",
    "cross_paper_connection",
    "source_fact_correction_request",
}
INTERNALIZATION_TARGET_SECTIONS = {
    "Why It Matters For Me",
    "Personalized Interpretation",
    "Implementation Hooks",
    "When To Retrieve This Paper",
    "Cross-paper Connections",
    "Limitations / Uncertainty",
    "User Insight Provenance",
}
VALID_AFFECTED_SECTIONS = {
    "What To Remember",
    "When To Retrieve This Paper",
    "Paper Positioning",
    "Mechanism",
    "Mechanism Details To Verify",
    "Evidence Map",
    "Implementation Hooks",
    "Limitations / Uncertainty",
    "User Insights",
    "Why It Matters For Me",
    "Personalized Interpretation",
    "Cross-paper Connections",
    "User Insight Provenance",
}


@dataclass(frozen=True)
class UserInsightDraftResult:
    status: str
    insight_dir: Path
    insight_path: Path | None
    manifest_path: Path
    target_context_path: Path
    publish_plan_path: Path | None
    target_page: Path | None
    candidate_count: int


@dataclass(frozen=True)
class InsightLintResult:
    report_path: Path
    status: str
    findings: list[dict[str, Any]]


@dataclass(frozen=True)
class PublishInsightResult:
    page_path: Path
    catalog_path: Path
    lint_report_path: Path
    log_path: Path


def add_user_insight(
    *,
    wiki_root: Path,
    paper: str,
    note: str = "",
    note_file: Path | None = None,
    insight_type: str = "paper-note",
    out_dir: Path | None = None,
    overwrite: bool = False,
) -> UserInsightDraftResult:
    init_wiki_vault(wiki_root=wiki_root)
    normalized_type = _normalize_insight_type(insight_type)
    raw_note = _combined_note(note=note, note_file=note_file)
    if not raw_note.strip():
        raise ValueError("insight note must not be empty")
    match = match_paper(wiki_root=wiki_root, query=paper)
    created_at = datetime.now(timezone.utc).isoformat()
    base_slug = slugify(f"{paper}-{_short_hash(raw_note)}")
    insight_dir = out_dir or wiki_root / ".drafts/insights" / base_slug
    if insight_dir.exists() and any(insight_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"insight directory already exists: {insight_dir}")
    insight_dir.mkdir(parents=True, exist_ok=True)

    target_context_path = insight_dir / "target_context.json"
    manifest_path = insight_dir / "insight.json"
    insight_path = insight_dir / "insight.md"
    publish_plan_path = insight_dir / "publish_plan.md"
    target_context_path.write_text(json.dumps(match, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if match["status"] != "matched":
        manifest = {
            "schema_version": INSIGHT_SCHEMA_VERSION,
            "created_at": created_at,
            "updated_at": created_at,
            "status": match["status"],
            "publish_state": "blocked_disambiguation" if match["status"] == "ambiguous" else "blocked_no_match",
            "paper_query": paper,
            "source_type": "user_insight",
            "provenance": "user_supplied",
            "user_input_raw": raw_note,
            "target_context_path": str(target_context_path),
            "candidates": match.get("candidates") or [],
        }
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        insight_path.write_text(_render_disambiguation(manifest=manifest, match=match), encoding="utf-8")
        return UserInsightDraftResult(
            status=match["status"],
            insight_dir=insight_dir,
            insight_path=insight_path,
            manifest_path=manifest_path,
            target_context_path=target_context_path,
            publish_plan_path=None,
            target_page=None,
            candidate_count=len(match.get("candidates") or []),
        )

    target = dict(match["target"])
    target_page = wiki_root / str(target["relative_path"])
    normalized_summary = _normalize_summary(raw_note)
    affected_sections = _affected_sections(raw_note, normalized_type)
    insight_id = f"insight-{created_at[:10]}-{_short_hash(str(target.get('page_id')) + raw_note)}"
    retrieval_impact = _retrieval_impact(raw_note, normalized_type)
    source_recheck_required = normalized_type == "paper-correction" or _looks_like_source_fact_correction(raw_note)
    provenance_note_id = f"{insight_id}-raw-note"
    internalization_targets = _internalization_targets(
        raw_note=raw_note,
        insight_type=normalized_type,
        normalized_summary=normalized_summary,
        source_recheck_required=source_recheck_required,
        provenance_note_id=provenance_note_id,
    )
    manifest = {
        "schema_version": INSIGHT_SCHEMA_VERSION,
        "internalization_schema_version": INSIGHT_INTERNALIZATION_SCHEMA_VERSION,
        "created_at": created_at,
        "updated_at": created_at,
        "status": "draft",
        "publish_state": "draft",
        "insight_id": insight_id,
        "insight_type": normalized_type,
        "paper_query": paper,
        "target_paper": target.get("page_id"),
        "target_page": target.get("relative_path"),
        "target_title": target.get("title"),
        "source_type": "user_insight",
        "provenance": "user_supplied",
        "user_input_raw": raw_note,
        "normalized_summary": normalized_summary,
        "confidence": "user_supplied",
        "affected_sections": affected_sections,
        "internalization_targets": internalization_targets,
        "retrieval_impact": retrieval_impact,
        "source_fact_boundary": "This is user-supplied interpretation or note. It is not paper source fact unless separately verified against the source.",
        "target_context_path": str(target_context_path),
        "insight_path": str(insight_path),
        "publish_plan_path": str(publish_plan_path),
        "match": match,
        "refinement_proposal": _refinement_proposal(
            target_page=target_page,
            raw_note=raw_note,
            normalized_summary=normalized_summary,
            affected_sections=affected_sections,
            source_recheck_required=source_recheck_required,
        ),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    insight_path.write_text(_render_insight(manifest), encoding="utf-8")
    publish_plan_path.write_text(_render_publish_plan(manifest), encoding="utf-8")
    return UserInsightDraftResult(
        status="matched",
        insight_dir=insight_dir,
        insight_path=insight_path,
        manifest_path=manifest_path,
        target_context_path=target_context_path,
        publish_plan_path=publish_plan_path,
        target_page=target_page,
        candidate_count=1,
    )


def lint_user_insight(
    *,
    insight_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
) -> InsightLintResult:
    manifest = _load_manifest(insight_manifest)
    findings: list[dict[str, Any]] = []
    if manifest.get("schema_version") != INSIGHT_SCHEMA_VERSION:
        findings.append(_finding("error", "schema_version", "manifest is not a Meridian user insight"))
    if manifest.get("source_type") != "user_insight" or manifest.get("provenance") != "user_supplied":
        findings.append(_finding("error", "source_boundary", "insight must be explicitly marked as user_supplied user_insight"))
    if manifest.get("status") != "draft":
        findings.append(_finding("error", "publish_blocked", f"insight status blocks publish: {manifest.get('status')}"))
    if not str(manifest.get("user_input_raw") or "").strip():
        findings.append(_finding("error", "missing_user_input", "raw user input is missing"))
    if not str(manifest.get("normalized_summary") or "").strip():
        findings.append(_finding("error", "missing_normalized_summary", "normalized summary is missing"))
    target_page = str(manifest.get("target_page") or "")
    if not target_page:
        findings.append(_finding("error", "missing_target_page", "target page is missing"))
    elif not (wiki_root / target_page).exists():
        findings.append(_finding("error", "missing_target_page", f"target page does not exist: {target_page}", path=target_page))
    affected = list(manifest.get("affected_sections") or [])
    if not affected:
        findings.append(_finding("error", "missing_affected_sections", "affected sections are missing"))
    for section in affected:
        if str(section) not in VALID_AFFECTED_SECTIONS:
            findings.append(_finding("error", "invalid_affected_section", f"invalid affected section: {section}"))
    if not str(manifest.get("retrieval_impact") or "").strip():
        findings.append(_finding("error", "missing_retrieval_impact", "retrieval impact is missing"))
    boundary = str(manifest.get("source_fact_boundary") or "").lower()
    if "not paper source fact" not in boundary and "not source fact" not in boundary:
        findings.append(_finding("error", "source_boundary", "source fact boundary is not explicit"))
    targets = list(manifest.get("internalization_targets") or [])
    if not targets:
        findings.append(_finding("error", "missing_internalization_targets", "internalization targets are missing"))
    for index, target in enumerate(targets, start=1):
        if not isinstance(target, dict):
            findings.append(_finding("error", "invalid_internalization_target", f"internalization target {index} is not an object"))
            continue
        target_section = str(target.get("target_section") or "")
        update_type = str(target.get("update_type") or "")
        source_boundary = str(target.get("source_boundary") or "")
        if target_section not in INTERNALIZATION_TARGET_SECTIONS:
            findings.append(_finding("error", "invalid_internalization_target", f"invalid target section: {target_section}"))
        if target_section in {"Source Facts", "Evidence Map"}:
            findings.append(_finding("error", "source_fact_contamination", f"user insight cannot target source-fact section: {target_section}"))
        if update_type not in ALLOWED_INTERNALIZATION_UPDATE_TYPES:
            findings.append(_finding("error", "invalid_internalization_update_type", f"invalid update type: {update_type}"))
        if not str(target.get("provenance_note_id") or "").strip():
            findings.append(_finding("error", "missing_provenance_note_id", f"target {index} is missing provenance_note_id"))
        if "not paper source fact" not in source_boundary.lower() and "not source fact" not in source_boundary.lower():
            findings.append(_finding("error", "source_boundary", f"target {index} source boundary is not explicit"))
        if update_type == "source_fact_correction_request" and not bool(target.get("requires_source_recheck")):
            findings.append(
                _finding(
                    "error",
                    "source_recheck_required",
                    "source_fact_correction_request must require source re-check",
                )
            )
    if _claims_source_fact_authority(str(manifest.get("normalized_summary") or "")):
        findings.append(_finding("error", "source_fact_contamination", "normalized insight presents user input as paper evidence"))
    match = dict(manifest.get("match") or {})
    if match.get("status") != "matched":
        findings.append(_finding("error", "ambiguous_or_missing_match", "paper match is not unique"))

    status = "fail" if any(item["severity"] == "error" for item in findings) else "pass"
    report = {
        "schema_version": INSIGHT_LINT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "findings": findings,
        "insight_manifest": str(insight_manifest),
    }
    report_path = out_path or insight_manifest.parent / "insight-lint.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return InsightLintResult(report_path=report_path, status=status, findings=findings)


def publish_user_insight(
    *,
    insight_manifest: Path,
    wiki_root: Path,
) -> PublishInsightResult:
    lint = lint_user_insight(insight_manifest=insight_manifest, wiki_root=wiki_root)
    if lint.status != "pass":
        raise ValueError(f"insight lint failed: {lint.report_path}")
    manifest = _load_manifest(insight_manifest)
    target_page = wiki_root / str(manifest["target_page"])
    text = target_page.read_text(encoding="utf-8")
    updated_text = _internalize_insight_into_page(text=text, manifest=manifest, wiki_root=wiki_root)
    target_page.write_text(updated_text, encoding="utf-8")
    now = datetime.now(timezone.utc).isoformat()
    manifest["status"] = "published"
    manifest["publish_state"] = "published_internalized"
    manifest["published_at"] = now
    manifest["updated_at"] = now
    insight_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    index_path = rebuild_wiki_index(wiki_root=wiki_root)
    catalog_path = wiki_root / ".index/papers.jsonl"
    log_path = append_wiki_log(
        wiki_root=wiki_root,
        action="insight",
        title=str(manifest.get("target_title") or manifest.get("target_page") or "user insight"),
        lines=[
            f"Published user insight `{manifest.get('insight_id')}` as internalized canonical interpretation.",
            f"Target page: `{manifest.get('target_page')}`",
            "Boundary: user-supplied insight; not paper source fact.",
            f"Updated index: `{index_path.relative_to(wiki_root)}`",
        ],
    )
    return PublishInsightResult(page_path=target_page, catalog_path=catalog_path, lint_report_path=lint.report_path, log_path=log_path)


def match_paper(*, wiki_root: Path, query: str) -> dict[str, Any]:
    records = _paper_records(wiki_root)
    normalized = _norm(query)
    exact = []
    for record in records:
        evidence = _exact_match_evidence(record, normalized, query=query, wiki_root=wiki_root)
        if evidence:
            exact.append(_candidate(record, score=1.0, match_type=evidence))
    if len(exact) == 1:
        return {"status": "matched", "query": query, "target": exact[0], "candidates": exact}
    if len(exact) > 1:
        return {"status": "ambiguous", "query": query, "candidates": exact[:8], "reason": "multiple exact paper matches"}

    retrieved = retrieve_papers(query=query, wiki_root=wiki_root, catalog_records=records, top_k=5, strategy="v1").results
    candidates = [_candidate_from_retrieval(item) for item in retrieved]
    if not candidates:
        return {"status": "no_match", "query": query, "candidates": [], "reason": "no canonical paper matched"}
    top = candidates[0]
    second = candidates[1] if len(candidates) > 1 else None
    if top["score"] < 8:
        return {"status": "no_match", "query": query, "candidates": candidates, "reason": "retrieval confidence below threshold"}
    if second is not None and top["score"] < max(second["score"] * 1.2, second["score"] + 12):
        return {"status": "ambiguous", "query": query, "candidates": candidates, "reason": "retrieval match is not uniquely separated"}
    return {"status": "matched", "query": query, "target": top, "candidates": candidates}


def _paper_records(wiki_root: Path) -> list[dict[str, Any]]:
    catalog = wiki_root / ".index/papers.jsonl"
    build_paper_catalog(wiki_root=wiki_root, out_path=catalog)
    records = []
    with catalog.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                records.append(json.loads(line))
    return records


def _exact_match_evidence(record: dict[str, Any], normalized: str, *, query: str, wiki_root: Path) -> str:
    rel = str(record.get("relative_path") or "")
    path = str(record.get("path") or "")
    values = {
        "relative_path": rel,
        "page_id": str(record.get("page_id") or ""),
        "title": str(record.get("title") or ""),
        "source_id": str(record.get("source_id") or ""),
        "stem": Path(rel).stem,
    }
    routing = record.get("routing") or {}
    for alias in routing.get("aliases") or []:
        values[f"alias:{alias}"] = str(alias)
    query_path = Path(query)
    if query_path.exists():
        try:
            if query_path.resolve() == (wiki_root / rel).resolve():
                return "exact canonical path match"
        except OSError:
            pass
    if path and Path(path).exists():
        try:
            if Path(path).resolve() == query_path.resolve():
                return "exact canonical path match"
        except OSError:
            pass
    for label, value in values.items():
        if value and _norm(value) == normalized:
            return f"exact {label} match"
    return ""


def _candidate(record: dict[str, Any], *, score: float, match_type: str) -> dict[str, Any]:
    return {
        "page_id": record.get("page_id"),
        "relative_path": record.get("relative_path"),
        "title": record.get("title"),
        "source_id": record.get("source_id"),
        "score": score,
        "match_type": match_type,
        "selection_reasons": [match_type],
    }


def _candidate_from_retrieval(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "page_id": item.get("page_id"),
        "relative_path": item.get("relative_path"),
        "title": item.get("title"),
        "source_id": item.get("source_id"),
        "score": float(item.get("score") or 0.0),
        "match_type": "retrieval match",
        "selection_reasons": item.get("selection_reasons") or [],
        "matched_sections": item.get("matched_sections") or [],
        "matched_frontmatter": item.get("matched_frontmatter") or {},
    }


def _render_insight(manifest: dict[str, Any]) -> str:
    targets = list(manifest.get("internalization_targets") or [])
    return "\n".join(
        [
            "# User Insight Draft",
            "",
            "## Raw User Note",
            "",
            str(manifest["user_input_raw"]).strip(),
            "",
            "## Matched Paper",
            "",
            f"- Target: [[{Path(str(manifest['target_page'])).with_suffix('').as_posix()}|{manifest['target_title']}]]",
            f"- Match: `{manifest['match']['target']['match_type']}`",
            "",
            "## Normalized User Insight",
            "",
            f"- {manifest['normalized_summary']}",
            "",
            "## Internalization Targets",
            "",
            *[
                f"- `{item.get('target_section')}` via `{item.get('update_type')}`; source re-check: `{bool(item.get('requires_source_recheck'))}`"
                for item in targets
            ],
            "",
            "## Proposed Canonical Updates",
            "",
            *[
                f"- `{item.get('target_section')}`: {item.get('proposed_update')}"
                for item in targets
            ],
            "",
            "## Source Fact Boundary",
            "",
            f"- {manifest['source_fact_boundary']}",
            f"- Source re-check required: `{bool(manifest['refinement_proposal']['source_recheck_required'])}`",
            "",
            "## Source Re-check Needed",
            "",
            f"- `{any(bool(item.get('requires_source_recheck')) for item in targets)}`",
            "",
            "## Retrieval Impact",
            "",
            f"- {manifest['retrieval_impact']}",
            "",
            "## Open Questions",
            "",
            "- If this changes a source-grounded section, re-open the paper source before rewriting that section.",
            "",
        ]
    )


def _render_disambiguation(*, manifest: dict[str, Any], match: dict[str, Any]) -> str:
    lines = ["# User Insight Needs Paper Disambiguation", "", "## User Input", "", str(manifest.get("user_input_raw") or "").strip(), "", "## Candidates", ""]
    for candidate in match.get("candidates") or []:
        lines.append(f"- `{candidate.get('relative_path')}`: {candidate.get('title')} (score `{candidate.get('score')}`)")
    if not match.get("candidates"):
        lines.append("- No canonical paper matched. Ingest the paper or search the wiki first.")
    lines.extend(["", "## Status", "", f"- `{manifest.get('publish_state')}`", ""])
    return "\n".join(lines)


def _render_publish_plan(manifest: dict[str, Any]) -> str:
    return "\n".join(
        [
            "# User Insight Publish Plan",
            "",
            f"- Insight ID: `{manifest['insight_id']}`",
            f"- Target page: `{manifest['target_page']}`",
            "- Publish action: internalize into non-source-fact canonical sections; update frontmatter `user_insights`, `personalized`, and `updated`.",
            "- Provenance action: preserve raw note under `## User Insight Provenance` and legacy `## User Insights` audit entry.",
            "- Source-grounded sections are not overwritten from user input alone.",
            f"- Source re-check required before source-fact rewrite: `{bool(manifest['refinement_proposal']['source_recheck_required'])}`",
            "",
        ]
    )


def _internalize_insight_into_page(*, text: str, manifest: dict[str, Any], wiki_root: Path) -> str:
    frontmatter = parse_frontmatter(text)
    body = strip_frontmatter(text)
    insights = _dedupe([str(item) for item in _as_list(frontmatter.get("user_insights"))] + [str(manifest["insight_id"])])
    frontmatter["user_insights"] = insights
    frontmatter["personalized"] = True
    frontmatter["updated"] = datetime.now(timezone.utc).date().isoformat()
    for target in manifest.get("internalization_targets") or []:
        section = str(target.get("target_section") or "")
        if section == "User Insight Provenance":
            continue
        body = _append_to_section(body=body, heading=section, entry=_render_internalized_entry(manifest=manifest, target=target))
    provenance_entry = _render_user_insight_provenance_entry(manifest=manifest, wiki_root=wiki_root)
    body = _append_to_section(body=body, heading="User Insight Provenance", entry=provenance_entry)
    entry = _render_canonical_insight_entry(manifest=manifest, wiki_root=wiki_root)
    body = _append_to_section(body=body, heading="User Insights", entry=entry)
    return _render_frontmatter(frontmatter) + "\n" + body.lstrip()


def _append_to_section(*, body: str, heading: str, entry: str) -> str:
    marker = f"## {heading}"
    body = body.rstrip()
    if marker in body:
        pattern = re.compile(rf"(^## {re.escape(heading)}\s*$)", re.MULTILINE)
        match = pattern.search(body)
        if match:
            next_heading = re.search(r"^##\s+", body[match.end() :], flags=re.MULTILINE)
            insert_at = match.end() + next_heading.start() if next_heading else len(body)
            return body[:insert_at].rstrip() + "\n\n" + entry.rstrip() + "\n\n" + body[insert_at:].lstrip()
    return body + f"\n\n{marker}\n\n" + entry.rstrip() + "\n"


def _render_internalized_entry(*, manifest: dict[str, Any], target: dict[str, Any]) -> str:
    insight_id = str(manifest["insight_id"])
    source_type = "personalized_synthesis" if target.get("update_type") in {"mechanism_refinement", "cross_paper_connection"} else "user_interpretation"
    return "\n".join(
        [
            f"### {insight_id}",
            "",
            f"- Source type: `{source_type}`; not paper source fact: `true`",
            f"- Update type: `{target.get('update_type')}`",
            f"- Insight: {target.get('proposed_update')}",
            f"- Provenance note: `{target.get('provenance_note_id')}`",
            f"- Source re-check required: `{bool(target.get('requires_source_recheck'))}`",
            f"- Boundary: {target.get('source_boundary')}",
        ]
    )


def _render_user_insight_provenance_entry(*, manifest: dict[str, Any], wiki_root: Path) -> str:
    path = Path(str(manifest.get("insight_path") or ""))
    try:
        rel = path.relative_to(wiki_root).as_posix()
    except ValueError:
        rel = str(path)
    return "\n".join(
        [
            f"### {manifest['insight_id']}-raw-note",
            "",
            f"- Insight ID: `{manifest['insight_id']}`",
            f"- Source type: `user_insight`; provenance: `user_supplied`",
            f"- Date: `{str(manifest.get('created_at') or '')[:10]}`",
            f"- Raw note: {str(manifest.get('user_input_raw') or '').strip()}",
            f"- Draft artifact: `{rel}`",
            "- Boundary: raw user note preserved for audit; not paper source fact.",
        ]
    )


def _render_canonical_insight_entry(*, manifest: dict[str, Any], wiki_root: Path) -> str:
    path = Path(str(manifest.get("insight_path") or ""))
    try:
        rel = path.relative_to(wiki_root).as_posix()
    except ValueError:
        rel = str(path)
    return "\n".join(
        [
            f"### {manifest['insight_id']}",
            "",
            f"- Type: `{manifest['insight_type']}`",
            f"- Source type: `user_insight`; provenance: `user_supplied`",
            f"- Date: `{str(manifest.get('created_at') or '')[:10]}`",
            f"- Summary: {manifest['normalized_summary']}",
            f"- Original user note: `{rel}`",
            f"- Affected sections: {', '.join(manifest.get('affected_sections') or [])}",
            "- Canonical consumption: internalized sections above; this block is provenance/audit.",
            f"- Retrieval hook: {manifest.get('retrieval_impact')}",
            "- Boundary: user-supplied insight, not paper source fact or scientific evidence.",
        ]
    )


def _refinement_proposal(
    *,
    target_page: Path,
    raw_note: str,
    normalized_summary: str,
    affected_sections: list[str],
    source_recheck_required: bool,
) -> dict[str, Any]:
    sections = split_sections(strip_frontmatter(target_page.read_text(encoding="utf-8"))) if target_page.exists() else {}
    current = {section: _first_line(sections.get(section, "")) for section in affected_sections if section in sections}
    return {
        "user_said": raw_note,
        "current_page_says": current,
        "proposed_update": normalized_summary,
        "update_kind": "user_insight" if source_recheck_required else "user_interpretation",
        "source_recheck_required": source_recheck_required,
        "publish_target": "internalized canonical interpretation",
    }


def _internalization_targets(
    *,
    raw_note: str,
    insight_type: str,
    normalized_summary: str,
    source_recheck_required: bool,
    provenance_note_id: str,
) -> list[dict[str, Any]]:
    lowered = raw_note.lower()
    boundary = "User-supplied interpretation; not paper source fact unless separately verified against the source."
    targets: list[dict[str, Any]] = []
    if source_recheck_required:
        targets.append(
            _internalization_target(
                section="Limitations / Uncertainty",
                update_type="source_fact_correction_request",
                proposed_update=f"User flagged a possible source-fact issue: {normalized_summary}",
                boundary=boundary,
                requires_source_recheck=True,
                provenance_note_id=provenance_note_id,
            )
        )
    elif insight_type == "implementation-note" or any(token in lowered for token in ("implement", "code", "probe", "ablation", "实验")):
        targets.append(
            _internalization_target(
                section="Implementation Hooks",
                update_type="implementation_hook",
                proposed_update=normalized_summary,
                boundary=boundary,
                requires_source_recheck=False,
                provenance_note_id=provenance_note_id,
            )
        )
    elif insight_type == "retrieval-hint" or any(token in lowered for token in ("retrieve", "search", "检索", "remember")):
        targets.append(
            _internalization_target(
                section="When To Retrieve This Paper",
                update_type="retrieval_hook",
                proposed_update=normalized_summary,
                boundary=boundary,
                requires_source_recheck=False,
                provenance_note_id=provenance_note_id,
            )
        )
    elif insight_type == "cross-paper-connection" or any(token in lowered for token in ("connection", "compare", "versus", "relationship", "关系")):
        targets.append(
            _internalization_target(
                section="Cross-paper Connections",
                update_type="cross_paper_connection",
                proposed_update=normalized_summary,
                boundary=boundary,
                requires_source_recheck=False,
                provenance_note_id=provenance_note_id,
            )
        )
    elif insight_type == "limitation-note" or any(token in lowered for token in ("limitation", "failure", "uncertain", "scope")):
        targets.append(
            _internalization_target(
                section="Limitations / Uncertainty",
                update_type="limitation_uncertainty",
                proposed_update=normalized_summary,
                boundary=boundary,
                requires_source_recheck=False,
                provenance_note_id=provenance_note_id,
            )
        )
    elif any(token in lowered for token in ("mechanism", "method", "核心", "why", "important", "关键")):
        targets.append(
            _internalization_target(
                section="Personalized Interpretation",
                update_type="mechanism_refinement",
                proposed_update=normalized_summary,
                boundary=boundary,
                requires_source_recheck=False,
                provenance_note_id=provenance_note_id,
            )
        )
    else:
        targets.append(
            _internalization_target(
                section="Why It Matters For Me",
                update_type="personalized_interpretation",
                proposed_update=normalized_summary,
                boundary=boundary,
                requires_source_recheck=False,
                provenance_note_id=provenance_note_id,
            )
        )
    targets.append(
        _internalization_target(
            section="User Insight Provenance",
            update_type="personalized_interpretation",
            proposed_update="Preserve the raw user note for audit and traceability.",
            boundary=boundary,
            requires_source_recheck=False,
            provenance_note_id=provenance_note_id,
        )
    )
    return targets


def _internalization_target(
    *,
    section: str,
    update_type: str,
    proposed_update: str,
    boundary: str,
    requires_source_recheck: bool,
    provenance_note_id: str,
) -> dict[str, Any]:
    return {
        "target_section": section,
        "update_type": update_type,
        "proposed_update": proposed_update,
        "source_boundary": boundary,
        "requires_source_recheck": requires_source_recheck,
        "provenance_note_id": provenance_note_id,
    }


def _combined_note(*, note: str, note_file: Path | None) -> str:
    chunks = []
    if note.strip():
        chunks.append(note.strip())
    if note_file is not None:
        if not note_file.exists():
            raise FileNotFoundError(f"note file does not exist: {note_file}")
        chunks.append(note_file.read_text(encoding="utf-8").strip())
    return "\n\n".join(chunk for chunk in chunks if chunk)


def _normalize_insight_type(value: str) -> str:
    normalized = value.strip().lower().replace("_", "-")
    if normalized not in ALLOWED_INSIGHT_TYPES:
        allowed = ", ".join(sorted(ALLOWED_INSIGHT_TYPES))
        raise ValueError(f"insight type must be one of: {allowed}")
    return normalized


def _normalize_summary(note: str) -> str:
    first = re.split(r"(?<=[.!?。！？])\s+", " ".join(note.split()), maxsplit=1)[0]
    return first[:500].rstrip()


def _affected_sections(note: str, insight_type: str) -> list[str]:
    lowered = note.lower()
    sections = ["User Insights"]
    if insight_type == "retrieval-hint" or any(token in lowered for token in ("retrieve", "search", "找", "检索")):
        sections.append("When To Retrieve This Paper")
    if insight_type == "implementation-note" or any(token in lowered for token in ("implement", "code", "probe", "ablation", "实验")):
        sections.append("Implementation Hooks")
    if insight_type in {"paper-correction", "limitation-note"} or any(token in lowered for token in ("wrong", "incorrect", "limitation", "failure", "漏", "错")):
        sections.append("Limitations / Uncertainty")
    if any(token in lowered for token in ("mechanism", "method", "核心", "方法")):
        sections.append("Mechanism")
    return _dedupe(sections)


def _retrieval_impact(note: str, insight_type: str) -> str:
    summary = _normalize_summary(note)
    if insight_type == "implementation-note":
        return f"Use this page for implementation/probe planning when the user asks about: {summary}"
    if insight_type == "retrieval-hint":
        return f"Use this page for future retrieval when the user asks about: {summary}"
    if insight_type == "cross-paper-connection":
        return f"Use this page for cross-paper comparison when the user asks about: {summary}"
    return f"Use this user insight as personalized context when the user asks about: {summary}"


def _looks_like_source_fact_correction(note: str) -> bool:
    lowered = note.lower()
    return any(token in lowered for token in ("wrong", "incorrect", "not true", "paper.md", "source fact", "错", "不对", "漏了"))


def _claims_source_fact_authority(text: str) -> bool:
    lowered = text.lower()
    return any(token in lowered for token in ("the paper proves", "the authors prove", "the paper demonstrates", "the authors show"))


def _load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"insight manifest does not exist: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def _render_frontmatter(values: dict[str, Any]) -> str:
    lines = ["---"]
    for key, value in values.items():
        lines.extend(_render_yaml_field(key, value))
    lines.append("---")
    return "\n".join(lines)


def _render_yaml_field(key: str, value: Any) -> list[str]:
    if isinstance(value, bool):
        return [f"{key}: {'true' if value else 'false'}"]
    if isinstance(value, int):
        return [f"{key}: {value}"]
    if isinstance(value, list):
        if not value:
            return [f"{key}: []"]
        return [f"{key}:"] + [f"  - {_yaml_scalar(item)}" for item in value]
    if value is None:
        return [f"{key}: null"]
    return [f"{key}: {_yaml_scalar(value)}"]


def _yaml_scalar(value: object) -> str:
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


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
        normalized = str(value).strip()
        key = normalized.lower()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _first_line(text: str) -> str:
    return " ".join(text.strip().split())[:300]


def _finding(severity: str, code: str, message: str, *, path: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"severity": severity, "code": code, "message": message}
    if path is not None:
        payload["path"] = path
    return payload


def _short_hash(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:10]


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()
