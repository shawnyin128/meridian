from __future__ import annotations

import hashlib
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
    split_sections,
    strip_frontmatter,
)
from meridian.wiki.vault import append_wiki_log, rebuild_wiki_index, slugify


KNOWLEDGE_AUDIT_SCHEMA_VERSION = "meridian.knowledge_audit.v1"
KNOWLEDGE_REPAIR_SCHEMA_VERSION = "meridian.knowledge_repair.v1"
KNOWLEDGE_REPAIR_LINT_SCHEMA_VERSION = "meridian.knowledge_repair_lint.v1"
KNOWLEDGE_REPAIR_PUBLISH_SCHEMA_VERSION = "meridian.knowledge_repair_publish.v1"

KNOWLEDGE_DIRS = ("methods", "topics", "claims", "evidence", "concepts", "syntheses")
CANONICAL_DIRS = ("papers", "methods", "topics", "claims", "evidence", "concepts", "syntheses")

REQUIRED_FRONTMATTER = {
    "method": ("type", "title", "status", "sources", "source_papers", "related_papers", "related_topics", "confidence", "review_state", "evolution_state", "revision_id"),
    "topic": ("type", "title", "status", "sources", "source_papers", "related_papers", "related_methods", "confidence", "review_state", "evolution_state", "revision_id"),
    "claim": ("type", "title", "status", "sources", "source_papers", "supports", "contradicts", "confidence", "review_state", "evolution_state", "revision_id"),
    "evidence": ("type", "title", "status", "sources", "source_papers", "supports", "confidence", "review_state", "evolution_state", "revision_id"),
    "concept": ("type", "title", "status", "sources", "source_papers", "related_methods", "related_topics", "prerequisite_for", "confidence", "review_state", "evolution_state", "revision_id"),
    "synthesis": ("type", "title", "status", "sources", "source_papers", "related_papers", "related_methods", "related_topics", "confidence", "review_state", "evolution_state", "revision_id"),
}

REQUIRED_SECTIONS = {
    "method": ("What It Is", "Mechanism", "Used By Papers", "Implementation Hooks", "Failure Modes", "Evidence", "Open Questions"),
    "topic": ("Scope", "Key Papers", "Method Families", "Claims", "Contradictions", "Retrieval Hooks"),
    "claim": ("Claim", "Supporting Evidence", "Contradicting Evidence", "Scope", "Confidence", "Provenance"),
    "evidence": ("Evidence Item", "Source", "Metric or Observation", "Supports", "Limits", "Reliability"),
    "concept": ("What It Is", "Why It Matters", "Where It Appears", "Used By Methods", "Implementation Implications", "Common Failure Modes", "Minimal Checks / Probes", "Evidence / Provenance", "Related Concepts", "Open Questions", "Retrieval Hooks"),
    "synthesis": ("Source Facts", "Wiki Synthesis", "User Ideas / Decisions", "Evidence Map", "Open Questions"),
}

LOW_RISK_ACTIONS = {
    "create_method_page",
    "create_topic_page",
    "enrich_method_page",
    "enrich_topic_page",
    "enrich_claim_page",
    "enrich_evidence_page",
    "update_frontmatter",
}


@dataclass(frozen=True)
class KnowledgeAuditResult:
    report_path: Path
    brief_path: Path
    status: str
    metrics: dict[str, Any]
    findings: list[dict[str, Any]]


@dataclass(frozen=True)
class KnowledgeRepairProposalResult:
    repair_dir: Path
    repair_path: Path
    manifest_path: Path
    publish_plan_path: Path
    deterministic_repairs: int
    high_risk_repairs: int


@dataclass(frozen=True)
class KnowledgeRepairLintResult:
    report_path: Path
    status: str
    findings: list[dict[str, Any]]


@dataclass(frozen=True)
class PublishKnowledgeRepairResult:
    manifest_path: Path
    lint_report_path: Path
    applied_actions: int
    skipped_actions: int
    index_path: Path
    log_path: Path


def run_knowledge_audit(*, wiki_root: Path, out_path: Path | None = None, brief_path: Path | None = None) -> KnowledgeAuditResult:
    pages = _load_pages(wiki_root)
    paper_pages = [page for page in pages if page["directory"] == "papers"]
    knowledge_pages = [page for page in pages if page["directory"] in KNOWLEDGE_DIRS]
    inbound_links = _inbound_links(paper_pages=paper_pages, knowledge_pages=knowledge_pages)
    findings: list[dict[str, Any]] = []
    counts = {directory: sum(1 for page in pages if page["directory"] == directory) for directory in CANONICAL_DIRS}

    low_info_pages = []
    orphan_pages = []
    missing_frontmatter_pages = []
    missing_section_pages = []
    claims_without_evidence = []
    evidence_without_provenance = []
    syntheses_without_sources = []
    syntheses_with_nonpaper_source_papers = []
    source_quality_misuse = []
    consolidated_method_candidates = []

    for page in knowledge_pages:
        consolidated_candidate = _is_consolidated_method_candidate(page)
        if consolidated_candidate:
            consolidated_method_candidates.append(page["relative_path"])
        page_type = page["type"]
        required_fields = _required_frontmatter_for_page(page)
        missing_fields = [field for field in required_fields if field not in page["frontmatter"]]
        if missing_fields and not consolidated_candidate:
            missing_frontmatter_pages.append(page["relative_path"])
            findings.append(_finding("warn", "missing_frontmatter_fields", page["relative_path"], missing=missing_fields))
        required_sections = _required_sections_for_page(page)
        missing_sections = [section for section in required_sections if section not in page["sections"]]
        if missing_sections and not consolidated_candidate:
            missing_section_pages.append(page["relative_path"])
            findings.append(_finding("warn", "missing_knowledge_sections", page["relative_path"], missing=missing_sections))
        if _is_low_information(page) and not consolidated_candidate:
            low_info_pages.append(page["relative_path"])
            findings.append(_finding("warn", "low_information_knowledge_page", page["relative_path"]))
        if (
            not consolidated_candidate
            and page["directory"] in {"methods", "topics", "claims", "evidence"}
            and inbound_links.get(page["page_id"], 0) == 0
            and not _page_has_related_paper(page)
        ):
            orphan_pages.append(page["relative_path"])
            findings.append(_finding("warn", "orphan_knowledge_page", page["relative_path"]))
        if page_type == "claim" and not _claim_has_evidence(page):
            claims_without_evidence.append(page["relative_path"])
            findings.append(_finding("warn", "claim_without_evidence", page["relative_path"]))
        if page_type == "evidence" and not _evidence_has_source_provenance(page):
            evidence_without_provenance.append(page["relative_path"])
            findings.append(_finding("warn", "evidence_without_source_provenance", page["relative_path"]))
        if page["directory"] == "syntheses" and not _as_list(page["frontmatter"].get("source_papers")):
            syntheses_without_sources.append(page["relative_path"])
            findings.append(_finding("warn", "synthesis_without_source_papers", page["relative_path"]))
        if page["directory"] == "syntheses":
            invalid_source_papers = [
                str(item)
                for item in _as_list(page["frontmatter"].get("source_papers"))
                if not str(item).startswith("papers/")
            ]
            if invalid_source_papers:
                syntheses_with_nonpaper_source_papers.append(page["relative_path"])
                findings.append(
                    _finding(
                        "warn",
                        "synthesis_source_papers_contains_nonpaper_pages",
                        page["relative_path"],
                        sources=invalid_source_papers[:10],
                    )
                )
        if _uses_source_quality_hold_as_evidence(page):
            source_quality_misuse.append(page["relative_path"])
            findings.append(_finding("error", "source_quality_hold_as_evidence", page["relative_path"]))

    paper_without_outbound = [
        page["relative_path"]
        for page in paper_pages
        if not re.search(r"\[\[(methods|topics|claims|evidence)/", page["body"])
    ]
    for relative in paper_without_outbound[:50]:
        findings.append(_finding("info", "paper_missing_knowledge_outbound_links", relative))

    duplicates = _duplicate_alias_groups([page for page in knowledge_pages if not _is_consolidated_method_candidate(page)])
    for group in duplicates:
        findings.append(_finding("warn", "duplicate_method_or_topic_alias", ",".join(group["pages"]), alias=group["alias"]))

    metrics = {
        "counts": counts,
        "low_information_pages": len(low_info_pages),
        "paper_without_outbound_links": len(paper_without_outbound),
        "orphan_knowledge_pages": len(orphan_pages),
        "method_topic_without_inbound_paper_links": sum(
            1
            for page in knowledge_pages
            if page["directory"] in {"methods", "topics"} and inbound_links.get(page["page_id"], 0) == 0 and not _page_has_related_paper(page)
        ),
        "claims_without_evidence": len(claims_without_evidence),
        "evidence_without_source_provenance": len(evidence_without_provenance),
        "syntheses_without_source_papers": len(syntheses_without_sources),
        "syntheses_with_nonpaper_source_papers": len(syntheses_with_nonpaper_source_papers),
        "duplicate_method_topic_alias_groups": len(duplicates),
        "source_quality_misuse": len(source_quality_misuse),
        "consolidated_method_candidate_records": len(consolidated_method_candidates),
        "pages_with_required_section_gaps": len(missing_section_pages),
        "pages_with_frontmatter_gaps": len(missing_frontmatter_pages),
    }
    status = "fail" if any(item["severity"] == "error" for item in findings) else "warn" if findings else "pass"
    payload = {
        "schema_version": KNOWLEDGE_AUDIT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "wiki_root": str(wiki_root),
        "status": status,
        "metrics": metrics,
        "findings": findings,
        "samples": {
            "low_information_pages": low_info_pages[:25],
            "paper_without_outbound_links": paper_without_outbound[:25],
            "orphan_knowledge_pages": orphan_pages[:25],
            "claims_without_evidence": claims_without_evidence[:25],
            "evidence_without_source_provenance": evidence_without_provenance[:25],
            "syntheses_without_source_papers": syntheses_without_sources[:25],
            "syntheses_with_nonpaper_source_papers": syntheses_with_nonpaper_source_papers[:25],
            "duplicate_alias_groups": duplicates[:10],
            "consolidated_method_candidate_records": consolidated_method_candidates[:25],
        },
    }
    report_path = out_path or wiki_root / ".index/knowledge-audit.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    effective_brief_path = brief_path or Path("docs/knowledge-layer-quality-audit.md")
    effective_brief_path.parent.mkdir(parents=True, exist_ok=True)
    effective_brief_path.write_text(_render_audit_brief(payload), encoding="utf-8")
    return KnowledgeAuditResult(report_path=report_path, brief_path=effective_brief_path, status=status, metrics=metrics, findings=findings)


def propose_knowledge_repair(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    audit_path: Path | None = None,
    overwrite: bool = False,
) -> KnowledgeRepairProposalResult:
    if audit_path is None or not audit_path.exists():
        audit_result = run_knowledge_audit(wiki_root=wiki_root)
        audit_path = audit_result.report_path
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    pages = _load_pages(wiki_root)
    paper_pages = [page for page in pages if page["directory"] == "papers"]
    existing_page_ids = {page["page_id"] for page in pages}
    created_at = datetime.now(timezone.utc).isoformat()
    repair_id = f"knowledge-repair-{created_at[:10]}-{_short_hash(str(audit.get('metrics')))}"
    repair_dir = out_dir or wiki_root / ".drafts/knowledge-repair" / repair_id
    if repair_dir.exists() and any(repair_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"knowledge repair directory already exists: {repair_dir}")
    repair_dir.mkdir(parents=True, exist_ok=True)

    deterministic: list[dict[str, Any]] = []
    high_risk: list[dict[str, Any]] = []

    for paper in paper_pages:
        for method in _as_list(paper["frontmatter"].get("methods")):
            path = wiki_root / "methods" / f"{slugify(str(method))}.md"
            if path.relative_to(wiki_root).with_suffix("").as_posix() not in existing_page_ids:
                deterministic.append(_create_method_action(method=str(method), path=path, paper=paper, wiki_root=wiki_root))
        for topic in _as_list(paper["frontmatter"].get("topics")):
            path = wiki_root / "topics" / f"{slugify(str(topic))}.md"
            if path.relative_to(wiki_root).with_suffix("").as_posix() not in existing_page_ids:
                deterministic.append(_create_topic_action(topic=str(topic), path=path, paper=paper, wiki_root=wiki_root))

    structured_targets: set[str] = set()
    for page in pages:
        if page["directory"] not in {"methods", "topics"}:
            continue
        if "-method-" in Path(page["relative_path"]).stem:
            if _is_low_information(page):
                high_risk.append(_high_risk_action("paper_specific_method_synthesis", page, "Paper-specific method candidate needs source-aware synthesis before canonical rewrite."))
            continue
        if page["type"] == "method" and _method_needs_safe_enrichment(page):
            deterministic.append(_enrich_method_action(page=page, wiki_root=wiki_root))
            structured_targets.add(page["relative_path"])
        if page["type"] == "topic" and _topic_needs_safe_enrichment(page):
            deterministic.append(_enrich_topic_action(page=page, wiki_root=wiki_root))
            structured_targets.add(page["relative_path"])

    for page in pages:
        if page["directory"] == "claims" and _claim_needs_safe_enrichment(page):
            deterministic.append(_enrich_claim_action(page=page))
            structured_targets.add(page["relative_path"])
        if page["directory"] == "evidence" and _evidence_needs_safe_enrichment(page):
            deterministic.append(_enrich_evidence_action(page=page))
            structured_targets.add(page["relative_path"])

    for page in pages:
        if (
            page["relative_path"] not in structured_targets
            and page["directory"] in KNOWLEDGE_DIRS
            and (_frontmatter_gaps(page) or _source_papers_need_normalization(page))
        ):
            deterministic.append(_frontmatter_action(page=page, wiki_root=wiki_root))

    manifest = {
        "schema_version": KNOWLEDGE_REPAIR_SCHEMA_VERSION,
        "created_at": created_at,
        "updated_at": created_at,
        "repair_id": repair_id,
        "wiki_root": str(wiki_root),
        "audit_path": str(audit_path),
        "status": "draft",
        "publish_state": "draft",
        "repair_path": str(repair_dir / "repair.md"),
        "publish_plan_path": str(repair_dir / "publish_plan.md"),
        "deterministic_repairs": deterministic,
        "high_risk_repairs": high_risk,
        "policy": {
            "auto_publish_allowed": sorted(LOW_RISK_ACTIONS),
            "proposal_only": ["merge_pages", "change_claim_confidence", "declare_contradiction", "rewrite_synthesis", "promote_user_insight_to_source_claim"],
        },
    }
    manifest_path = repair_dir / "repair.json"
    repair_path = repair_dir / "repair.md"
    publish_plan_path = repair_dir / "publish_plan.md"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    repair_path.write_text(_render_repair_markdown(manifest), encoding="utf-8")
    publish_plan_path.write_text(_render_repair_publish_plan(manifest), encoding="utf-8")
    return KnowledgeRepairProposalResult(
        repair_dir=repair_dir,
        repair_path=repair_path,
        manifest_path=manifest_path,
        publish_plan_path=publish_plan_path,
        deterministic_repairs=len(deterministic),
        high_risk_repairs=len(high_risk),
    )


def lint_knowledge_repair(*, repair_manifest: Path, wiki_root: Path, out_path: Path | None = None) -> KnowledgeRepairLintResult:
    manifest = _load_manifest(repair_manifest)
    findings: list[dict[str, Any]] = []
    if manifest.get("schema_version") != KNOWLEDGE_REPAIR_SCHEMA_VERSION:
        findings.append(_finding("error", "schema_version", str(repair_manifest), message="manifest is not a Meridian knowledge repair proposal"))
    if manifest.get("status") != "draft" or manifest.get("publish_state") != "draft":
        findings.append(_finding("error", "publish_blocked", str(repair_manifest), message="repair proposal is not publishable draft state"))
    for label in ("repair_path", "publish_plan_path", "audit_path"):
        path = _resolve_path(manifest.get(label), base=repair_manifest.parent)
        if path is None or not path.exists():
            findings.append(_finding("error", "missing_artifact", str(path), field=label))
    for action in manifest.get("deterministic_repairs") or []:
        action_type = str(action.get("action_type") or "")
        if action_type not in LOW_RISK_ACTIONS:
            findings.append(_finding("error", "high_risk_action_in_deterministic_repairs", str(action.get("target_path") or ""), action_type=action_type))
        if action.get("risk") != "low":
            findings.append(_finding("error", "deterministic_repair_not_low_risk", str(action.get("target_path") or ""), action_type=action_type))
        target_path = _target_path(action, wiki_root=wiki_root)
        if action_type.startswith("create_") and target_path.exists():
            findings.append(_finding("warn", "create_target_already_exists", _relative_or_absolute(target_path, wiki_root)))
        if action_type in {"enrich_method_page", "enrich_topic_page", "update_frontmatter"} and not target_path.exists():
            findings.append(_finding("error", "update_target_missing", _relative_or_absolute(target_path, wiki_root)))
        if "source_quality_hold" in json.dumps(action).lower() and action_type not in {"update_frontmatter"}:
            findings.append(_finding("error", "source_quality_contamination_risk", _relative_or_absolute(target_path, wiki_root)))
    status = "fail" if any(item["severity"] == "error" for item in findings) else "pass"
    report = {
        "schema_version": KNOWLEDGE_REPAIR_LINT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "wiki_root": str(wiki_root),
        "repair_manifest": str(repair_manifest),
        "status": status,
        "findings": findings,
    }
    report_path = out_path or repair_manifest.parent / "knowledge-repair-lint.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return KnowledgeRepairLintResult(report_path=report_path, status=status, findings=findings)


def publish_knowledge_repair(*, repair_manifest: Path, wiki_root: Path) -> PublishKnowledgeRepairResult:
    lint = lint_knowledge_repair(repair_manifest=repair_manifest, wiki_root=wiki_root)
    if lint.status != "pass":
        raise ValueError(f"knowledge repair lint failed: {lint.report_path}")
    manifest = _load_manifest(repair_manifest)
    applied = 0
    skipped = 0
    for action in manifest.get("deterministic_repairs") or []:
        applied_now = _apply_low_risk_action(action=action, wiki_root=wiki_root)
        if applied_now:
            applied += 1
        else:
            skipped += 1
    now = datetime.now(timezone.utc).isoformat()
    manifest["status"] = "published"
    manifest["publish_state"] = "published_low_risk_repairs"
    manifest["published_at"] = now
    manifest["updated_at"] = now
    manifest["applied_actions"] = applied
    manifest["skipped_actions"] = skipped
    repair_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    index_path = rebuild_wiki_index(wiki_root=wiki_root)
    build_paper_catalog(wiki_root=wiki_root)
    build_synthesis_catalog(wiki_root=wiki_root)
    build_knowledge_catalogs(wiki_root=wiki_root)
    log_path = append_wiki_log(
        wiki_root=wiki_root,
        action="knowledge-repair",
        title=str(manifest.get("repair_id") or "knowledge repair"),
        lines=[
            f"Applied low-risk knowledge repairs: {applied}",
            f"Skipped repairs: {skipped}",
            f"High-risk proposal-only repairs: {len(manifest.get('high_risk_repairs') or [])}",
            f"Repair manifest: `{_relative_or_absolute(repair_manifest, wiki_root)}`",
        ],
    )
    return PublishKnowledgeRepairResult(
        manifest_path=repair_manifest,
        lint_report_path=lint.report_path,
        applied_actions=applied,
        skipped_actions=skipped,
        index_path=index_path,
        log_path=log_path,
    )


def _load_pages(wiki_root: Path) -> list[dict[str, Any]]:
    pages = []
    for directory in CANONICAL_DIRS:
        root = wiki_root / directory
        if not root.exists():
            continue
        for path in sorted(root.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            frontmatter = parse_frontmatter(text)
            body = strip_frontmatter(text)
            rel = path.relative_to(wiki_root).as_posix()
            pages.append(
                {
                    "path": path,
                    "relative_path": rel,
                    "page_id": Path(rel).with_suffix("").as_posix(),
                    "directory": directory,
                    "type": str(frontmatter.get("type") or directory.rstrip("s")),
                    "title": str(frontmatter.get("title") or path.stem),
                    "frontmatter": frontmatter,
                    "body": body,
                    "sections": split_sections(body),
                }
            )
    return pages


def _inbound_links(*, paper_pages: list[dict[str, Any]], knowledge_pages: list[dict[str, Any]]) -> dict[str, int]:
    inbound = {page["page_id"]: 0 for page in knowledge_pages}
    aliases = {page["page_id"]: {page["page_id"], page["relative_path"].removesuffix(".md")} for page in knowledge_pages}
    for paper in paper_pages:
        body = paper["body"]
        for page_id, candidates in aliases.items():
            if any(f"[[{candidate}" in body for candidate in candidates):
                inbound[page_id] += 1
    return inbound


def _is_low_information(page: dict[str, Any]) -> bool:
    if _is_compact_candidate_record(page):
        return False
    body = page["body"].strip()
    sections = page["sections"]
    if len(body) < 350:
        return True
    if set(sections).issubset({"Related Papers", "Wiki Graph Links", "Evolution Notes"}):
        return True
    schema_type = _schema_type(page)
    if schema_type in REQUIRED_SECTIONS:
        present = sum(1 for section in REQUIRED_SECTIONS[schema_type] if section in sections and len(sections[section].strip()) > 40)
        return present < max(2, min(4, len(REQUIRED_SECTIONS[schema_type]) // 2))
    return False


def _is_consolidated_method_candidate(page: dict[str, Any]) -> bool:
    if page["directory"] != "methods" or page["type"] != "method":
        return False
    fm = page["frontmatter"]
    return (
        str(fm.get("retrieval_visibility") or "").lower() == "suppressed_unless_exact_identity"
        and bool(str(fm.get("consolidation_target") or "").strip())
    )


def _page_has_related_paper(page: dict[str, Any]) -> bool:
    fm = page["frontmatter"]
    if _as_list(fm.get("related_papers")) or _as_list(fm.get("source_papers")) or _as_list(fm.get("sources")):
        return True
    return "[[papers/" in page["body"]


def _claim_has_evidence(page: dict[str, Any]) -> bool:
    fm = page["frontmatter"]
    if _as_list(fm.get("supports")) or _as_list(fm.get("evidence_ids")):
        return True
    text = _norm(page["body"])
    return "evidence ids" in text and "none" not in text[:500]


def _evidence_has_source_provenance(page: dict[str, Any]) -> bool:
    fm = page["frontmatter"]
    if _as_list(fm.get("source_papers")) or "[[papers/" in page["body"]:
        return True
    text = _norm(page["body"])
    return "source paper" in text and ("page" in text or "locator" in text or "section" in text)


def _uses_source_quality_hold_as_evidence(page: dict[str, Any]) -> bool:
    text = _norm(json.dumps(page["frontmatter"]) + " " + page["body"])
    if "source quality hold" not in text or page["type"] not in {"claim", "evidence", "synthesis"}:
        return False
    if any(
        marker in text
        for marker in (
            "source quality gap",
            "source text insufficient",
            "claims are on source quality hold",
            "not scientific evidence",
            "cleanup provenance",
            "do not promote source quality holds as scientific evidence",
        )
    ):
        return False
    return True


def _duplicate_alias_groups(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[str]] = {}
    for page in pages:
        if page["directory"] not in {"methods", "topics"}:
            continue
        aliases = [page["title"]] + [str(item) for item in _as_list(page["frontmatter"].get("aliases"))]
        for alias in aliases:
            key = _norm(alias)
            if key:
                buckets.setdefault(key, []).append(page["relative_path"])
    return [
        {"alias": alias, "pages": sorted(set(paths))}
        for alias, paths in sorted(buckets.items())
        if len(set(paths)) > 1
    ]


def _create_method_action(*, method: str, path: Path, paper: dict[str, Any], wiki_root: Path) -> dict[str, Any]:
    return {
        "action_type": "create_method_page",
        "risk": "low",
        "target_path": _relative_or_absolute(path, wiki_root),
        "title": method,
        "source_papers": [paper["relative_path"]],
        "topics": _as_list(paper["frontmatter"].get("topics")),
        "reason": "Canonical paper frontmatter references this method but no aggregate method page exists.",
    }


def _create_topic_action(*, topic: str, path: Path, paper: dict[str, Any], wiki_root: Path) -> dict[str, Any]:
    return {
        "action_type": "create_topic_page",
        "risk": "low",
        "target_path": _relative_or_absolute(path, wiki_root),
        "title": topic,
        "source_papers": [paper["relative_path"]],
        "related_methods": _as_list(paper["frontmatter"].get("methods")),
        "reason": "Canonical paper frontmatter references this topic but no aggregate topic page exists.",
    }


def _method_needs_safe_enrichment(page: dict[str, Any]) -> bool:
    return _is_low_information(page) or any(section not in page["sections"] for section in REQUIRED_SECTIONS["method"])


def _topic_needs_safe_enrichment(page: dict[str, Any]) -> bool:
    return _is_low_information(page) or any(section not in page["sections"] for section in REQUIRED_SECTIONS["topic"])


def _claim_needs_safe_enrichment(page: dict[str, Any]) -> bool:
    if _is_compact_candidate_record(page):
        return False
    return any(section not in page["sections"] for section in REQUIRED_SECTIONS["claim"])


def _evidence_needs_safe_enrichment(page: dict[str, Any]) -> bool:
    if _is_compact_candidate_record(page):
        return False
    return any(section not in page["sections"] for section in REQUIRED_SECTIONS["evidence"])


def _enrich_method_action(*, page: dict[str, Any], wiki_root: Path) -> dict[str, Any]:
    related = _related_paper_paths(page)
    snippets = _paper_snippets(wiki_root=wiki_root, related=related)
    return {
        "action_type": "enrich_method_page",
        "risk": "low",
        "target_path": page["relative_path"],
        "title": page["title"],
        "related_papers": related,
        "topics": _as_list(page["frontmatter"].get("topics")) + _as_list(page["frontmatter"].get("related_topics")),
        "snippets": snippets,
        "reason": "Method page is missing the minimum knowledge-layer sections or is only a paper list.",
    }


def _enrich_topic_action(*, page: dict[str, Any], wiki_root: Path) -> dict[str, Any]:
    related = _related_paper_paths(page)
    snippets = _paper_snippets(wiki_root=wiki_root, related=related)
    methods = []
    for relative in related[:12]:
        paper = wiki_root / relative
        if paper.exists():
            methods.extend(_as_list(parse_frontmatter(paper.read_text(encoding="utf-8")).get("methods")))
    return {
        "action_type": "enrich_topic_page",
        "risk": "low",
        "target_path": page["relative_path"],
        "title": page["title"],
        "related_papers": related,
        "related_methods": _dedupe([str(item) for item in methods + _as_list(page["frontmatter"].get("related_methods"))]),
        "snippets": snippets,
        "reason": "Topic page is missing the minimum knowledge-layer sections or is only a paper list.",
    }


def _frontmatter_gaps(page: dict[str, Any]) -> list[str]:
    required = _required_frontmatter_for_page(page)
    return [field for field in required if field not in page["frontmatter"]]


def _required_frontmatter_for_page(page: dict[str, Any]) -> tuple[str, ...]:
    if _is_compact_candidate_record(page):
        return ("type", "title", "status", "sources", "confidence", "review_state", "candidate_id")
    return REQUIRED_FRONTMATTER.get(_schema_type(page), ())


def _required_sections_for_page(page: dict[str, Any]) -> tuple[str, ...]:
    if _is_compact_candidate_record(page):
        return ()
    return REQUIRED_SECTIONS.get(_schema_type(page), ())


def _is_compact_candidate_record(page: dict[str, Any]) -> bool:
    if page["type"] not in {"claim", "evidence"}:
        return False
    review_state = str(page["frontmatter"].get("review_state") or "").lower()
    if review_state not in {"candidate", "auto_extracted", "source_text_insufficient"}:
        return False
    body = _norm(page["body"])
    if page["type"] == "claim":
        return "source paper" in body and "claim" in body and ("evidence ids" in body or "source quality gap" in body)
    return "source paper" in body and ("summary" in body or "evidence type" in body) and ("page" in body or "locator" in body)


def _schema_type(page: dict[str, Any]) -> str:
    if page["directory"] == "syntheses":
        return "synthesis"
    return page["type"]


def _frontmatter_action(*, page: dict[str, Any], wiki_root: Path) -> dict[str, Any]:
    return {
        "action_type": "update_frontmatter",
        "risk": "low",
        "target_path": page["relative_path"],
        "title": page["title"],
        "page_type": page["type"],
        "missing_fields": _frontmatter_gaps(page),
        "sources": _related_source_paths(page),
        "source_papers": _related_paper_paths(page),
        "reason": "Knowledge page is missing machine-readable schema fields required for audit/retrieval.",
    }


def _enrich_claim_action(*, page: dict[str, Any]) -> dict[str, Any]:
    body = page["body"]
    evidence_ids = _line_value(body, "Evidence IDs")
    return {
        "action_type": "enrich_claim_page",
        "risk": "low",
        "target_path": page["relative_path"],
        "title": page["title"],
        "claim": _line_value(body, "Claim") or page["title"],
        "claim_type": _line_value(body, "Claim type") or "unknown",
        "evidence_ids": [item.strip() for item in re.split(r",\s*", evidence_ids) if item.strip() and item.strip().lower() != "none"],
        "source_papers": _related_paper_paths(page),
        "provenance": _line_value(body, "Provenance") or "not recorded",
        "confidence": page["frontmatter"].get("confidence") or "low",
        "review_state": page["frontmatter"].get("review_state") or "candidate",
        "reason": "Claim candidate page is being reshaped into the canonical claim knowledge-layer schema without changing its source claim.",
    }


def _enrich_evidence_action(*, page: dict[str, Any]) -> dict[str, Any]:
    body = page["body"]
    return {
        "action_type": "enrich_evidence_page",
        "risk": "low",
        "target_path": page["relative_path"],
        "title": page["title"],
        "summary": _line_value(body, "Summary") or page["title"],
        "evidence_type": _line_value(body, "Evidence type") or "unknown",
        "page": _line_value(body, "Page") or "unknown",
        "locator": _line_value(body, "Locator") or "unknown",
        "supports": [item.strip() for item in re.split(r",\s*", _line_value(body, "Supports")) if item.strip() and item.strip().lower() != "none"],
        "source_papers": _related_paper_paths(page),
        "confidence": page["frontmatter"].get("confidence") or "low",
        "review_state": page["frontmatter"].get("review_state") or "candidate",
        "reason": "Evidence candidate page is being reshaped into the canonical evidence knowledge-layer schema without changing its source observation.",
    }


def _high_risk_action(action_type: str, page: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        "action_type": action_type,
        "risk": "high",
        "target_path": page["relative_path"],
        "title": page["title"],
        "reason": reason,
        "publish_policy": "proposal_only",
    }


def _related_paper_paths(page: dict[str, Any]) -> list[str]:
    values = []
    fm = page["frontmatter"]
    values.extend(str(item) for item in _as_list(fm.get("related_papers")))
    values.extend(str(item) for item in _as_list(fm.get("source_papers")))
    values.extend(str(item) for item in _as_list(fm.get("sources")))
    values.extend(re.findall(r"\[\[(papers/[^\s|\]#\r\n]+)", page["body"]))
    cleaned = []
    for value in values:
        match = re.search(r"papers/[^\s|\]#\r\n]+", value)
        if match:
            relative = match.group(0)
            if not relative.endswith(".md"):
                relative += ".md"
            cleaned.append(relative)
    return _dedupe(cleaned)


def _source_papers_need_normalization(page: dict[str, Any]) -> bool:
    if page["directory"] != "syntheses":
        return False
    return any(not str(item).startswith("papers/") for item in _as_list(page["frontmatter"].get("source_papers")))


def _related_source_paths(page: dict[str, Any]) -> list[str]:
    values = []
    fm = page["frontmatter"]
    values.extend(str(item) for item in _as_list(fm.get("sources")))
    values.extend(str(item) for item in _as_list(fm.get("source_papers")))
    values.extend(str(item) for item in _as_list(fm.get("related_papers")))
    values.extend(re.findall(r"\[\[((?:papers|methods|topics|claims|evidence|concepts|syntheses)/[^\s|\]#\r\n]+)", page["body"]))
    cleaned = []
    for value in values:
        match = re.search(r"(?:papers|methods|topics|claims|evidence|concepts|syntheses)/[^\s|\]#\r\n]+", value)
        if match:
            relative = match.group(0)
            if not relative.endswith(".md"):
                relative += ".md"
            cleaned.append(relative)
    return _dedupe(cleaned)


def _paper_snippets(*, wiki_root: Path, related: list[str]) -> list[dict[str, str]]:
    snippets = []
    for relative in related[:8]:
        path = wiki_root / relative
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        sections = split_sections(strip_frontmatter(text))
        snippets.append(
            {
                "paper": relative,
                "title": str(fm.get("title") or Path(relative).stem),
                "remember": _preview(sections.get("What To Remember", ""), limit=220),
                "mechanism": _preview(sections.get("Mechanism", ""), limit=240),
                "implementation": _preview(sections.get("Implementation Hooks", ""), limit=220),
                "limitations": _preview(sections.get("Limitations / Uncertainty", ""), limit=220),
                "evidence": _preview(sections.get("Evidence Map", ""), limit=220),
            }
        )
    return snippets


def _apply_low_risk_action(*, action: dict[str, Any], wiki_root: Path) -> bool:
    action_type = str(action.get("action_type") or "")
    target = _target_path(action, wiki_root=wiki_root)
    if action_type == "create_method_page":
        if target.exists():
            return False
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(_render_method_page(action=action), encoding="utf-8")
        return True
    if action_type == "create_topic_page":
        if target.exists():
            return False
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(_render_topic_page(action=action), encoding="utf-8")
        return True
    if action_type in {"enrich_method_page", "enrich_topic_page"}:
        if not target.exists():
            return False
        _write_snapshot(wiki_root=wiki_root, target_page=target)
        target.write_text(
            _render_method_page(action=action) if action_type == "enrich_method_page" else _render_topic_page(action=action),
            encoding="utf-8",
        )
        return True
    if action_type == "enrich_claim_page":
        if not target.exists():
            return False
        _write_snapshot(wiki_root=wiki_root, target_page=target)
        target.write_text(_render_claim_page(action=action), encoding="utf-8")
        return True
    if action_type == "enrich_evidence_page":
        if not target.exists():
            return False
        _write_snapshot(wiki_root=wiki_root, target_page=target)
        target.write_text(_render_evidence_page(action=action), encoding="utf-8")
        return True
    if action_type == "update_frontmatter":
        if not target.exists():
            return False
        _write_snapshot(wiki_root=wiki_root, target_page=target)
        _patch_frontmatter(target, action=action)
        return True
    return False


def _render_method_page(*, action: dict[str, Any]) -> str:
    title = str(action.get("title") or "Method")
    related = [str(item) for item in action.get("related_papers") or action.get("source_papers") or []]
    snippets = list(action.get("snippets") or [])
    topics = _dedupe([str(item) for item in action.get("topics") or []])
    fm = {
        "type": "method",
        "title": title,
        "status": "active",
        "created": datetime.now(timezone.utc).date().isoformat(),
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "aliases": [],
        "sources": related,
        "source_papers": related,
        "related_papers": related,
        "related_methods": [],
        "related_topics": topics,
        "supports": [],
        "contradicts": [],
        "supersedes": [],
        "superseded_by": [],
        "confidence": "medium",
        "review_state": "auto_structured",
        "evolution_state": "active",
        "revision_id": f"knowledge-{_short_hash(title + ''.join(related))}",
    }
    lines = [
        _render_frontmatter(fm),
        f"# {title}",
        "",
        "## What It Is",
        "",
        f"This is a compiled method-family page for `{title}`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.",
        "",
        "## Mechanism",
        "",
    ]
    lines.extend(_snippet_bullets(snippets, key="mechanism", fallback="Mechanism details require reading the linked paper pages."))
    lines.extend(["", "## Used By Papers", ""])
    lines.extend(_paper_bullets(related))
    lines.extend(["", "## Implementation Hooks", ""])
    lines.extend(_snippet_bullets(snippets, key="implementation", fallback="Implementation hooks should be pulled from linked paper pages before coding."))
    lines.extend(["", "## Failure Modes", ""])
    lines.extend(_snippet_bullets(snippets, key="limitations", fallback="Failure modes are not yet synthesized; inspect linked paper limitations."))
    lines.extend(["", "## Evidence", ""])
    lines.extend(_snippet_bullets(snippets, key="evidence", fallback="Evidence remains paper-specific until promoted into claim/evidence pages."))
    lines.extend(["", "## Open Questions", "", "- Which linked papers provide the strongest source-grounded evidence for this method family?"])
    return "\n".join(lines).rstrip() + "\n"


def _render_topic_page(*, action: dict[str, Any]) -> str:
    title = str(action.get("title") or "Topic")
    related = [str(item) for item in action.get("related_papers") or action.get("source_papers") or []]
    methods = _dedupe([str(item) for item in action.get("related_methods") or []])
    snippets = list(action.get("snippets") or [])
    fm = {
        "type": "topic",
        "title": title,
        "status": "active",
        "created": datetime.now(timezone.utc).date().isoformat(),
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "aliases": [],
        "sources": related,
        "source_papers": related,
        "related_papers": related,
        "related_methods": methods,
        "related_topics": [],
        "supports": [],
        "contradicts": [],
        "supersedes": [],
        "superseded_by": [],
        "confidence": "medium",
        "review_state": "auto_structured",
        "evolution_state": "active",
        "revision_id": f"knowledge-{_short_hash(title + ''.join(related))}",
    }
    lines = [
        _render_frontmatter(fm),
        f"# {title}",
        "",
        "## Scope",
        "",
        f"This topic page compiles canonical paper pages around `{title}`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.",
        "",
        "## Key Papers",
        "",
    ]
    lines.extend(_paper_bullets(related))
    lines.extend(["", "## Method Families", ""])
    lines.extend([f"- [[methods/{slugify(method)}|{method}]]" for method in methods[:20]] or ["- No method families have been promoted yet."])
    lines.extend(["", "## Claims", ""])
    lines.extend(_snippet_bullets(snippets, key="remember", fallback="Claims are not synthesized yet; inspect linked paper summaries and evidence maps."))
    lines.extend(["", "## Contradictions", "", "- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one."])
    lines.extend(["", "## Retrieval Hooks", "", f"- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `{title}`."])
    return "\n".join(lines).rstrip() + "\n"


def _render_claim_page(*, action: dict[str, Any]) -> str:
    title = str(action.get("title") or "Claim")
    sources = [str(item) for item in action.get("sources") or []]
    source_papers = [str(item) for item in action.get("source_papers") or []]
    evidence_ids = [str(item) for item in action.get("evidence_ids") or []]
    fm = {
        "type": "claim",
        "title": title,
        "status": "draft",
        "created": datetime.now(timezone.utc).date().isoformat(),
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "aliases": [],
        "sources": source_papers,
        "source_papers": source_papers,
        "related_papers": source_papers,
        "related_methods": [],
        "related_topics": [],
        "supports": evidence_ids,
        "contradicts": [],
        "supersedes": [],
        "superseded_by": [],
        "confidence": str(action.get("confidence") or "low"),
        "review_state": str(action.get("review_state") or "candidate"),
        "evolution_state": "active",
        "revision_id": f"knowledge-{_short_hash(title + ''.join(source_papers))}",
    }
    lines = [
        _render_frontmatter(fm),
        f"# {title}",
        "",
        "## Claim",
        "",
        str(action.get("claim") or title),
        "",
        "## Supporting Evidence",
        "",
    ]
    if evidence_ids:
        lines.extend(f"- `{item}`" for item in evidence_ids)
    else:
        lines.append("- No evidence id was recorded; this claim should stay candidate-level until linked evidence is verified.")
    lines.extend(["", "## Contradicting Evidence", "", "- None recorded.", "", "## Scope", "", f"- Claim type: `{action.get('claim_type') or 'unknown'}`", ""])
    lines.extend(["## Confidence", "", f"- Confidence: `{action.get('confidence') or 'low'}`", f"- Review state: `{action.get('review_state') or 'candidate'}`", ""])
    lines.extend(["## Provenance", "", f"- Source papers: {', '.join(_paper_bullets(source_papers)) if source_papers else 'not linked'}", f"- Locator: {action.get('provenance') or 'not recorded'}"])
    return "\n".join(lines).rstrip() + "\n"


def _render_evidence_page(*, action: dict[str, Any]) -> str:
    title = str(action.get("title") or "Evidence")
    source_papers = [str(item) for item in action.get("source_papers") or []]
    supports = [str(item) for item in action.get("supports") or []]
    fm = {
        "type": "evidence",
        "title": title,
        "status": "draft",
        "created": datetime.now(timezone.utc).date().isoformat(),
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "aliases": [],
        "sources": source_papers,
        "source_papers": source_papers,
        "related_papers": source_papers,
        "related_methods": [],
        "related_topics": [],
        "supports": supports,
        "contradicts": [],
        "supersedes": [],
        "superseded_by": [],
        "confidence": str(action.get("confidence") or "low"),
        "review_state": str(action.get("review_state") or "candidate"),
        "evolution_state": "active",
        "revision_id": f"knowledge-{_short_hash(title + ''.join(source_papers))}",
    }
    lines = [
        _render_frontmatter(fm),
        f"# {title}",
        "",
        "## Evidence Item",
        "",
        str(action.get("summary") or title),
        "",
        "## Source",
        "",
        f"- Source papers: {', '.join(_paper_bullets(source_papers)) if source_papers else 'not linked'}",
        f"- Page: {action.get('page') or 'unknown'}",
        f"- Locator: {action.get('locator') or 'unknown'}",
        "",
        "## Metric or Observation",
        "",
        f"- Evidence type: `{action.get('evidence_type') or 'unknown'}`",
        f"- Observation: {action.get('summary') or title}",
        "",
        "## Supports",
        "",
    ]
    lines.extend([f"- `{item}`" for item in supports] or ["- No claim id has been linked yet."])
    lines.extend(["", "## Limits", "", "- This evidence item is paper-local until synthesized with other evidence.", "", "## Reliability", "", f"- Confidence: `{action.get('confidence') or 'low'}`", f"- Review state: `{action.get('review_state') or 'candidate'}`"])
    return "\n".join(lines).rstrip() + "\n"


def _paper_bullets(related: list[str]) -> list[str]:
    if not related:
        return ["- No related paper has been linked yet."]
    return [f"- [[{Path(relative).with_suffix('').as_posix()}]]" for relative in related[:80]]


def _line_value(body: str, label: str) -> str:
    pattern = re.compile(rf"^\s*-\s*{re.escape(label)}:\s*(.+?)\s*$", flags=re.MULTILINE)
    match = pattern.search(body)
    return match.group(1).strip() if match else ""


def _snippet_bullets(snippets: list[dict[str, str]], *, key: str, fallback: str) -> list[str]:
    bullets = []
    for item in snippets[:8]:
        text = str(item.get(key) or "").strip()
        if text:
            bullets.append(f"- [[{Path(str(item.get('paper'))).with_suffix('').as_posix()}|{item.get('title')}]]: {text}")
    return bullets or [f"- {fallback}"]


def _patch_frontmatter(path: Path, *, action: dict[str, Any]) -> None:
    text = path.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    body = strip_frontmatter(text)
    page_type = str(action.get("page_type") or fm.get("type") or path.parent.name.rstrip("s"))
    sources = [str(item) for item in action.get("sources") or []]
    source_papers = [str(item) for item in action.get("source_papers") or []]
    defaults: dict[str, Any] = {
        "type": page_type,
        "title": str(action.get("title") or fm.get("title") or path.stem),
        "status": str(fm.get("status") or "active"),
        "created": str(fm.get("created") or datetime.now(timezone.utc).date().isoformat()),
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "aliases": _as_list(fm.get("aliases")),
        "sources": sources or _as_list(fm.get("sources")) or source_papers,
        "source_papers": source_papers or _as_list(fm.get("source_papers")),
        "related_papers": source_papers or _as_list(fm.get("related_papers")),
        "related_methods": _as_list(fm.get("related_methods")) or _as_list(fm.get("methods")),
        "related_topics": _as_list(fm.get("related_topics")) or _as_list(fm.get("topics")),
        "supports": _as_list(fm.get("supports")),
        "contradicts": _as_list(fm.get("contradicts")),
        "supersedes": _as_list(fm.get("supersedes")),
        "superseded_by": _as_list(fm.get("superseded_by")),
        "confidence": str(fm.get("confidence") or "medium"),
        "review_state": str(fm.get("review_state") or "auto_structured"),
        "evolution_state": str(fm.get("evolution_state") or "active"),
        "revision_id": str(fm.get("revision_id") or f"knowledge-{_short_hash(text)}"),
    }
    for key, value in defaults.items():
        if key not in fm:
            fm[key] = value
    if sources:
        fm["sources"] = sources
    if source_papers:
        fm["source_papers"] = source_papers
        fm["related_papers"] = source_papers
    path.write_text(_render_frontmatter(fm) + "\n" + body.lstrip(), encoding="utf-8")


def _target_path(action: dict[str, Any], *, wiki_root: Path) -> Path:
    target = Path(str(action.get("target_path") or ""))
    if target.is_absolute():
        return target
    return wiki_root / target


def _write_snapshot(*, wiki_root: Path, target_page: Path) -> Path:
    text = target_page.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    revision = str(fm.get("revision_id") or f"base-{_short_hash(text)}")
    snapshot = wiki_root / ".versions" / target_page.parent.name / target_page.stem / f"{slugify(revision)}.md"
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    snapshot.write_text(text, encoding="utf-8")
    return snapshot


def _render_audit_brief(payload: dict[str, Any]) -> str:
    metrics = payload["metrics"]
    counts = metrics["counts"]
    lines = [
        "# Knowledge Layer Quality Audit",
        "",
        f"- Generated: `{payload['created_at']}`",
        f"- Status: `{payload['status']}`",
        f"- Papers: {counts.get('papers', 0)}",
        f"- Methods: {counts.get('methods', 0)}",
        f"- Topics: {counts.get('topics', 0)}",
        f"- Concepts: {counts.get('concepts', 0)}",
        f"- Claims: {counts.get('claims', 0)}",
        f"- Evidence: {counts.get('evidence', 0)}",
        f"- Syntheses: {counts.get('syntheses', 0)}",
        "",
        "## Health Metrics",
        "",
    ]
    for key, value in metrics.items():
        if key != "counts":
            lines.append(f"- {key}: {value}")
    lines.extend(["", "## Interpretation", ""])
    lines.append("The audit checks whether the wiki has moved beyond isolated paper pages into a compiled Markdown knowledge layer. Warnings usually mean a page is still navigational or candidate-level; errors mean source-quality or provenance boundaries may be unsafe.")
    samples = payload.get("samples") or {}
    for name, values in samples.items():
        lines.extend(["", f"## Sample: {name}", ""])
        if values:
            for item in values[:12]:
                lines.append(f"- `{item}`")
        else:
            lines.append("- None.")
    return "\n".join(lines).rstrip() + "\n"


def _render_repair_markdown(manifest: dict[str, Any]) -> str:
    lines = [
        f"# Knowledge Repair Proposal: {manifest['repair_id']}",
        "",
        "This proposal separates low-risk structural repairs from high-risk synthesis or claim changes.",
        "",
        "## Deterministic Repairs",
        "",
    ]
    for action in manifest.get("deterministic_repairs") or []:
        lines.append(f"- `{action.get('action_type')}` -> `{action.get('target_path')}`: {action.get('reason')}")
    if not manifest.get("deterministic_repairs"):
        lines.append("- None.")
    lines.extend(["", "## High-Risk Proposal-Only Repairs", ""])
    for action in manifest.get("high_risk_repairs") or []:
        lines.append(f"- `{action.get('action_type')}` -> `{action.get('target_path')}`: {action.get('reason')}")
    if not manifest.get("high_risk_repairs"):
        lines.append("- None.")
    return "\n".join(lines).rstrip() + "\n"


def _render_repair_publish_plan(manifest: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"# Publish Plan: {manifest['repair_id']}",
            "",
            f"- Deterministic low-risk repairs: {len(manifest.get('deterministic_repairs') or [])}",
            f"- High-risk proposal-only repairs: {len(manifest.get('high_risk_repairs') or [])}",
            "- Lint command: `meridian wiki knowledge-repair-lint <repair.json> --wiki-root wiki`",
            "- Publish command: `meridian wiki publish-knowledge-repair <repair.json> --wiki-root wiki`",
            "- Publish creates snapshots before updating existing canonical knowledge pages.",
        ]
    ).rstrip() + "\n"


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
    return "\n".join(lines)


def _load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"knowledge repair manifest does not exist: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _resolve_path(value: Any, *, base: Path) -> Path | None:
    if not value:
        return None
    path = Path(str(value))
    if path.is_absolute():
        return path
    if path.exists():
        return path
    return base / path


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
        cleaned = value.strip()
        key = cleaned.lower()
        if cleaned and key not in seen:
            seen.add(key)
            result.append(cleaned)
    return result


def _preview(text: str, *, limit: int) -> str:
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip() + "..."


def _norm(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", str(text).lower()))


def _short_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def _finding(severity: str, code: str, path: str, **extra: Any) -> dict[str, Any]:
    payload = {"severity": severity, "code": code, "path": path}
    payload.update(extra)
    return payload
