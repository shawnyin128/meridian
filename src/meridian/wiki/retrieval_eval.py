from __future__ import annotations

import fnmatch
import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from meridian.wiki.corpus import RetrievalResult, build_paper_catalog, retrieve_papers
from meridian.wiki.vault import audit_sources, lint_wiki


RETRIEVAL_EVAL_SCHEMA_VERSION = "meridian.wiki_retrieval_eval.v0"
RETRIEVAL_EVAL_SUMMARY_SCHEMA_VERSION = "meridian.wiki_retrieval_eval_summary.v0"

REQUIRED_RETRIEVAL_CASE_FIELDS = {
    "id",
    "category",
    "query",
    "intent",
    "required_pages",
    "acceptable_pages",
    "distractor_pages",
    "required_sections",
    "expected_context_properties",
    "must_not_do",
    "judge_rubric",
}


@dataclass(frozen=True)
class RetrievalEvalResult:
    manifest_path: Path
    summary_path: Path
    total_cases: int
    deterministic_passes: int
    deterministic_failures: int


@dataclass(frozen=True)
class RetrievalEvalSummaryResult:
    summary_path: Path
    total_cases: int
    judge_results: int


def iter_retrieval_cases(cases_path: Path) -> Iterator[dict[str, Any]]:
    if not cases_path.exists():
        raise FileNotFoundError(f"retrieval case file does not exist: {cases_path}")
    with cases_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                case = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid retrieval JSONL at line {line_number}: {exc}") from exc
            if not isinstance(case, dict):
                raise ValueError(f"retrieval case line {line_number} must be an object")
            missing = sorted(REQUIRED_RETRIEVAL_CASE_FIELDS - set(case))
            if missing:
                raise ValueError(
                    f"retrieval case line {line_number} missing required fields: {', '.join(missing)}"
                )
            yield case


def run_retrieval_eval(
    *,
    cases_path: Path,
    wiki_root: Path,
    out_dir: Path,
    rubric_path: Path | None = None,
    top_k: int = 5,
    catalog_path: Path | None = None,
    overwrite: bool = False,
) -> RetrievalEvalResult:
    if top_k < 1:
        raise ValueError("top_k must be >= 1")
    if out_dir.exists() and any(out_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"retrieval eval output directory already exists: {out_dir}")
    if out_dir.exists() and overwrite:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    catalog = build_paper_catalog(wiki_root=wiki_root, out_path=catalog_path)
    source_audit = _safe_source_audit(wiki_root)
    lint = _safe_lint(wiki_root)
    results: list[dict[str, Any]] = []

    for case in iter_retrieval_cases(cases_path):
        case_id = str(case["id"])
        case_dir = out_dir / case_id
        case_dir.mkdir(parents=True, exist_ok=True)
        case_snapshot = case_dir / "case.json"
        case_snapshot.write_text(json.dumps(case, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        context_path = case_dir / "context.md"
        context_json_path = case_dir / "context.json"
        try:
            retrieval = retrieve_papers(
                query=str(case["query"]),
                wiki_root=wiki_root,
                catalog_path=catalog.catalog_path,
                top_k=top_k,
                packet_path=context_path,
                result_path=context_json_path,
            )
            metrics = score_retrieval_case(case=case, retrieval=retrieval, context_path=context_path)
            judge_packet = case_dir / "judge-packet.md"
            judge_packet.write_text(
                render_retrieval_judge_packet(
                    case=case,
                    metrics=metrics,
                    context_path=context_path,
                    context_json_path=context_json_path,
                    rubric_path=rubric_path,
                    source_audit=source_audit,
                    lint=lint,
                ),
                encoding="utf-8",
            )
            results.append(
                {
                    "id": case_id,
                    "status": "evaluated",
                    "query": case["query"],
                    "intent": case["intent"],
                    "context_packet": str(context_path),
                    "context_json": str(context_json_path),
                    "judge_packet": str(judge_packet),
                    "judge_result_expected_path": str(case_dir / "judge-result.json"),
                    "case_snapshot": str(case_snapshot),
                    "metrics": metrics,
                }
            )
        except Exception as exc:  # noqa: BLE001 - keep per-case failures inspectable.
            results.append(
                {
                    "id": case_id,
                    "status": "error",
                    "query": case.get("query"),
                    "intent": case.get("intent"),
                    "case_snapshot": str(case_snapshot),
                    "error": str(exc),
                    "metrics": {
                        "deterministic_decision": "fail",
                        "hard_fails": ["case_execution_error"],
                    },
                }
            )

    manifest_path = out_dir / "retrieval_manifest.json"
    manifest = {
        "schema_version": RETRIEVAL_EVAL_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cases_path": str(cases_path),
        "wiki_root": str(wiki_root),
        "catalog": str(catalog.catalog_path),
        "catalog_count": catalog.count,
        "rubric": str(rubric_path) if rubric_path else None,
        "top_k": top_k,
        "source_audit": source_audit,
        "wiki_lint": lint,
        "results": results,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    summary_path = summarize_retrieval_eval(manifest_path=manifest_path).summary_path
    deterministic_passes = sum(1 for item in results if item.get("metrics", {}).get("deterministic_decision") == "pass")
    deterministic_failures = len(results) - deterministic_passes
    return RetrievalEvalResult(
        manifest_path=manifest_path,
        summary_path=summary_path,
        total_cases=len(results),
        deterministic_passes=deterministic_passes,
        deterministic_failures=deterministic_failures,
    )


def summarize_retrieval_eval(*, manifest_path: Path, out_path: Path | None = None) -> RetrievalEvalSummaryResult:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    results = list(manifest.get("results") or [])
    judge_decisions: dict[str, int] = {}
    judge_results = 0
    deterministic_decisions: dict[str, int] = {}
    recalls = []
    section_rates = []
    source_quality_passes = 0
    source_quality_cases = 0

    for result in results:
        metrics = dict(result.get("metrics") or {})
        decision = str(metrics.get("deterministic_decision") or "unknown")
        deterministic_decisions[decision] = deterministic_decisions.get(decision, 0) + 1
        recall = metrics.get("required_recall_at_k")
        if isinstance(recall, (int, float)):
            recalls.append(float(recall))
        section_rate = metrics.get("section_hit_rate")
        if isinstance(section_rate, (int, float)):
            section_rates.append(float(section_rate))
        source_quality = metrics.get("source_quality_routing")
        if isinstance(source_quality, dict):
            source_quality_cases += 1
            if source_quality.get("passed"):
                source_quality_passes += 1

        judge_path_raw = str(result.get("judge_result_expected_path") or "")
        judge_path = Path(judge_path_raw) if judge_path_raw else None
        if judge_path is not None and judge_path.is_file():
            judge_payload = json.loads(judge_path.read_text(encoding="utf-8"))
            judge_results += 1
            judge_decision = str(judge_payload.get("decision") or "unknown")
            judge_decisions[judge_decision] = judge_decisions.get(judge_decision, 0) + 1
            result["judge_result"] = str(judge_path)
            result["judge_decision"] = judge_decision

    summary = {
        "schema_version": RETRIEVAL_EVAL_SUMMARY_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "manifest": str(manifest_path),
        "total_cases": len(results),
        "deterministic_decisions": deterministic_decisions,
        "judge_results": judge_results,
        "judge_decisions": judge_decisions,
        "average_required_recall_at_k": _avg(recalls),
        "average_section_hit_rate": _avg(section_rates),
        "source_quality_routing_pass_rate": (
            source_quality_passes / source_quality_cases if source_quality_cases else None
        ),
        "results": [
            {
                "id": result.get("id"),
                "status": result.get("status"),
                "deterministic_decision": (result.get("metrics") or {}).get("deterministic_decision"),
                "hard_fails": (result.get("metrics") or {}).get("hard_fails", []),
                "required_recall_at_k": (result.get("metrics") or {}).get("required_recall_at_k"),
                "section_hit_rate": (result.get("metrics") or {}).get("section_hit_rate"),
                "judge_decision": result.get("judge_decision"),
            }
            for result in results
        ],
    }
    summary_path = out_path or manifest_path.with_name("retrieval_summary.json")
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest["results"] = results
    manifest["summary"] = str(summary_path)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return RetrievalEvalSummaryResult(
        summary_path=summary_path,
        total_cases=len(results),
        judge_results=judge_results,
    )


def score_retrieval_case(
    *,
    case: dict[str, Any],
    retrieval: RetrievalResult,
    context_path: Path,
) -> dict[str, Any]:
    results = retrieval.results
    relative_paths = [str(item.get("relative_path") or "") for item in results]
    required_pages = [str(item) for item in case.get("required_pages") or []]
    acceptable_pages = [str(item) for item in case.get("acceptable_pages") or []]
    distractor_pages = [str(item) for item in case.get("distractor_pages") or []]
    required_hits = _pattern_hits(required_pages, results)
    acceptable_hits = _pattern_hits(acceptable_pages, results)
    distractor_hits = _pattern_hits(distractor_pages, results)
    section_metrics = _score_required_sections(case.get("required_sections") or [], results)
    explainable_count = sum(1 for item in results if item.get("matched_frontmatter"))
    context_chars = len(context_path.read_text(encoding="utf-8")) if context_path.exists() else 0

    hard_fails = []
    missing_required = [pattern for pattern in required_pages if pattern not in required_hits]
    if required_pages and missing_required:
        hard_fails.append("missing_required_pages")
    if distractor_hits and results:
        first = results[0]
        if _matches_any(first, distractor_pages):
            hard_fails.append("top_result_is_declared_distractor")
    if section_metrics["required_section_total"] and section_metrics["missing_required_sections"]:
        hard_fails.append("missing_required_sections")

    source_quality = _source_quality_routing(case=case, results=results)
    if source_quality and not source_quality["passed"]:
        hard_fails.append("source_quality_routing_failed")

    decision = "pass" if not hard_fails else "fail"
    if decision == "pass" and required_pages and len(required_hits) < len(required_pages):
        decision = "needs_refine"
    if decision == "pass" and section_metrics["required_section_total"] and section_metrics["section_hit_rate"] < 1.0:
        decision = "needs_refine"

    return {
        "schema_version": "meridian.wiki_retrieval_case_metrics.v0",
        "deterministic_decision": decision,
        "top_k": len(results),
        "retrieved_pages": relative_paths,
        "required_pages": required_pages,
        "required_page_hits": sorted(required_hits),
        "missing_required_pages": missing_required,
        "required_recall_at_k": len(required_hits) / len(required_pages) if required_pages else None,
        "acceptable_page_hits": sorted(acceptable_hits),
        "distractor_hits": sorted(distractor_hits),
        "distractor_hit_count": len(distractor_hits),
        "distractor_precision_at_k": (
            1.0 - (len([item for item in results if _matches_any(item, distractor_pages)]) / len(results))
            if results and distractor_pages
            else None
        ),
        "required_section_hits": section_metrics["required_section_hits"],
        "missing_required_sections": section_metrics["missing_required_sections"],
        "section_hit_rate": section_metrics["section_hit_rate"],
        "frontmatter_match_explainability": explainable_count / len(results) if results else 0.0,
        "context_chars": context_chars,
        "context_compact": context_chars <= 12000,
        "source_quality_routing": source_quality,
        "hard_fails": hard_fails,
    }


def render_retrieval_judge_packet(
    *,
    case: dict[str, Any],
    metrics: dict[str, Any],
    context_path: Path,
    context_json_path: Path,
    rubric_path: Path | None,
    source_audit: dict[str, Any] | None,
    lint: dict[str, Any] | None,
) -> str:
    rubric_text = rubric_path.read_text(encoding="utf-8") if rubric_path and rubric_path.exists() else "No rubric file provided."
    context_text = context_path.read_text(encoding="utf-8") if context_path.exists() else "Missing context.md"
    context_json = context_json_path.read_text(encoding="utf-8") if context_json_path.exists() else "{}"
    return "\n".join(
        [
            "---",
            'schema_version: "meridian.wiki_retrieval_judge_packet.v0"',
            f'case_id: "{_escape(str(case.get("id")))}"',
            "---",
            "# Wiki Retrieval Judge Packet",
            "",
            "Judge the retrieval context packet, not a final answer. The packet should give a future research agent the right pages, sections, provenance signals, and caveats.",
            "",
            "## Case",
            "",
            "```json",
            json.dumps(case, indent=2, ensure_ascii=False),
            "```",
            "",
            "## Deterministic Metrics",
            "",
            "```json",
            json.dumps(metrics, indent=2, ensure_ascii=False),
            "```",
            "",
            "## Source Audit Summary",
            "",
            "```json",
            json.dumps(source_audit or {}, indent=2, ensure_ascii=False),
            "```",
            "",
            "## Wiki Lint Summary",
            "",
            "```json",
            json.dumps(lint or {}, indent=2, ensure_ascii=False),
            "```",
            "",
            "## Retrieval Context Markdown",
            "",
            context_text.rstrip(),
            "",
            "## Retrieval Context JSON",
            "",
            "```json",
            context_json.rstrip(),
            "```",
            "",
            "## Rubric",
            "",
            rubric_text.rstrip(),
            "",
            "## Required Judge Output",
            "",
            "Write JSON matching `meridian.wiki_retrieval_judge_result.v0` to `judge-result.json` beside this packet.",
        ]
    ).rstrip() + "\n"


def _score_required_sections(required_sections: list[Any], results: list[dict[str, Any]]) -> dict[str, Any]:
    hits = []
    missing = []
    total = 0
    for requirement in required_sections:
        if not isinstance(requirement, dict):
            continue
        page = str(requirement.get("page") or "")
        sections = [str(section) for section in requirement.get("sections") or []]
        for section in sections:
            total += 1
            if any(_matches_page(result, page) and _result_has_section(result, section) for result in results):
                hits.append({"page": page, "section": section})
            else:
                missing.append({"page": page, "section": section})
    return {
        "required_section_total": total,
        "required_section_hits": hits,
        "missing_required_sections": missing,
        "section_hit_rate": len(hits) / total if total else None,
    }


def _pattern_hits(patterns: list[str], results: list[dict[str, Any]]) -> set[str]:
    return {pattern for pattern in patterns if any(_matches_page(result, pattern) for result in results)}


def _matches_any(result: dict[str, Any], patterns: list[str]) -> bool:
    return any(_matches_page(result, pattern) for pattern in patterns)


def _matches_page(result: dict[str, Any], pattern: str) -> bool:
    if not pattern:
        return False
    candidates = {
        str(result.get("relative_path") or ""),
        str(result.get("page_id") or ""),
        Path(str(result.get("relative_path") or "")).name,
    }
    pattern_no_suffix = pattern[:-3] if pattern.endswith(".md") else pattern
    candidates_no_suffix = {candidate[:-3] if candidate.endswith(".md") else candidate for candidate in candidates}
    for candidate in candidates | candidates_no_suffix:
        if candidate == pattern or candidate == pattern_no_suffix:
            return True
        if fnmatch.fnmatch(candidate, pattern) or fnmatch.fnmatch(candidate, pattern_no_suffix):
            return True
    return False


def _result_has_section(result: dict[str, Any], section: str) -> bool:
    headings = {str(item.get("heading") or "") for item in result.get("matched_sections") or []}
    return section in headings


def _source_quality_routing(*, case: dict[str, Any], results: list[dict[str, Any]]) -> dict[str, Any] | None:
    if str(case.get("intent")) != "source_quality":
        return None
    quality_hits = []
    reliable_evidence_hits = []
    for result in results:
        quality_text = " ".join(
            str(result.get(field) or "")
            for field in ("review_state", "quality_gate", "confidence")
        ).lower()
        page = str(result.get("relative_path") or result.get("page_id") or "")
        if any(token in quality_text for token in ("hold", "fail", "low", "source", "ocr", "missing")):
            quality_hits.append(page)
        if "pass" in quality_text and "high" in quality_text:
            reliable_evidence_hits.append(page)
    return {
        "passed": bool(quality_hits) and not reliable_evidence_hits,
        "quality_hits": quality_hits,
        "reliable_evidence_hits": reliable_evidence_hits,
    }


def _safe_source_audit(wiki_root: Path) -> dict[str, Any] | None:
    try:
        result = audit_sources(wiki_root=wiki_root)
        payload = json.loads(result.audit_path.read_text(encoding="utf-8"))
        return {
            "status": "available",
            "total": payload.get("total"),
            "missing_managed": payload.get("missing_managed"),
            "sha_mismatches": payload.get("sha_mismatches"),
            "duplicate_sha_groups": payload.get("duplicate_sha_groups"),
            "path": str(result.audit_path),
        }
    except Exception as exc:  # noqa: BLE001 - source audit is supporting evidence.
        return {"status": "unavailable", "error": str(exc)}


def _safe_lint(wiki_root: Path) -> dict[str, Any] | None:
    try:
        result = lint_wiki(wiki_root=wiki_root)
        return {
            "status": result.status,
            "findings": len(result.findings),
            "path": str(result.report_path),
        }
    except Exception as exc:  # noqa: BLE001 - lint is supporting evidence.
        return {"status": "unavailable", "error": str(exc)}


def _avg(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
