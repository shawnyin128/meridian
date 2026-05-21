from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.corpus import parse_frontmatter, split_sections, strip_frontmatter


SYSTEM_EVALUATION_SCHEMA_VERSION = "meridian.system_evaluation.v1"
SYSTEM_EVALUATION_JUDGE_PACKET_SCHEMA_VERSION = "meridian.system_evaluation_judge_packet.v1"

INTERNAL_PATH_MARKERS = (".drafts/", ".versions/", "review.md", "paper_candidate.md")

DIMENSIONS = [
    ("task_usefulness", 1.0, "retrieval/context output should help the stated research or coding task"),
    ("retrieval_context_quality", 1.1, "context should include the required page families and sections"),
    ("compiled_knowledge_density", 1.0, "context should include useful compiled pages, not only paper summaries"),
    ("provenance_traceability", 1.1, "claims and syntheses should expose source papers or provenance"),
    ("boundary_correctness", 1.2, "source facts, synthesis, user insight, uncertainty, and debug artifacts stay separated"),
    ("synthesis_quality", 0.9, "synthesis output should preserve source facts, inference, evidence, and open questions"),
    ("concept_usefulness", 0.9, "concept pages should support coding, debugging, probes, and prerequisite understanding"),
    ("claim_evidence_support", 1.0, "claim/evidence results should include support and provenance"),
    ("entry_consistency", 0.9, "Prompt/MCP product outputs should expose canonical artifacts only"),
    ("optimization_actionability", 0.9, "findings should map to generalized repair mechanisms"),
]

REPAIR_FIXES = {
    "retrieval_context": "Improve query decomposition, corpus selection, or context packing so empty or thin contexts are repaired generally.",
    "retrieval_ranking": "Tune result-type routing, section-aware scoring, or family coverage rather than hardcoding the case.",
    "knowledge_layer": "Promote or consolidate method/topic/concept/claim/evidence pages so retrieval can return compiled knowledge.",
    "provenance_schema": "Add or repair source_papers, sources, evidence maps, and trace fields on canonical pages.",
    "artifact_boundary": "Keep .drafts, .versions, review packets, and internal candidates out of product retrieval outputs.",
    "source_quality_routing": "Route source-quality holds only to cleanup/provenance tasks, not scientific evidence tasks.",
    "synthesis_quality": "Refine synthesis schema or write-back generation so durable pages have source facts, synthesis, evidence, and questions.",
    "concept_layer": "Strengthen concept pages with implementation implications, failure modes, minimal checks, and provenance.",
    "claim_evidence_traceability": "Promote evidence-backed claim records and make supporting evidence/provenance retrievable.",
    "entry_contract": "Align Prompt/MCP outputs with canonical product artifacts and compact context packets.",
    "personalization_boundary": "Keep user-supplied insight labeled and separate from paper source facts.",
}


@dataclass(frozen=True)
class SystemEvaluationResult:
    report_path: Path
    markdown_path: Path
    judge_packet_path: Path
    decision: str
    weighted_score: float
    hard_failures: list[dict[str, Any]]
    findings: list[dict[str, Any]]


def run_system_evaluation(
    *,
    wiki_root: Path,
    case_path: Path,
    context_path: Path,
    out_dir: Path,
    rubric_path: Path | None = None,
    selected_pages: list[str] | None = None,
    proposal_path: Path | None = None,
    audit_paths: list[Path] | None = None,
    overwrite: bool = False,
) -> SystemEvaluationResult:
    if out_dir.exists() and any(out_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"system evaluation output directory already exists: {out_dir}")
    if out_dir.exists() and overwrite:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    case = _load_json_or_jsonl_object(case_path, label="case")
    context = _load_json_object(context_path, label="context")
    selected_page_payloads = _load_selected_pages(wiki_root=wiki_root, selected_pages=selected_pages or [])
    proposal_payload = _load_optional_text(proposal_path)
    audit_payloads = [_load_json_or_text(path) for path in (audit_paths or [])]

    results = list(context.get("results") or [])
    hard_failures = _hard_failures(case=case, context=context, results=results, selected_pages=selected_page_payloads)
    findings = _findings(case=case, context=context, results=results, selected_pages=selected_page_payloads, proposal=proposal_payload)
    dimension_scores = _dimension_scores(case=case, results=results, findings=findings, hard_failures=hard_failures)
    weighted_score = _weighted_score(dimension_scores)
    repair_buckets = _bucket_summary(findings, hard_failures)
    decision = _decision(
        weighted_score=weighted_score,
        dimension_scores=dimension_scores,
        hard_failures=hard_failures,
        findings=findings,
    )

    report = {
        "schema_version": SYSTEM_EVALUATION_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "wiki_root": str(wiki_root),
        "case_path": str(case_path),
        "context_path": str(context_path),
        "rubric_path": str(rubric_path) if rubric_path else None,
        "proposal_path": str(proposal_path) if proposal_path else None,
        "audit_paths": [str(path) for path in (audit_paths or [])],
        "case": _case_summary(case),
        "context_summary": _context_summary(context),
        "decision": decision,
        "weighted_score": weighted_score,
        "dimension_scores": dimension_scores,
        "hard_failures": hard_failures,
        "findings": findings,
        "repair_buckets": repair_buckets,
        "recommended_generalized_fixes": _recommended_fixes(repair_buckets),
        "residual_risks": _residual_risks(findings=findings, hard_failures=hard_failures, dimension_scores=dimension_scores),
        "next_eval_case_suggestions": _next_eval_case_suggestions(findings=findings, hard_failures=hard_failures),
        "artifacts": {
            "system_evaluation_json": str(out_dir / "system-evaluation.json"),
            "system_evaluation_markdown": str(out_dir / "system-evaluation.md"),
            "judge_packet": str(out_dir / "judge-packet.md"),
        },
        "selected_pages": [
            {
                "path": payload["path"],
                "type": payload["type"],
                "title": payload["title"],
                "section_headings": payload["section_headings"],
            }
            for payload in selected_page_payloads
        ],
        "audit_summaries": audit_payloads,
    }

    report_path = out_dir / "system-evaluation.json"
    markdown_path = out_dir / "system-evaluation.md"
    judge_packet_path = out_dir / "judge-packet.md"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    markdown_path.write_text(_render_markdown(report), encoding="utf-8")
    judge_packet_path.write_text(
        _render_judge_packet(case=case, context=context, report=report, rubric_path=rubric_path),
        encoding="utf-8",
    )

    return SystemEvaluationResult(
        report_path=report_path,
        markdown_path=markdown_path,
        judge_packet_path=judge_packet_path,
        decision=decision,
        weighted_score=weighted_score,
        hard_failures=hard_failures,
        findings=findings,
    )


def _load_json_or_jsonl_object(path: Path, *, label: str) -> dict[str, Any]:
    if path.suffix == ".jsonl":
        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    payload = json.loads(stripped)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"invalid {label} JSONL at line {line_number}: {exc}") from exc
                if not isinstance(payload, dict):
                    raise ValueError(f"{label} JSONL line {line_number} must be an object")
                return payload
        raise ValueError(f"{label} JSONL is empty: {path}")
    return _load_json_object(path, label=label)


def _load_json_object(path: Path, *, label: str) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"{label} file does not exist: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid {label} JSON: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{label} JSON must be an object: {path}")
    return payload


def _load_optional_text(path: Path | None) -> dict[str, Any] | None:
    if path is None:
        return None
    if not path.exists():
        raise FileNotFoundError(f"proposal file does not exist: {path}")
    return {"path": str(path), "text": path.read_text(encoding="utf-8")[:8000]}


def _load_json_or_text(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "missing": True}
    text = path.read_text(encoding="utf-8")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {"path": str(path), "text_preview": text[:2000]}
    return {"path": str(path), "json": parsed}


def _load_selected_pages(*, wiki_root: Path, selected_pages: list[str]) -> list[dict[str, Any]]:
    payloads = []
    for raw_page in selected_pages:
        path = Path(raw_page)
        if not path.is_absolute():
            path = wiki_root / path
        if not path.exists():
            payloads.append({"path": str(path), "missing": True, "type": None, "title": None, "section_headings": []})
            continue
        text = path.read_text(encoding="utf-8")
        frontmatter = parse_frontmatter(text)
        sections = split_sections(strip_frontmatter(text))
        payloads.append(
            {
                "path": str(path),
                "relative_path": _relative_to_wiki(path, wiki_root=wiki_root),
                "type": frontmatter.get("type"),
                "title": frontmatter.get("title") or path.stem,
                "frontmatter": frontmatter,
                "section_headings": list(sections),
                "text_preview": strip_frontmatter(text)[:6000],
            }
        )
    return payloads


def _hard_failures(
    *,
    case: dict[str, Any],
    context: dict[str, Any],
    results: list[dict[str, Any]],
    selected_pages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    for source, path in _artifact_paths(results=results, selected_pages=selected_pages):
        normalized = path.replace("\\", "/")
        if any(marker in normalized for marker in INTERNAL_PATH_MARKERS):
            failures.append(
                {
                    "code": "debug_artifact_leakage",
                    "repair_bucket": "artifact_boundary",
                    "message": "Internal draft/debug/version artifact appeared in product evaluation context.",
                    "source": source,
                    "path": path,
                }
            )

    query_text = " ".join(str(case.get(field) or context.get(field) or "") for field in ("query", "intent", "problem_description"))
    cleanup_intent = any(token in query_text.lower() for token in ("source-quality", "source quality", "cleanup", "audit", "provenance issue"))
    if not cleanup_intent:
        for result in results:
            if _is_source_quality_hold(result):
                failures.append(
                    {
                        "code": "source_quality_contamination",
                        "repair_bucket": "source_quality_routing",
                        "message": "Source-quality hold material was returned for a scientific evidence task.",
                        "path": result.get("relative_path") or result.get("canonical_path") or result.get("path"),
                        "review_state": result.get("review_state"),
                        "quality_state": result.get("quality_state"),
                        "trust_state": result.get("trust_state"),
                    }
                )

    source_fact_task = any(token in query_text.lower() for token in ("evidence", "support", "source fact", "paper claims", "scientific"))
    if source_fact_task:
        for result in results:
            if "user_insight" in set(result.get("matched_source_types") or []):
                failures.append(
                    {
                        "code": "user_insight_as_source_fact",
                        "repair_bucket": "personalization_boundary",
                        "message": "User insight matched a source-fact/evidence task without explicit personalization framing.",
                        "path": result.get("relative_path") or result.get("canonical_path") or result.get("path"),
                    }
                )
    return _dedupe_dicts(failures, key_fields=("code", "path"))


def _findings(
    *,
    case: dict[str, Any],
    context: dict[str, Any],
    results: list[dict[str, Any]],
    selected_pages: list[dict[str, Any]],
    proposal: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    if not results:
        findings.append(_finding("empty_context", "retrieval_context", "Retrieval context has no results.", severity="high"))

    required_families = list(case.get("required_page_families") or [])
    missing_families = [family for family in required_families if not any(_matches_family(result, family) for result in results)]
    if missing_families:
        findings.append(
            _finding(
                "missing_required_page_families",
                "retrieval_ranking",
                "Retrieval context missed required page families.",
                severity="high",
                details={"missing": missing_families},
            )
        )

    required_section_groups = list(case.get("required_section_groups") or [])
    missing_groups = []
    for group in required_section_groups:
        families = list(group.get("page_families") or [])
        sections = list(group.get("sections") or [])
        if families and sections and not _group_sections_present(results=results, families=families, sections=sections):
            missing_groups.append(group.get("id") or ",".join(sections))
    if missing_groups:
        findings.append(
            _finding(
                "missing_required_section_groups",
                "retrieval_ranking",
                "Retrieval context missed required section groups.",
                severity="medium",
                details={"missing_groups": missing_groups},
            )
        )

    compiled_results = [
        result
        for result in results
        if result.get("knowledge_role") == "compiled_knowledge"
        or result.get("corpus_type") in {"syntheses", "methods", "topics", "claims", "evidence", "concepts"}
        or result.get("type") in {"synthesis", "method", "topic", "claim", "evidence", "concept"}
    ]
    if results and not compiled_results:
        findings.append(
            _finding(
                "no_compiled_knowledge",
                "knowledge_layer",
                "Context returned only source pages; no compiled knowledge layer result is present.",
                severity="medium",
            )
        )

    provenance_weak = [
        _result_path(result)
        for result in compiled_results
        if not (result.get("source_papers") or result.get("sources") or result.get("source_pdf") or result.get("source_id"))
    ]
    if provenance_weak:
        findings.append(
            _finding(
                "weak_provenance",
                "provenance_schema",
                "Compiled results lack source_papers, sources, source_pdf, or source_id.",
                severity="medium",
                details={"paths": provenance_weak[:8]},
            )
        )

    synthesis_results = [result for result in results if _matches_family(result, "corpus:syntheses") or _matches_family(result, "type:synthesis")]
    for result in synthesis_results:
        missing = [section for section in ("Source Facts", "Wiki Synthesis", "Evidence Map", "Open Questions") if section not in _section_names(result)]
        if missing:
            findings.append(
                _finding(
                    "synthesis_missing_sections",
                    "synthesis_quality",
                    "Synthesis result is missing durable write-back sections.",
                    severity="medium",
                    details={"path": _result_path(result), "missing_sections": missing},
                )
            )

    concept_results = [result for result in results if _matches_family(result, "type:concept")]
    for result in concept_results:
        missing = [
            section
            for section in ("Implementation Implications", "Common Failure Modes", "Minimal Checks / Probes", "Evidence / Provenance")
            if section not in _section_names(result)
        ]
        if missing:
            findings.append(
                _finding(
                    "concept_missing_coding_sections",
                    "concept_layer",
                    "Concept result is not yet useful enough for coding/debug/probe workflows.",
                    severity="medium",
                    details={"path": _result_path(result), "missing_sections": missing},
                )
            )

    evidence_like = [result for result in results if _matches_family(result, "type:claim") or _matches_family(result, "type:evidence")]
    for result in evidence_like:
        sections = _section_names(result)
        if result.get("type") == "claim" and not ({"Supporting Evidence", "Provenance"} & set(sections)):
            findings.append(
                _finding(
                    "claim_without_visible_evidence",
                    "claim_evidence_traceability",
                    "Claim result does not expose supporting evidence or provenance in the context packet.",
                    severity="medium",
                    details={"path": _result_path(result)},
                )
            )
        if result.get("type") == "evidence" and not ({"Evidence Item", "Source", "Metric or Observation", "Provenance"} & set(sections)):
            findings.append(
                _finding(
                    "evidence_without_visible_source",
                    "claim_evidence_traceability",
                    "Evidence result does not expose source/provenance sections in the context packet.",
                    severity="medium",
                    details={"path": _result_path(result)},
                )
            )

    for selected in selected_pages:
        if selected.get("missing"):
            findings.append(
                _finding(
                    "selected_page_missing",
                    "entry_contract",
                    "Selected canonical page could not be read.",
                    severity="medium",
                    details={"path": selected["path"]},
                )
            )

    if proposal is not None:
        text = str(proposal.get("text") or "")
        missing = [heading for heading in ("Source Facts", "Wiki Synthesis", "Open Questions") if heading not in text]
        if missing:
            findings.append(
                _finding(
                    "proposal_missing_boundary_sections",
                    "synthesis_quality",
                    "Proposal/write-back artifact is missing core boundary sections.",
                    severity="medium",
                    details={"path": proposal.get("path"), "missing_sections": missing},
                )
            )

    return findings


def _dimension_scores(
    *,
    case: dict[str, Any],
    results: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    hard_failures: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_bucket = {}
    for finding in findings:
        by_bucket.setdefault(str(finding["repair_bucket"]), []).append(finding)
    hard_buckets = {str(failure.get("repair_bucket")) for failure in hard_failures}
    family_count = len(set(result.get("type") or result.get("corpus_type") or "paper" for result in results))
    dimension_buckets = {
        "task_usefulness": {"retrieval_context", "retrieval_ranking"},
        "retrieval_context_quality": {"retrieval_context", "retrieval_ranking"},
        "compiled_knowledge_density": {"knowledge_layer"},
        "provenance_traceability": {"provenance_schema", "claim_evidence_traceability"},
        "boundary_correctness": {"artifact_boundary", "source_quality_routing", "personalization_boundary"},
        "synthesis_quality": {"synthesis_quality"},
        "concept_usefulness": {"concept_layer"},
        "claim_evidence_support": {"claim_evidence_traceability"},
        "entry_consistency": {"entry_contract", "artifact_boundary"},
        "optimization_actionability": set(),
    }
    scores = []
    for dimension, weight, description in DIMENSIONS:
        buckets = dimension_buckets[dimension]
        bucket_findings = [finding for bucket in buckets for finding in by_bucket.get(bucket, [])]
        bucket_hard = buckets & hard_buckets
        score = 5.0
        if dimension == "compiled_knowledge_density" and results and family_count < 2:
            score -= 0.8
        if dimension == "optimization_actionability" and findings and not all(finding.get("repair_bucket") for finding in findings):
            score -= 1.0
        score -= sum(1.1 if finding.get("severity") == "high" else 0.6 for finding in bucket_findings)
        if bucket_hard:
            score = min(score, 1.0)
        if hard_failures and dimension in {"boundary_correctness", "entry_consistency"}:
            score = min(score, 1.0)
        score = max(1.0, min(5.0, round(score, 2)))
        evidence = _dimension_evidence(dimension=dimension, case=case, results=results, findings=bucket_findings, hard_failures=hard_failures)
        scores.append(
            {
                "dimension": dimension,
                "score": score,
                "weight": weight,
                "anchor": _score_anchor(score),
                "description": description,
                "evidence": evidence,
                "repair_bucket": sorted(buckets)[0] if buckets else None,
            }
        )
    return scores


def _weighted_score(dimension_scores: list[dict[str, Any]]) -> float:
    total_weight = sum(float(item["weight"]) for item in dimension_scores)
    weighted = sum(float(item["score"]) * float(item["weight"]) for item in dimension_scores)
    return round(weighted / total_weight, 3) if total_weight else 0.0


def _decision(
    *,
    weighted_score: float,
    dimension_scores: list[dict[str, Any]],
    hard_failures: list[dict[str, Any]],
    findings: list[dict[str, Any]],
) -> str:
    if hard_failures:
        return "fail"
    if any(finding.get("severity") == "high" for finding in findings):
        return "needs_refine"
    if weighted_score < 4.0 or any(float(item["score"]) <= 2.5 for item in dimension_scores):
        return "needs_refine"
    return "pass"


def _case_summary(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": case.get("id"),
        "category": case.get("category"),
        "query": case.get("query"),
        "intent": case.get("intent"),
        "problem_description": case.get("problem_description"),
        "required_page_families": case.get("required_page_families") or [],
        "required_section_groups": case.get("required_section_groups") or [],
    }


def _context_summary(context: dict[str, Any]) -> dict[str, Any]:
    results = list(context.get("results") or [])
    return {
        "schema_version": context.get("schema_version"),
        "query": context.get("query"),
        "strategy": context.get("strategy"),
        "result_count": len(results),
        "result_types": sorted(set(str(result.get("type") or result.get("result_type") or result.get("corpus_type") or "paper") for result in results)),
        "paths": [_result_path(result) for result in results[:12]],
    }


def _bucket_summary(findings: list[dict[str, Any]], hard_failures: list[dict[str, Any]]) -> dict[str, int]:
    buckets: dict[str, int] = {}
    for item in [*findings, *hard_failures]:
        bucket = str(item.get("repair_bucket") or "unknown")
        buckets[bucket] = buckets.get(bucket, 0) + 1
    return dict(sorted(buckets.items()))


def _recommended_fixes(repair_buckets: dict[str, int]) -> list[dict[str, Any]]:
    return [
        {"repair_bucket": bucket, "finding_count": count, "generalized_fix": REPAIR_FIXES.get(bucket, "Investigate and repair the shared mechanism.")}
        for bucket, count in repair_buckets.items()
    ]


def _residual_risks(
    *,
    findings: list[dict[str, Any]],
    hard_failures: list[dict[str, Any]],
    dimension_scores: list[dict[str, Any]],
) -> list[str]:
    risks: list[str] = []
    if hard_failures:
        risks.append("Hard failures block use as product-quality context until repaired.")
    weak_dimensions = [item["dimension"] for item in dimension_scores if float(item["score"]) < 4.0]
    if weak_dimensions:
        risks.append("Weak dimensions remain: " + ", ".join(weak_dimensions))
    high_findings = [finding["code"] for finding in findings if finding.get("severity") == "high"]
    if high_findings:
        risks.append("High-severity findings remain: " + ", ".join(high_findings))
    return risks or ["No blocking residual risk found by deterministic scaffold; sample with an LLM judge for semantic quality."]


def _next_eval_case_suggestions(*, findings: list[dict[str, Any]], hard_failures: list[dict[str, Any]]) -> list[str]:
    buckets = set(_bucket_summary(findings, hard_failures))
    suggestions = []
    if "retrieval_ranking" in buckets:
        suggestions.append("Add a hard-negative retrieval case that requires the missed page family and section group.")
    if "knowledge_layer" in buckets:
        suggestions.append("Add a case that asks for compiled method/topic/concept context before paper pages.")
    if "provenance_schema" in buckets:
        suggestions.append("Add a trace case that starts from a synthesis claim and follows evidence back to source papers.")
    if "artifact_boundary" in buckets:
        suggestions.append("Add a product-boundary case with high lexical overlap in .drafts/.versions to ensure suppression.")
    if "source_quality_routing" in buckets:
        suggestions.append("Add paired source-quality cleanup and scientific evidence cases to verify route separation.")
    if not suggestions:
        suggestions.append("Sample a complex end-to-end research task and judge usefulness with the same rubric.")
    return suggestions


def _artifact_paths(*, results: list[dict[str, Any]], selected_pages: list[dict[str, Any]]) -> list[tuple[str, str]]:
    paths = []
    for index, result in enumerate(results):
        for field in ("relative_path", "canonical_path", "path"):
            value = result.get(field)
            if value:
                paths.append((f"result[{index}].{field}", str(value)))
    for index, selected in enumerate(selected_pages):
        value = selected.get("relative_path") or selected.get("path")
        if value:
            paths.append((f"selected_page[{index}]", str(value)))
    return paths


def _is_source_quality_hold(result: dict[str, Any]) -> bool:
    if result.get("source_quality_linked") or result.get("source_quality_risk"):
        return True
    text = " ".join(
        str(result.get(field) or "")
        for field in ("review_state", "quality_gate", "quality_state", "validation_state", "trust_state")
    ).lower()
    return any(token in text for token in ("source_quality_hold", "needs_source_recheck", "untrusted_source_text"))


def _finding(code: str, repair_bucket: str, message: str, *, severity: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "repair_bucket": repair_bucket,
        "message": message,
        "details": details or {},
    }


def _matches_family(result: dict[str, Any], family: str) -> bool:
    family = str(family)
    if family.startswith("type:"):
        expected = family.split(":", 1)[1]
        return expected in {str(result.get("type") or ""), str(result.get("result_type") or "")}
    if family.startswith("corpus:"):
        expected = family.split(":", 1)[1]
        return expected == str(result.get("corpus_type") or "")
    if family.startswith("role:"):
        expected = family.split(":", 1)[1]
        return expected == str(result.get("knowledge_role") or "")
    if family.startswith("quality:"):
        expected = family.split(":", 1)[1]
        quality_text = " ".join(str(result.get(field) or "") for field in ("review_state", "quality_gate", "quality_state", "trust_state"))
        return expected in quality_text
    path = _result_path(result)
    return _glob_match(path, family)


def _group_sections_present(*, results: list[dict[str, Any]], families: list[str], sections: list[str]) -> bool:
    for result in results:
        if not any(_matches_family(result, family) for family in families):
            continue
        section_names = set(_section_names(result))
        if any(section in section_names for section in sections):
            return True
    return False


def _section_names(result: dict[str, Any]) -> list[str]:
    headings = [str(item) for item in result.get("section_headings") or []]
    for section in result.get("matched_sections") or []:
        heading = section.get("heading") if isinstance(section, dict) else None
        if heading:
            headings.append(str(heading))
    previews = result.get("section_previews") or {}
    if isinstance(previews, dict):
        headings.extend(str(key) for key in previews)
    return _dedupe(headings)


def _result_path(result: dict[str, Any]) -> str:
    return str(result.get("relative_path") or result.get("canonical_path") or result.get("path") or result.get("page_id") or "")


def _dimension_evidence(
    *,
    dimension: str,
    case: dict[str, Any],
    results: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    hard_failures: list[dict[str, Any]],
) -> list[str]:
    evidence = []
    if dimension in {"task_usefulness", "retrieval_context_quality"}:
        evidence.append(f"results={len(results)} required_families={len(case.get('required_page_families') or [])}")
    if dimension == "compiled_knowledge_density":
        evidence.append("result_types=" + ", ".join(sorted(set(str(result.get("type") or result.get("corpus_type") or "paper") for result in results))))
    if findings:
        evidence.extend(str(finding["code"]) for finding in findings[:4])
    if hard_failures and dimension in {"boundary_correctness", "entry_consistency"}:
        evidence.extend(str(failure["code"]) for failure in hard_failures[:4])
    return evidence or ["No deterministic issue found for this dimension."]


def _score_anchor(score: float) -> str:
    if score >= 4.7:
        return "5 - strong system-level evidence"
    if score >= 3.7:
        return "4 - usable with minor refinements"
    if score >= 2.7:
        return "3 - partially useful but needs repair"
    if score >= 1.7:
        return "2 - weak or unreliable"
    return "1 - hard failure or unsafe boundary break"


def _render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# System Evaluation",
        "",
        f"- Decision: `{report['decision']}`",
        f"- Weighted score: `{report['weighted_score']}`",
        f"- Case: `{report['case'].get('id')}`",
        f"- Query: {report['case'].get('query') or report['context_summary'].get('query')}",
        "",
        "## Dimension Scores",
        "",
    ]
    for item in report["dimension_scores"]:
        lines.append(f"- `{item['dimension']}`: {item['score']} ({item['anchor']})")
    lines.extend(["", "## Hard Failures", ""])
    if report["hard_failures"]:
        for failure in report["hard_failures"]:
            lines.append(f"- `{failure['code']}` ({failure['repair_bucket']}): {failure['message']}")
    else:
        lines.append("- None.")
    lines.extend(["", "## Findings", ""])
    if report["findings"]:
        for finding in report["findings"]:
            lines.append(f"- `{finding['code']}` [{finding['severity']}/{finding['repair_bucket']}]: {finding['message']}")
    else:
        lines.append("- None.")
    lines.extend(["", "## Recommended Generalized Fixes", ""])
    for fix in report["recommended_generalized_fixes"]:
        lines.append(f"- `{fix['repair_bucket']}`: {fix['generalized_fix']}")
    lines.extend(["", "## Residual Risks", ""])
    for risk in report["residual_risks"]:
        lines.append(f"- {risk}")
    lines.extend(["", "## Next Eval Case Suggestions", ""])
    for suggestion in report["next_eval_case_suggestions"]:
        lines.append(f"- {suggestion}")
    lines.append("")
    return "\n".join(lines)


def _render_judge_packet(
    *,
    case: dict[str, Any],
    context: dict[str, Any],
    report: dict[str, Any],
    rubric_path: Path | None,
) -> str:
    rubric_text = rubric_path.read_text(encoding="utf-8") if rubric_path and rubric_path.exists() else ""
    payload = {
        "schema_version": SYSTEM_EVALUATION_JUDGE_PACKET_SCHEMA_VERSION,
        "task": "Review the deterministic scaffold and judge whether this Meridian Paper Wiki use case is system-quality.",
        "required_output": {
            "decision": "pass | needs_refine | fail",
            "dimension_scores": "1-5 scores with short rationale",
            "hard_failures": "any safety/product-boundary failures",
            "repair_buckets": "mechanism-level buckets",
            "recommended_generalized_fixes": "fix mechanisms, not just this case",
        },
        "case": case,
        "context_summary": report["context_summary"],
        "deterministic_evaluation": {
            "decision": report["decision"],
            "weighted_score": report["weighted_score"],
            "dimension_scores": report["dimension_scores"],
            "hard_failures": report["hard_failures"],
            "findings": report["findings"],
        },
    }
    lines = [
        "# System Evaluation Judge Packet",
        "",
        "Use the rubric to review whether the retrieved context and optional outputs support the task as a Meridian LLM Wiki workflow.",
        "",
        "## Rubric",
        "",
        rubric_text.strip() or "No external rubric supplied; use the embedded deterministic schema and project boundaries.",
        "",
        "## Packet JSON",
        "",
        "```json",
        json.dumps(payload, indent=2, ensure_ascii=False),
        "```",
        "",
        "## Retrieved Result Paths",
        "",
    ]
    for result in context.get("results") or []:
        lines.append(f"- `{_result_path(result)}` ({result.get('type') or result.get('corpus_type') or 'unknown'})")
    lines.append("")
    return "\n".join(lines)


def _relative_to_wiki(path: Path, *, wiki_root: Path) -> str:
    try:
        return path.relative_to(wiki_root).as_posix()
    except ValueError:
        return path.as_posix()


def _glob_match(path: str, pattern: str) -> bool:
    from fnmatch import fnmatch

    return fnmatch(path, pattern) or fnmatch(path.lstrip("/"), pattern)


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _dedupe_dicts(items: list[dict[str, Any]], *, key_fields: tuple[str, ...]) -> list[dict[str, Any]]:
    seen = set()
    result = []
    for item in items:
        key = tuple(str(item.get(field) or "") for field in key_fields)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result
