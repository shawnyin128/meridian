from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.corpus import (
    build_knowledge_catalogs,
    build_paper_catalog,
    build_synthesis_catalog,
    parse_frontmatter,
    retrieve_papers,
    split_sections,
    strip_frontmatter,
)
from meridian.wiki.knowledge import run_knowledge_audit
from meridian.wiki.proposals import (
    lint_query_writeback_proposal,
    propose_query_writeback,
    publish_query_writeback_proposal,
)
from meridian.wiki.vault import append_wiki_log, init_wiki_vault, rebuild_wiki_index, slugify


FINAL_STATUS_SCHEMA_VERSION = "meridian.final_status_migration.v1"
SYNTHESIS_BATCH_SCHEMA_VERSION = "meridian.synthesis_batch.v1"
METHOD_CONSOLIDATION_SCHEMA_VERSION = "meridian.method_consolidation.v1"
CONTRADICTION_REVIEW_SCHEMA_VERSION = "meridian.contradiction_review.v1"
NAVIGATION_SCHEMA_VERSION = "meridian.obsidian_navigation.v1"
FINAL_CHECK_SCHEMA_VERSION = "meridian.final_product_check.v1"


CANONICAL_DIRS = ("papers", "methods", "topics", "concepts", "claims", "evidence", "syntheses")


@dataclass(frozen=True)
class FinalStatusMigrationResult:
    manifest_path: Path
    updated_pages: int
    status_counts: dict[str, int]
    catalog_path: Path
    log_path: Path


@dataclass(frozen=True)
class SynthesisBatchProposalResult:
    batch_dir: Path
    manifest_path: Path
    proposal_count: int


@dataclass(frozen=True)
class PublishSynthesisBatchResult:
    manifest_path: Path
    published_count: int
    skipped_count: int
    failed_count: int


@dataclass(frozen=True)
class MethodConsolidationResult:
    proposal_dir: Path
    manifest_path: Path
    candidate_count: int
    grouped_count: int
    high_risk_count: int


@dataclass(frozen=True)
class PublishMethodConsolidationResult:
    manifest_path: Path
    published_manifest_path: Path
    updated_candidates: int
    skipped_candidates: int
    catalog_paths: list[Path]
    log_path: Path


@dataclass(frozen=True)
class ContradictionReviewResult:
    proposal_dir: Path
    manifest_path: Path
    candidate_count: int


@dataclass(frozen=True)
class NavigationBuildResult:
    manifest_path: Path
    pages: list[Path]


@dataclass(frozen=True)
class FinalProductCheckResult:
    report_path: Path
    brief_path: Path
    status: str
    metrics: dict[str, Any]
    findings: list[dict[str, Any]]


def migrate_final_statuses(*, wiki_root: Path, out_path: Path | None = None) -> FinalStatusMigrationResult:
    init_wiki_vault(wiki_root=wiki_root)
    updated_pages = 0
    status_counts: dict[str, int] = {}
    updates: list[dict[str, Any]] = []
    for page in sorted((wiki_root / "papers").glob("*.md")):
        text = page.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        quality_state, validation_state, trust_state = _derive_quality_states(fm)
        status_counts[quality_state] = status_counts.get(quality_state, 0) + 1
        patch = {
            "quality_state": quality_state,
            "validation_state": validation_state,
            "trust_state": trust_state,
        }
        if "confidence" not in fm:
            patch["confidence"] = "medium" if quality_state != "source_quality_hold" else "low"
        if _frontmatter_needs_patch(fm, patch):
            page.write_text(_upsert_scalar_frontmatter_fields(text, patch), encoding="utf-8")
            updated_pages += 1
            updates.append({"page": page.relative_to(wiki_root).as_posix(), "patch": patch})

    catalog = build_paper_catalog(wiki_root=wiki_root)
    if (wiki_root / "syntheses").exists():
        build_synthesis_catalog(wiki_root=wiki_root)
    build_knowledge_catalogs(wiki_root=wiki_root)
    log_path = append_wiki_log(
        wiki_root=wiki_root,
        action="migrate",
        title="Final LLM Wiki status semantics",
        lines=[
            f"Updated paper quality-state fields on {updated_pages} pages.",
            "Preserved legacy `quality_gate` while adding retrieval-visible `quality_state`, `validation_state`, and `trust_state`.",
            f"Status counts: `{json.dumps(status_counts, sort_keys=True)}`",
        ],
    )
    manifest = {
        "schema_version": FINAL_STATUS_SCHEMA_VERSION,
        "created_at": _now(),
        "wiki_root": str(wiki_root),
        "updated_pages": updated_pages,
        "status_counts": status_counts,
        "catalog_path": str(catalog.catalog_path),
        "log_path": str(log_path),
        "updates": updates[:200],
    }
    manifest_path = out_path or wiki_root / ".index/final-status-migration.json"
    _write_json(manifest_path, manifest)
    return FinalStatusMigrationResult(
        manifest_path=manifest_path,
        updated_pages=updated_pages,
        status_counts=status_counts,
        catalog_path=catalog.catalog_path,
        log_path=log_path,
    )


def propose_synthesis_batch(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    max_items: int = 6,
    overwrite: bool = False,
) -> SynthesisBatchProposalResult:
    init_wiki_vault(wiki_root=wiki_root)
    created_at = _now()
    batch_id = f"synthesis-growth-{created_at[:10]}"
    batch_dir = out_dir or wiki_root / ".drafts/proposals" / batch_id
    if batch_dir.exists() and any(batch_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"synthesis batch directory already exists: {batch_dir}")
    batch_dir.mkdir(parents=True, exist_ok=True)

    candidates = _synthesis_candidates(wiki_root=wiki_root, max_items=max_items)
    proposals: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates, start=1):
        context_path = batch_dir / f"context-{index:02d}.json"
        retrieve_papers(
            query=candidate["query"],
            wiki_root=wiki_root,
            top_k=6,
            strategy="v1",
            result_path=context_path,
        )
        body_path = batch_dir / f"body-{index:02d}.md"
        body_path.write_text(_synthesis_body(candidate), encoding="utf-8")
        proposal_dir = batch_dir / slugify(candidate["title"])
        result = propose_query_writeback(
            wiki_root=wiki_root,
            query=candidate["query"],
            context_path=context_path,
            title=candidate["title"],
            proposal_type=candidate["proposal_type"],
            body_path=body_path,
            out_dir=proposal_dir,
            user_note=candidate["user_note"],
            overwrite=overwrite,
            update_log=False,
        )
        proposals.append(
            {
                "title": candidate["title"],
                "query": candidate["query"],
                "proposal_type": candidate["proposal_type"],
                "proposal_manifest": str(result.manifest_path),
                "proposal_path": str(result.proposal_path),
                "context_path": str(context_path),
                "publish_target": str(wiki_root / "syntheses" / f"{slugify(candidate['title'])}.md"),
            }
        )

    manifest = {
        "schema_version": SYNTHESIS_BATCH_SCHEMA_VERSION,
        "created_at": created_at,
        "wiki_root": str(wiki_root),
        "batch_id": batch_id,
        "status": "draft",
        "proposal_count": len(proposals),
        "proposals": proposals,
        "policy": {
            "publish": "lint then publish as low-confidence synthesis scaffolds",
            "boundary": "source facts stay extracted from retrieval context; cross-paper interpretation remains Wiki Synthesis.",
        },
    }
    manifest_path = batch_dir / "batch.json"
    _write_json(manifest_path, manifest)
    (batch_dir / "batch.md").write_text(_render_synthesis_batch(manifest), encoding="utf-8")
    return SynthesisBatchProposalResult(batch_dir=batch_dir, manifest_path=manifest_path, proposal_count=len(proposals))


def publish_synthesis_batch(
    *,
    batch_manifest: Path,
    wiki_root: Path,
    limit: int | None = None,
    overwrite: bool = False,
) -> PublishSynthesisBatchResult:
    manifest = _read_json(batch_manifest)
    published: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    proposals = list(manifest.get("proposals") or [])
    if limit is not None:
        proposals = proposals[:limit]
    for item in proposals:
        proposal_manifest = Path(str(item.get("proposal_manifest") or ""))
        target = Path(str(item.get("publish_target") or ""))
        if target.exists() and not overwrite:
            skipped.append({"proposal_manifest": str(proposal_manifest), "reason": "publish_target_exists", "target": str(target)})
            continue
        try:
            lint = lint_query_writeback_proposal(proposal_manifest=proposal_manifest, wiki_root=wiki_root, overwrite=overwrite)
            if lint.status != "pass":
                failed.append({"proposal_manifest": str(proposal_manifest), "reason": "lint_failed", "lint_report": str(lint.report_path)})
                continue
            result = publish_query_writeback_proposal(proposal_manifest=proposal_manifest, wiki_root=wiki_root, overwrite=overwrite)
            published.append({"proposal_manifest": str(proposal_manifest), "page_path": str(result.page_path)})
        except Exception as exc:  # noqa: BLE001 - preserve batch progress.
            failed.append({"proposal_manifest": str(proposal_manifest), "reason": str(exc)})

    manifest["publish_result"] = {
        "created_at": _now(),
        "published": published,
        "skipped": skipped,
        "failed": failed,
    }
    _write_json(batch_manifest, manifest)
    return PublishSynthesisBatchResult(
        manifest_path=batch_manifest,
        published_count=len(published),
        skipped_count=len(skipped),
        failed_count=len(failed),
    )


def propose_method_consolidation(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    overwrite: bool = False,
) -> MethodConsolidationResult:
    init_wiki_vault(wiki_root=wiki_root)
    created_at = _now()
    proposal_id = f"method-consolidation-{created_at[:10]}"
    proposal_dir = out_dir or wiki_root / ".drafts/knowledge-repair" / proposal_id
    if proposal_dir.exists() and any(proposal_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"method consolidation directory already exists: {proposal_dir}")
    proposal_dir.mkdir(parents=True, exist_ok=True)

    method_pages = _load_pages(wiki_root, directory="methods")
    compiled = [page for page in method_pages if page["knowledge_role"] == "compiled_method"]
    candidates = [page for page in method_pages if page["knowledge_role"] == "paper_method_candidate"]
    groups: list[dict[str, Any]] = []
    high_risk: list[dict[str, Any]] = []
    for candidate in candidates:
        target, score, evidence = _best_method_family(candidate, compiled)
        if target and score >= 2:
            groups.append(
                {
                    "candidate": candidate["relative_path"],
                    "candidate_title": candidate["title"],
                    "target_method": target["relative_path"],
                    "target_title": target["title"],
                    "match_score": score,
                    "match_evidence": evidence,
                    "publishable_low_risk_update": {
                        "action_type": "update_frontmatter",
                        "target_path": candidate["relative_path"],
                        "fields": {
                            "consolidation_target": target["page_id"],
                            "candidate_scope": "paper_specific_method_record",
                            "retrieval_visibility": "suppressed_unless_exact_identity",
                        },
                    },
                }
            )
        else:
            high_risk.append(
                {
                    "candidate": candidate["relative_path"],
                    "candidate_title": candidate["title"],
                    "reason": "No confident method-family target; requires source-aware synthesis or a new method-family page.",
                }
            )

    manifest = {
        "schema_version": METHOD_CONSOLIDATION_SCHEMA_VERSION,
        "created_at": created_at,
        "wiki_root": str(wiki_root),
        "proposal_id": proposal_id,
        "status": "proposal",
        "candidate_count": len(candidates),
        "grouped_count": len(groups),
        "high_risk_count": len(high_risk),
        "groups": groups,
        "high_risk_items": high_risk,
        "policy": {
            "safe": "frontmatter can record consolidation_target and retrieval visibility",
            "unsafe": "do not merge or rewrite method families without source-aware review",
        },
    }
    manifest_path = proposal_dir / "method-consolidation.json"
    _write_json(manifest_path, manifest)
    (proposal_dir / "method-consolidation.md").write_text(_render_method_consolidation(manifest), encoding="utf-8")
    return MethodConsolidationResult(
        proposal_dir=proposal_dir,
        manifest_path=manifest_path,
        candidate_count=len(candidates),
        grouped_count=len(groups),
        high_risk_count=len(high_risk),
    )


def publish_method_consolidation(
    *,
    consolidation_manifest: Path,
    wiki_root: Path,
) -> PublishMethodConsolidationResult:
    manifest = _read_json(consolidation_manifest)
    if manifest.get("schema_version") != METHOD_CONSOLIDATION_SCHEMA_VERSION:
        raise ValueError(f"not a method consolidation manifest: {consolidation_manifest}")
    updated = []
    skipped = []
    for group in manifest.get("groups") or []:
        update = group.get("publishable_low_risk_update") or {}
        if update.get("action_type") != "update_frontmatter":
            skipped.append({"candidate": group.get("candidate"), "reason": "unsupported_action"})
            continue
        relative = str(update.get("target_path") or group.get("candidate") or "")
        if not relative.startswith("methods/") or ".." in Path(relative).parts:
            skipped.append({"candidate": relative, "reason": "non_canonical_method_target"})
            continue
        target = wiki_root / relative
        if not target.exists():
            skipped.append({"candidate": relative, "reason": "target_missing"})
            continue
        fields = dict(update.get("fields") or {})
        if not fields:
            skipped.append({"candidate": relative, "reason": "empty_update"})
            continue
        before = parse_frontmatter(target.read_text(encoding="utf-8"))
        target.write_text(_upsert_scalar_frontmatter_fields(target.read_text(encoding="utf-8"), fields), encoding="utf-8")
        after = parse_frontmatter(target.read_text(encoding="utf-8"))
        changed_fields = {key: after.get(key) for key in fields if before.get(key) != after.get(key)}
        if changed_fields:
            updated.append({"candidate": relative, "fields": changed_fields, "target_method": group.get("target_method")})
        else:
            skipped.append({"candidate": relative, "reason": "already_current"})

    paper_catalog = build_paper_catalog(wiki_root=wiki_root)
    synthesis_catalog = build_synthesis_catalog(wiki_root=wiki_root) if (wiki_root / "syntheses").exists() else None
    knowledge_catalogs = build_knowledge_catalogs(wiki_root=wiki_root)
    index_path = rebuild_wiki_index(wiki_root=wiki_root)
    log_path = append_wiki_log(
        wiki_root=wiki_root,
        action="knowledge-repair",
        title=str(manifest.get("proposal_id") or "method consolidation"),
        lines=[
            f"Updated paper-specific method candidates: {len(updated)}",
            f"Skipped candidates: {len(skipped)}",
            f"Consolidation manifest: `{_relative_or_absolute(consolidation_manifest, wiki_root)}`",
            "Low-risk publish only records family routing and retrieval visibility; it does not merge or rewrite method pages.",
        ],
    )
    publish_manifest = {
        "schema_version": "meridian.method_consolidation_publish.v1",
        "created_at": _now(),
        "wiki_root": str(wiki_root),
        "consolidation_manifest": str(consolidation_manifest),
        "status": "published_low_risk_frontmatter",
        "updated_candidates": updated,
        "skipped_candidates": skipped,
        "index_path": str(index_path),
        "catalog_paths": [
            str(paper_catalog.catalog_path),
            *([str(synthesis_catalog.catalog_path)] if synthesis_catalog else []),
            *[str(item.catalog_path) for item in knowledge_catalogs],
        ],
        "log_path": str(log_path),
    }
    publish_path = consolidation_manifest.parent / "method-consolidation-publish.json"
    _write_json(publish_path, publish_manifest)
    return PublishMethodConsolidationResult(
        manifest_path=consolidation_manifest,
        published_manifest_path=publish_path,
        updated_candidates=len(updated),
        skipped_candidates=len(skipped),
        catalog_paths=[paper_catalog.catalog_path, *([synthesis_catalog.catalog_path] if synthesis_catalog else []), *[item.catalog_path for item in knowledge_catalogs]],
        log_path=log_path,
    )


def propose_contradiction_review(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    overwrite: bool = False,
) -> ContradictionReviewResult:
    init_wiki_vault(wiki_root=wiki_root)
    created_at = _now()
    proposal_id = f"contradiction-review-{created_at[:10]}"
    proposal_dir = out_dir or wiki_root / ".drafts/knowledge-repair" / proposal_id
    if proposal_dir.exists() and any(proposal_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"contradiction review directory already exists: {proposal_dir}")
    proposal_dir.mkdir(parents=True, exist_ok=True)

    audit = run_knowledge_audit(wiki_root=wiki_root)
    audit_payload = _read_json(audit.report_path)
    candidates: list[dict[str, Any]] = []
    for path in (audit_payload.get("samples") or {}).get("claims_without_evidence") or []:
        candidates.append(
            {
                "candidate_type": "claim_without_evidence",
                "pages": [path],
                "why_it_may_conflict": "A claim without supporting evidence can mislead synthesis or retrieval until evidence is linked.",
                "required_review": "Attach source-grounded evidence or demote the claim to candidate status.",
                "safe_publish_plan": "Add needs_source_recheck marker only after linted refinement.",
            }
        )
    for group in (audit_payload.get("samples") or {}).get("duplicate_alias_groups") or []:
        pages = list(group.get("pages") or []) if isinstance(group, dict) else []
        if pages:
            candidates.append(
                {
                    "candidate_type": "duplicate_method_or_topic_alias",
                    "pages": pages,
                    "alias": group.get("alias"),
                    "why_it_may_conflict": "Near-identical aliases can split retrieval and produce conflicting compiled summaries.",
                    "required_review": "Decide whether this is a real semantic duplicate or a legitimate domain distinction.",
                    "safe_publish_plan": "Record merge proposal; do not automatically merge pages.",
                }
            )
    for page in sorted((wiki_root / "papers").glob("*.md")):
        fm = parse_frontmatter(page.read_text(encoding="utf-8"))
        if str(fm.get("review_state") or "") == "source_quality_hold" or str(fm.get("quality_state") or "") == "source_quality_hold":
            candidates.append(
                {
                    "candidate_type": "source_quality_hold",
                    "pages": [page.relative_to(wiki_root).as_posix()],
                    "why_it_may_conflict": "This source should not support scientific evidence until source extraction is repaired.",
                    "required_review": "Check downstream claim/evidence/synthesis pages for accidental use as evidence.",
                    "safe_publish_plan": "Keep as cleanup/provenance warning; do not promote content.",
                }
            )

    manifest = {
        "schema_version": CONTRADICTION_REVIEW_SCHEMA_VERSION,
        "created_at": created_at,
        "wiki_root": str(wiki_root),
        "proposal_id": proposal_id,
        "status": "proposal",
        "audit_path": str(audit.report_path),
        "candidate_count": len(candidates),
        "candidates": candidates,
        "policy": "Conservative candidate generation only; no contradiction is canonical until source-aware review publishes a refinement.",
    }
    manifest_path = proposal_dir / "contradiction-review.json"
    _write_json(manifest_path, manifest)
    (proposal_dir / "contradiction-review.md").write_text(_render_contradiction_review(manifest), encoding="utf-8")
    return ContradictionReviewResult(proposal_dir=proposal_dir, manifest_path=manifest_path, candidate_count=len(candidates))


def build_obsidian_navigation(*, wiki_root: Path, out_path: Path | None = None) -> NavigationBuildResult:
    init_wiki_vault(wiki_root=wiki_root)
    pages = {
        "Map of Content.md": _render_map_of_content(wiki_root),
        "Paper Index.md": _render_directory_index(wiki_root, directory="papers", heading="Paper Index", limit=500),
        "Method Index.md": _render_directory_index(wiki_root, directory="methods", heading="Method Index", limit=500),
        "Topic Index.md": _render_directory_index(wiki_root, directory="topics", heading="Topic Index", limit=500),
        "Concept Index.md": _render_directory_index(wiki_root, directory="concepts", heading="Concept Index", limit=500),
        "Synthesis Index.md": _render_directory_index(wiki_root, directory="syntheses", heading="Synthesis Index", limit=500),
        "Claim Evidence Index.md": _render_claim_evidence_index(wiki_root),
    }
    written = []
    for name, text in pages.items():
        path = wiki_root / name
        path.write_text(text, encoding="utf-8")
        written.append(path)
    manifest = {
        "schema_version": NAVIGATION_SCHEMA_VERSION,
        "created_at": _now(),
        "wiki_root": str(wiki_root),
        "pages": [path.relative_to(wiki_root).as_posix() for path in written],
    }
    manifest_path = out_path or wiki_root / ".index/obsidian-navigation.json"
    _write_json(manifest_path, manifest)
    append_wiki_log(
        wiki_root=wiki_root,
        action="navigation",
        title="Obsidian navigation pages",
        lines=[f"Updated `{path.relative_to(wiki_root)}`" for path in written],
    )
    return NavigationBuildResult(manifest_path=manifest_path, pages=written)


def final_product_check(*, wiki_root: Path, out_path: Path | None = None, brief_path: Path | None = None) -> FinalProductCheckResult:
    init_wiki_vault(wiki_root=wiki_root)
    audit = run_knowledge_audit(wiki_root=wiki_root)
    counts = {directory: len(list((wiki_root / directory).glob("*.md"))) for directory in CANONICAL_DIRS}
    navigation_pages = ["Map of Content.md", "Paper Index.md", "Method Index.md", "Topic Index.md", "Concept Index.md", "Synthesis Index.md", "Claim Evidence Index.md"]
    missing_navigation = [page for page in navigation_pages if not (wiki_root / page).exists()]
    papers_with_quality_state = 0
    source_quality_misuse = 0
    for page in sorted((wiki_root / "papers").glob("*.md")):
        fm = parse_frontmatter(page.read_text(encoding="utf-8"))
        if fm.get("quality_state") and fm.get("validation_state") and fm.get("trust_state"):
            papers_with_quality_state += 1
    synthesis_retrieval = retrieve_papers(
        query="I need a cross-paper synthesis overview with source facts, evidence boundaries, and supporting papers.",
        wiki_root=wiki_root,
        top_k=8,
        strategy="v1",
    )
    result_types = [str(item.get("result_type") or item.get("type") or "") for item in synthesis_retrieval.results]
    result_corpus_types = [str(item.get("corpus_type") or "") for item in synthesis_retrieval.results]
    findings: list[dict[str, Any]] = []
    if counts.get("syntheses", 0) == 0:
        findings.append(_finding("error", "no_syntheses", "Final LLM Wiki needs durable synthesis pages."))
    if missing_navigation:
        findings.append(_finding("error", "missing_navigation_pages", "Obsidian navigation pages are missing.", pages=missing_navigation))
    if papers_with_quality_state < counts.get("papers", 0):
        findings.append(_finding("warn", "paper_quality_state_incomplete", "Some paper pages lack final quality-state fields."))
    if not any(item.startswith("syntheses") for item in result_corpus_types) and counts.get("syntheses", 0) > 0:
        findings.append(_finding("warn", "retrieval_not_synthesis_first", "Overview retrieval did not surface synthesis pages."))
    audit_payload = _read_json(audit.report_path)
    source_quality_misuse = int((audit_payload.get("metrics") or {}).get("source_quality_misuse") or 0)
    if source_quality_misuse:
        findings.append(_finding("error", "source_quality_contamination", "Source-quality holds appear to be used as evidence."))

    metrics = {
        "counts": counts,
        "papers_with_quality_state": papers_with_quality_state,
        "navigation_pages_missing": len(missing_navigation),
        "retrieval_result_types": result_types,
        "retrieval_corpus_types": result_corpus_types,
        "knowledge_audit_status": audit.status,
        "knowledge_audit_metrics": audit.metrics,
    }
    status = "fail" if any(item["severity"] == "error" for item in findings) else "warn" if findings or audit.status == "warn" else "pass"
    payload = {
        "schema_version": FINAL_CHECK_SCHEMA_VERSION,
        "created_at": _now(),
        "wiki_root": str(wiki_root),
        "status": status,
        "metrics": metrics,
        "findings": findings,
    }
    report_path = out_path or wiki_root / ".index/final-product-check.json"
    _write_json(report_path, payload)
    effective_brief = brief_path or Path("docs/final-llm-wiki-product-quality-brief.md")
    effective_brief.parent.mkdir(parents=True, exist_ok=True)
    effective_brief.write_text(_render_final_product_brief(payload), encoding="utf-8")
    return FinalProductCheckResult(
        report_path=report_path,
        brief_path=effective_brief,
        status=status,
        metrics=metrics,
        findings=findings,
    )


def _derive_quality_states(fm: dict[str, Any]) -> tuple[str, str, str]:
    review_state = str(fm.get("review_state") or "").lower()
    quality_gate = str(fm.get("quality_gate") or "").lower()
    source_quality = str(fm.get("source_quality") or "").lower()
    source_quality_risk = str(fm.get("source_quality_risk") or "").lower()
    if "source_quality_hold" in {review_state, quality_gate, source_quality} or source_quality == "source_text_insufficient" or source_quality_risk == "true":
        return "source_quality_hold", "needs_source_recheck", "untrusted_source_text"
    if review_state == "human_reviewed":
        return "human_reviewed", "human_reviewed", "source_grounded_reviewed"
    if review_state == "judge_reviewed":
        return "judge_reviewed", "judge_reviewed", "source_grounded_judged"
    if review_state in {"stale", "superseded", "needs_source_recheck"}:
        return review_state, review_state, "requires_review"
    if quality_gate == "pass":
        return "text_converged", "text_converged", "source_grounded_text"
    return "multimodal_pending", "text_converged", "source_grounded_text"


def _frontmatter_needs_patch(fm: dict[str, Any], patch: dict[str, Any]) -> bool:
    return any(str(fm.get(key) or "") != str(value) for key, value in patch.items())


def _upsert_scalar_frontmatter_fields(text: str, patch: dict[str, Any]) -> str:
    if not text.startswith("---\n"):
        lines = ["---", *[f'{key}: "{_escape(str(value))}"' for key, value in patch.items()], "---", text]
        return "\n".join(lines)
    lines = text.splitlines()
    if len(lines) < 2:
        return text
    close_index = next((index for index, line in enumerate(lines[1:], start=1) if line == "---"), None)
    if close_index is None:
        return text
    seen: set[str] = set()
    new_lines = []
    for index, line in enumerate(lines):
        if 0 < index < close_index and ":" in line and not line.startswith("  - "):
            key = line.split(":", 1)[0].strip()
            if key in patch:
                new_lines.append(_format_scalar_line(key, patch[key]))
                seen.add(key)
                continue
        if index == close_index:
            for key, value in patch.items():
                if key not in seen:
                    new_lines.append(_format_scalar_line(key, value))
        new_lines.append(line)
    return "\n".join(new_lines).rstrip() + "\n"


def _format_scalar_line(key: str, value: Any) -> str:
    if isinstance(value, bool):
        return f"{key}: {str(value).lower()}"
    if isinstance(value, int):
        return f"{key}: {value}"
    return f'{key}: "{_escape(str(value))}"'


def _synthesis_candidates(*, wiki_root: Path, max_items: int) -> list[dict[str, str]]:
    method_pages = _rank_pages_for_synthesis(_load_pages(wiki_root, directory="methods"))
    topic_pages = _rank_pages_for_synthesis(_load_pages(wiki_root, directory="topics"))
    candidates: list[dict[str, str]] = []
    for page in method_pages[: max(1, max_items)]:
        title = f"{page['title'].title()} Method Family Synthesis"
        candidates.append(
            {
                "title": title,
                "proposal_type": "method-family",
                "query": f"I need a cross-paper method-family synthesis for {page['title']} with mechanism, implementation hooks, evidence boundaries, and failure modes.",
                "user_note": "Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.",
            }
        )
    for page in topic_pages[: max(1, max_items)]:
        title = f"{page['title'].title()} Topic Overview"
        candidates.append(
            {
                "title": title,
                "proposal_type": "synthesis",
                "query": f"I need a topic overview for {page['title']} that connects key papers, method families, claims, evidence, and open questions.",
                "user_note": "Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.",
            }
        )
    candidates.extend(_scenario_synthesis_candidates())
    if not candidates:
        candidates.append(
            {
                "title": "Paper Wiki Cross-Paper Synthesis Seed",
                "proposal_type": "synthesis",
                "query": "I need a cross-paper synthesis that links methods, topics, evidence, and uncertainty across the current wiki.",
                "user_note": "Fallback synthesis seed because no compiled method/topic pages were available.",
            }
        )
    existing_targets = {path.stem for path in (wiki_root / "syntheses").glob("*.md")}
    new_candidates = [candidate for candidate in candidates if slugify(candidate["title"]) not in existing_targets]
    existing_candidates = [candidate for candidate in candidates if slugify(candidate["title"]) in existing_targets]
    return (new_candidates + existing_candidates)[:max_items]


def _scenario_synthesis_candidates() -> list[dict[str, str]]:
    """Canonical product-maturity synthesis shapes beyond topic/method pages."""
    return [
        {
            "title": "Activation Outlier Quantization Evidence Map",
            "proposal_type": "synthesis",
            "query": "I need an evidence map for activation outliers in low-bit LLM quantization, including which papers support smoothing, scaling, routing, and error-propagation claims.",
            "user_note": "Seeded to cover the evidence-map synthesis type for quantization and compression research use.",
        },
        {
            "title": "KV-Cache Compression Failure Boundary Summary",
            "proposal_type": "synthesis",
            "query": "I need a failure-boundary synthesis for KV-cache compression and long-context inference: retention policy, attention sinks, bandwidth limits, and what checks prevent misleading speedups.",
            "user_note": "Seeded to cover the limitation and failure-boundary synthesis type for long-context systems.",
        },
        {
            "title": "Speculative Decoding Probe Planning Page",
            "proposal_type": "research-question",
            "query": "I want to design probes and ablations for speculative decoding, including acceptance rate, draft-target mismatch, verification cost, and dynamic draft tree tradeoffs.",
            "user_note": "Seeded to cover implementation/probe planning for a coding-heavy research workflow.",
        },
        {
            "title": "Preference Optimization Evidence And Drift Question",
            "proposal_type": "research-question",
            "query": "I need to compare preference optimization, RLHF, reward modeling, and test-time RL evidence while tracking KL drift, preference data underspecification, and reward overoptimization.",
            "user_note": "Seeded to cover a cross-paper research-question page for preference optimization.",
        },
        {
            "title": "PDE Residual Scientific ML Implementation Checks",
            "proposal_type": "synthesis",
            "query": "I need an implementation-check synthesis for scientific ML and PINN papers covering PDE residuals, boundary conditions, collocation points, and source-grounded sanity checks.",
            "user_note": "Seeded to cover implementation checks for scientific ML rather than quantization-only workflows.",
        },
        {
            "title": "Clustering Objective Representation Probe Plan",
            "proposal_type": "synthesis",
            "query": "I need a probe-planning synthesis for clustering and representation-learning papers, connecting k-means objective landscape, centroid assignment stability, and representation collapse.",
            "user_note": "Seeded to cover cross-domain analogy and probe planning for classical ML plus representation learning.",
        },
        {
            "title": "Agent Workflow Tool-State Grounding Overview",
            "proposal_type": "synthesis",
            "query": "I need a topic overview for agent workflow and tool-use papers that focuses on tool-state grounding, traceability, speculative action execution, and evaluation failure modes.",
            "user_note": "Seeded to cover agent/tool-use synthesis rather than paper-only retrieval.",
        },
        {
            "title": "Diffusion Conditioning Representation Synthesis",
            "proposal_type": "synthesis",
            "query": "I need a cross-paper synthesis for conditional diffusion, semantic image synthesis, and representation learning that separates conditioning signal, fidelity, diversity, and representation-collapse checks.",
            "user_note": "Seeded to cover vision/diffusion representation synthesis.",
        },
    ]


def _rank_pages_for_synthesis(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        [page for page in pages if page["knowledge_role"] == "compiled_method" or page["directory"] == "topics"],
        key=lambda page: (-len(_as_list(page["frontmatter"].get("source_papers") or page["frontmatter"].get("related_papers"))), page["title"].lower()),
    )


def _synthesis_body(candidate: dict[str, str]) -> str:
    title = candidate["title"]
    query = candidate["query"]
    proposal_type = candidate["proposal_type"]
    if proposal_type == "method-family":
        thesis = "This page should consolidate a method family across papers: what the mechanism actually changes, what implementation choices matter, which evidence is comparable, and where the family fails."
        checks = [
            "Identify the shared mechanism before listing paper-specific variants.",
            "Preserve implementation hooks that affect ablations or probes.",
            "Separate evidence that supports the mechanism from evidence that only supports one paper's setting.",
        ]
    elif proposal_type == "research-question":
        thesis = "This page should preserve an active research question: what the wiki already supports, which mechanisms are plausible, which failure modes must be checked, and what experiment would reduce uncertainty next."
        checks = [
            "Turn retrieved snippets into a testable hypothesis only when provenance supports it.",
            "Name the weakest link: missing evidence, unclear scope, or implementation uncertainty.",
            "List the next probe or ablation that would change the decision.",
        ]
    elif "evidence" in title.lower():
        thesis = "This page should act as an evidence map: claims, supporting observations, contradicting or weak evidence, and source-quality boundaries."
        checks = [
            "Do not treat retrieval adjacency as evidence.",
            "Tie every preserved claim to at least one source page or evidence record.",
            "Keep unsupported generalizations in Open Questions.",
        ]
    elif "failure" in title.lower() or "boundary" in title.lower():
        thesis = "This page should capture boundary conditions: where the mechanism is expected to work, what breaks it, and which checks prevent false confidence."
        checks = [
            "Prefer failure modes and scope conditions over broad success claims.",
            "Keep system/cost claims separate from accuracy or scientific claims.",
            "Name the minimal check that would catch the failure in an implementation.",
        ]
    else:
        thesis = "This page should become a dense cross-paper synthesis: the recurring mechanism, the useful distinctions, the evidence map, and the open decisions that matter for future retrieval."
        checks = [
            "Compress repeated paper summaries into one cross-paper interpretation.",
            "Preserve source facts separately from the wiki's synthesis.",
            "Add retrieval hooks that match realistic research or coding intents.",
        ]
    return "\n".join(
        [
            f"- Working synthesis target: {thesis}",
            f"- Intended use: {query}",
            "- Source-fact boundary: use the retrieved `Source Facts` section for directly supported statements; keep this section as compiled wiki interpretation.",
            "- Review contract:",
            *[f"  - {item}" for item in checks],
            "- Retrieval contract: future queries should be able to decide whether to read a method/topic/concept page first, which source papers to inspect next, and which uncertainty blocks a research decision.",
        ]
    )


def _render_synthesis_batch(manifest: dict[str, Any]) -> str:
    lines = [
        f"# Synthesis Growth Batch: {manifest['batch_id']}",
        "",
        "This batch creates proposal-first synthesis scaffolds from canonical retrieval context.",
        "",
        "## Proposals",
        "",
    ]
    for item in manifest.get("proposals") or []:
        lines.append(f"- `{item['proposal_type']}` [[{Path(item['publish_target']).with_suffix('').as_posix()}|{item['title']}]]")
        lines.append(f"  - Query: {item['query']}")
        lines.append(f"  - Manifest: `{item['proposal_manifest']}`")
    return "\n".join(lines).rstrip() + "\n"


def _load_pages(wiki_root: Path, *, directory: str) -> list[dict[str, Any]]:
    pages = []
    for path in sorted((wiki_root / directory).glob("*.md")):
        text = path.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        body = strip_frontmatter(text)
        relative = path.relative_to(wiki_root).as_posix()
        page_type = str(fm.get("type") or directory.rstrip("s"))
        knowledge_role = "source_page"
        if directory == "methods" and re.search(r"-method-\d+$", path.stem):
            knowledge_role = "paper_method_candidate"
        elif directory == "methods":
            knowledge_role = "compiled_method"
        elif directory in {"topics", "claims", "evidence", "syntheses"}:
            knowledge_role = "compiled_knowledge"
        pages.append(
            {
                "path": path,
                "relative_path": relative,
                "page_id": path.relative_to(wiki_root).with_suffix("").as_posix(),
                "directory": directory,
                "title": str(fm.get("title") or path.stem),
                "type": page_type,
                "frontmatter": fm,
                "body": body,
                "sections": split_sections(body),
                "knowledge_role": knowledge_role,
            }
        )
    return pages


def _best_method_family(candidate: dict[str, Any], compiled: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, int, list[str]]:
    candidate_text = _norm(
        " ".join(
            [
                candidate["title"],
                json.dumps(candidate["frontmatter"], ensure_ascii=False),
                candidate["body"][:1500],
            ]
        )
    )
    best: tuple[dict[str, Any] | None, int, list[str]] = (None, 0, [])
    for page in compiled:
        evidence = []
        score = 0
        title = _norm(page["title"])
        if title and title in candidate_text:
            score += 4
            evidence.append("target title appears in candidate text")
        for item in _as_list(page["frontmatter"].get("related_topics")) + _as_list(page["frontmatter"].get("aliases")):
            token = _norm(str(item))
            if token and token in candidate_text:
                score += 1
                evidence.append(f"shared routing term: {item}")
        for paper in _as_list(page["frontmatter"].get("source_papers")) + _as_list(page["frontmatter"].get("related_papers")):
            paper_stem = Path(str(paper)).stem.lower()
            if paper_stem and paper_stem in candidate["relative_path"].lower():
                score += 2
                evidence.append(f"shared source paper: {paper}")
        if score > best[1]:
            best = (page, score, evidence[:6])
    return best


def _render_method_consolidation(manifest: dict[str, Any]) -> str:
    lines = [
        f"# Method-Family Consolidation: {manifest['proposal_id']}",
        "",
        f"- Candidate records: {manifest['candidate_count']}",
        f"- Grouped candidates: {manifest['grouped_count']}",
        f"- High-risk / unresolved candidates: {manifest['high_risk_count']}",
        "",
        "## Low-Risk Groupings",
        "",
    ]
    for item in manifest.get("groups") or []:
        lines.append(f"- `{item['candidate']}` -> `{item['target_method']}` ({item['target_title']}); score `{item['match_score']}`")
    lines.extend(["", "## High-Risk Items", ""])
    for item in manifest.get("high_risk_items") or []:
        lines.append(f"- `{item['candidate']}`: {item['reason']}")
    return "\n".join(lines).rstrip() + "\n"


def _render_contradiction_review(manifest: dict[str, Any]) -> str:
    lines = [
        f"# Contradiction / Stale Candidate Review: {manifest['proposal_id']}",
        "",
        "This is conservative candidate generation. It does not publish contradictions.",
        "",
        "## Candidates",
        "",
    ]
    for item in manifest.get("candidates") or []:
        pages = ", ".join(f"`{page}`" for page in item.get("pages") or [])
        lines.append(f"- `{item['candidate_type']}`: {pages}")
        lines.append(f"  - Why it may conflict: {item['why_it_may_conflict']}")
        lines.append(f"  - Required review: {item['required_review']}")
    if not manifest.get("candidates"):
        lines.append("- No conservative candidates found.")
    return "\n".join(lines).rstrip() + "\n"


def _render_map_of_content(wiki_root: Path) -> str:
    counts = {directory: len(list((wiki_root / directory).glob("*.md"))) for directory in CANONICAL_DIRS}
    return "\n".join(
        [
            "---",
            'type: "navigation"',
            'title: "Map of Content"',
            f'updated: "{datetime.now(timezone.utc).date().isoformat()}"',
            "---",
            "# Map of Content",
            "",
            "## Daily Entry Points",
            "",
            "- [[Paper Index]] - source-grounded paper pages.",
            "- [[Method Index]] - compiled method families and paper-specific candidates.",
            "- [[Topic Index]] - research topics and paper clusters.",
            "- [[Concept Index]] - preliminary knowledge for implementation, debugging, probes, and ablations.",
            "- [[Synthesis Index]] - durable cross-paper synthesis pages.",
            "- [[Claim Evidence Index]] - claim/evidence traceability overview.",
            "- [[raw/sources/index|Source Index]] - managed immutable PDF registry.",
            "",
            "## Current Graph",
            "",
            f"- Papers: {counts['papers']}",
            f"- Methods: {counts['methods']}",
            f"- Topics: {counts['topics']}",
            f"- Claims: {counts['claims']}",
            f"- Evidence: {counts['evidence']}",
            f"- Syntheses: {counts['syntheses']}",
            "",
            "## Operating Boundary",
            "",
            "- Canonical pages under `papers/`, `methods/`, `topics/`, `claims/`, `evidence/`, and `syntheses/` are the user-facing wiki.",
            "- `.drafts/` and `.versions/` are audit and evolution infrastructure, not daily reading entry points.",
        ]
    ).rstrip() + "\n"


def _render_directory_index(wiki_root: Path, *, directory: str, heading: str, limit: int) -> str:
    lines = [
        "---",
        'type: "navigation"',
        f'title: "{heading}"',
        f'updated: "{datetime.now(timezone.utc).date().isoformat()}"',
        "---",
        f"# {heading}",
        "",
    ]
    pages = sorted((wiki_root / directory).glob("*.md"))
    if not pages:
        lines.append("- None yet.")
    for path in pages[:limit]:
        fm = parse_frontmatter(path.read_text(encoding="utf-8"))
        title = str(fm.get("title") or path.stem)
        role = fm.get("review_state") or fm.get("quality_state") or fm.get("status") or ""
        lines.append(f"- [[{directory}/{path.stem}|{title}]]" + (f" - `{role}`" if role else ""))
    if len(pages) > limit:
        lines.append(f"- ... {len(pages) - limit} more pages omitted from this navigation index.")
    return "\n".join(lines).rstrip() + "\n"


def _render_claim_evidence_index(wiki_root: Path) -> str:
    claims = sorted((wiki_root / "claims").glob("*.md"))
    evidence = sorted((wiki_root / "evidence").glob("*.md"))
    lines = [
        "---",
        'type: "navigation"',
        'title: "Claim Evidence Index"',
        f'updated: "{datetime.now(timezone.utc).date().isoformat()}"',
        "---",
        "# Claim Evidence Index",
        "",
        f"- Claims: {len(claims)}",
        f"- Evidence records: {len(evidence)}",
        "",
        "## Claim Samples",
        "",
    ]
    for path in claims[:120]:
        fm = parse_frontmatter(path.read_text(encoding="utf-8"))
        title = str(fm.get("title") or path.stem)
        lines.append(f"- [[claims/{path.stem}|{title}]]")
    lines.extend(["", "## Evidence Samples", ""])
    for path in evidence[:120]:
        fm = parse_frontmatter(path.read_text(encoding="utf-8"))
        title = str(fm.get("title") or path.stem)
        lines.append(f"- [[evidence/{path.stem}|{title}]]")
    return "\n".join(lines).rstrip() + "\n"


def _render_final_product_brief(payload: dict[str, Any]) -> str:
    metrics = payload["metrics"]
    counts = metrics["counts"]
    lines = [
        "# Final LLM Wiki Product Quality Brief",
        "",
        f"- Generated: `{payload['created_at']}`",
        f"- Status: `{payload['status']}`",
        "",
        "## Canonical Corpus",
        "",
    ]
    for key in CANONICAL_DIRS:
        lines.append(f"- {key}: {counts.get(key, 0)}")
    lines.extend(
        [
            "",
            "## Quality-State Coverage",
            "",
            f"- Papers with final quality-state fields: {metrics['papers_with_quality_state']} / {counts.get('papers', 0)}",
            f"- Missing navigation pages: {metrics['navigation_pages_missing']}",
            f"- Retrieval result types for synthesis overview smoke: {', '.join(metrics['retrieval_result_types']) or 'none'}",
            f"- Knowledge audit status: `{metrics['knowledge_audit_status']}`",
            "",
            "## Residual Findings",
            "",
        ]
    )
    if payload.get("findings"):
        for finding in payload["findings"]:
            lines.append(f"- `{finding['severity']}` `{finding['code']}`: {finding['message']}")
    else:
        lines.append("- No final-product hard blockers found by deterministic checks.")
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "The deterministic check verifies the product shell: canonical pages, synthesis growth, retrieval visibility, quality-state semantics, navigation, and source-quality safety. It does not replace source-aware review of individual scientific claims.",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def _finding(severity: str, code: str, message: str, **extra: Any) -> dict[str, Any]:
    payload = {"severity": severity, "code": code, "message": message}
    payload.update(extra)
    return payload


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _relative_or_absolute(path: Path, wiki_root: Path) -> str:
    try:
        return path.relative_to(wiki_root).as_posix()
    except ValueError:
        return str(path)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value.lower())).strip()


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
