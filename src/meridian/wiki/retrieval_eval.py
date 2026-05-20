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
RETRIEVAL_OPTIMIZATION_SCHEMA_VERSION = "meridian.retrieval_optimization_eval.v1"
RETRIEVAL_OPTIMIZATION_SUMMARY_SCHEMA_VERSION = "meridian.retrieval_optimization_summary.v1"

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


@dataclass(frozen=True)
class RetrievalOptimizationEvalResult:
    manifest_path: Path
    summary_path: Path
    summary_markdown_path: Path
    total_cases: int
    baseline_strategy: str
    candidate_strategy: str


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


def iter_retrieval_optimization_cases(cases_path: Path) -> Iterator[dict[str, Any]]:
    if not cases_path.exists():
        raise FileNotFoundError(f"retrieval optimization case file does not exist: {cases_path}")
    required = {"id", "query", "problem_description", "required_page_families", "rubric"}
    with cases_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                case = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid retrieval optimization JSONL at line {line_number}: {exc}") from exc
            if not isinstance(case, dict):
                raise ValueError(f"retrieval optimization case line {line_number} must be an object")
            missing = sorted(required - set(case))
            if missing:
                raise ValueError(
                    f"retrieval optimization case line {line_number} missing required fields: {', '.join(missing)}"
                )
            case.setdefault("category", "retrieval_optimization")
            case.setdefault("acceptable_adjacent_pages", [])
            case.setdefault("required_page_family_groups", [])
            case.setdefault("required_sections", [])
            case.setdefault("required_section_groups", [])
            case.setdefault("expected_evidence_types", [])
            case.setdefault("hard_distractors", [])
            case.setdefault("must_not_retrieve_as_evidence", [])
            case.setdefault("context_packet_expectations", [])
            yield case


def run_retrieval_optimization_eval(
    *,
    cases_path: Path,
    wiki_root: Path,
    out_dir: Path,
    rubric_path: Path | None = None,
    top_k: int = 8,
    catalog_path: Path | None = None,
    baseline_strategy: str = "v0",
    candidate_strategy: str = "v1",
    overwrite: bool = False,
) -> RetrievalOptimizationEvalResult:
    if top_k < 1:
        raise ValueError("top_k must be >= 1")
    if out_dir.exists() and any(out_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"retrieval optimization output directory already exists: {out_dir}")
    if out_dir.exists() and overwrite:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    catalog = build_paper_catalog(wiki_root=wiki_root, out_path=catalog_path)
    source_audit = _safe_source_audit(wiki_root)
    lint = _safe_lint(wiki_root)
    results: list[dict[str, Any]] = []

    for case in iter_retrieval_optimization_cases(cases_path):
        case_id = str(case["id"])
        case_dir = out_dir / case_id
        case_dir.mkdir(parents=True, exist_ok=True)
        (case_dir / "case.json").write_text(json.dumps(case, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        contexts: dict[str, dict[str, Any]] = {}
        for label, strategy in (("v0", baseline_strategy), ("v1", candidate_strategy)):
            context_path = case_dir / f"context.{label}.md"
            context_json_path = case_dir / f"context.{label}.json"
            retrieval = retrieve_papers(
                query=str(case["query"]),
                wiki_root=wiki_root,
                catalog_path=catalog.catalog_path,
                top_k=top_k,
                strategy=strategy,
                packet_path=context_path,
                result_path=context_json_path,
            )
            metrics = score_retrieval_optimization_case(
                case=case,
                retrieval=retrieval,
                context_path=context_path,
                top_k=top_k,
            )
            contexts[label] = {
                "strategy": strategy,
                "context_packet": str(context_path),
                "context_json": str(context_json_path),
                "metrics": metrics,
                "retrieved_pages": [item.get("relative_path") for item in retrieval.results],
            }

        judge_packet = case_dir / "judge-packet.md"
        judge_packet.write_text(
            render_retrieval_optimization_judge_packet(
                case=case,
                contexts=contexts,
                rubric_path=rubric_path,
                source_audit=source_audit,
                lint=lint,
            ),
            encoding="utf-8",
        )
        result = {
            "id": case_id,
            "query": case["query"],
            "intent": case.get("intent"),
            "case_snapshot": str(case_dir / "case.json"),
            "judge_packet": str(judge_packet),
            "judge_result_expected_path": str(case_dir / "judge-result.json"),
            "contexts": contexts,
            "comparison": _compare_optimization_metrics(contexts["v0"]["metrics"], contexts["v1"]["metrics"]),
        }
        results.append(result)

    manifest_path = out_dir / "retrieval_manifest.json"
    manifest = {
        "schema_version": RETRIEVAL_OPTIMIZATION_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cases_path": str(cases_path),
        "wiki_root": str(wiki_root),
        "catalog": str(catalog.catalog_path),
        "catalog_count": catalog.count,
        "rubric": str(rubric_path) if rubric_path else None,
        "top_k": top_k,
        "baseline_strategy": baseline_strategy,
        "candidate_strategy": candidate_strategy,
        "source_audit": source_audit,
        "wiki_lint": lint,
        "results": results,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    summary_path, summary_markdown_path = summarize_retrieval_optimization_eval(manifest_path=manifest_path)
    return RetrievalOptimizationEvalResult(
        manifest_path=manifest_path,
        summary_path=summary_path,
        summary_markdown_path=summary_markdown_path,
        total_cases=len(results),
        baseline_strategy=baseline_strategy,
        candidate_strategy=candidate_strategy,
    )


def run_retrieval_eval(
    *,
    cases_path: Path,
    wiki_root: Path,
    out_dir: Path,
    rubric_path: Path | None = None,
    top_k: int = 5,
    catalog_path: Path | None = None,
    strategy: str = "v1",
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
                strategy=strategy,
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
        "strategy": strategy,
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


def score_retrieval_optimization_case(
    *,
    case: dict[str, Any],
    retrieval: RetrievalResult,
    context_path: Path,
    top_k: int,
) -> dict[str, Any]:
    results = retrieval.results
    required = [str(item) for item in case.get("required_page_families") or []]
    required_groups = [
        [str(pattern) for pattern in group]
        for group in case.get("required_page_family_groups") or []
        if isinstance(group, list)
    ]
    acceptable = [str(item) for item in case.get("acceptable_adjacent_pages") or []]
    hard_distractors = [str(item) for item in case.get("hard_distractors") or []]
    forbidden_evidence = [str(item) for item in case.get("must_not_retrieve_as_evidence") or []]
    required_hits = _pattern_hits(required, results)
    group_metrics = _score_required_page_groups(required_groups, results)
    acceptable_hits = _pattern_hits(acceptable, results)
    distractor_hit_count = sum(1 for item in results if _matches_any(item, hard_distractors))
    forbidden_hit_count = sum(1 for item in results if _matches_any(item, forbidden_evidence))
    section_metrics = _merge_section_metrics(
        _score_required_sections(case.get("required_sections") or [], results),
        _score_required_section_groups(case.get("required_section_groups") or [], results),
    )
    context_text = context_path.read_text(encoding="utf-8") if context_path.exists() else ""
    evidence_hit_rate = _evidence_hit_rate(case.get("expected_evidence_types") or [], context_text)
    query_intent_coverage = _query_intent_coverage(case=case, context_text=context_text, results=results)
    redundancy_rate = _redundancy_rate(results)
    mrr = _mean_reciprocal_rank(required, results)
    source_quality_failure = _source_quality_failure(case=case, results=results)

    hard_fails = []
    if required and len(required_hits) < len(required):
        hard_fails.append("missing_required_page_family")
    if group_metrics["missing_required_page_family_groups"]:
        hard_fails.append("missing_required_page_family_group")
    if section_metrics["required_section_total"] and section_metrics["section_hit_rate"] < 0.8:
        hard_fails.append("missing_required_sections")
    if hard_distractors and results and _matches_any(results[0], hard_distractors):
        hard_fails.append("top_result_is_hard_distractor")
    if source_quality_failure:
        hard_fails.append("source_quality_hard_failure")

    required_total = len(required) + len(required_groups)
    required_hit_total = len(required_hits) + len(group_metrics["required_page_group_hits"])
    return {
        "schema_version": "meridian.retrieval_optimization_case_metrics.v1",
        "top_k": len(results),
        "required_recall_at_k": required_hit_total / required_total if required_total else None,
        "required_page_hits": sorted(required_hits),
        "missing_required_page_families": [pattern for pattern in required if pattern not in required_hits],
        "required_page_group_hits": group_metrics["required_page_group_hits"],
        "missing_required_page_family_groups": group_metrics["missing_required_page_family_groups"],
        "acceptable_page_hits": sorted(acceptable_hits),
        "mrr": mrr if mrr is not None else group_metrics["page_group_mrr"],
        "section_hit_rate": section_metrics["section_hit_rate"],
        "required_section_hits": section_metrics["required_section_hits"],
        "missing_required_sections": section_metrics["missing_required_sections"],
        "evidence_hit_rate": evidence_hit_rate,
        "hard_distractor_rate": distractor_hit_count / max(len(results), 1),
        "hard_distractor_hit_count": distractor_hit_count,
        "source_quality_failure_rate": 1.0 if source_quality_failure else 0.0,
        "forbidden_evidence_hit_count": forbidden_hit_count,
        "context_chars": len(context_text),
        "context_compactness": max(0.0, 1.0 - (len(context_text) / 18000)),
        "redundancy_rate": redundancy_rate,
        "family_coverage": required_hit_total / required_total if required_total else None,
        "query_intent_coverage": query_intent_coverage,
        "hard_fails": hard_fails,
        "deterministic_decision": "pass" if not hard_fails else "fail",
    }


def summarize_retrieval_optimization_eval(*, manifest_path: Path) -> tuple[Path, Path]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    results = list(manifest.get("results") or [])
    summary: dict[str, Any] = {
        "schema_version": RETRIEVAL_OPTIMIZATION_SUMMARY_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "manifest": str(manifest_path),
        "total_cases": len(results),
        "baseline_strategy": manifest.get("baseline_strategy"),
        "candidate_strategy": manifest.get("candidate_strategy"),
        "metrics": {
            "v0": _aggregate_optimization_metrics(results, label="v0"),
            "v1": _aggregate_optimization_metrics(results, label="v1"),
        },
        "deltas": {},
        "cases": [],
    }
    for metric in (
        "required_recall_at_k",
        "mrr",
        "section_hit_rate",
        "evidence_hit_rate",
        "hard_distractor_rate",
        "source_quality_failure_rate",
        "context_compactness",
        "redundancy_rate",
        "family_coverage",
        "query_intent_coverage",
    ):
        v0 = summary["metrics"]["v0"].get(metric)
        v1 = summary["metrics"]["v1"].get(metric)
        summary["deltas"][metric] = (v1 - v0) if isinstance(v0, (int, float)) and isinstance(v1, (int, float)) else None
    for result in results:
        v0_metrics = ((result.get("contexts") or {}).get("v0") or {}).get("metrics") or {}
        v1_metrics = ((result.get("contexts") or {}).get("v1") or {}).get("metrics") or {}
        summary["cases"].append(
            {
                "id": result.get("id"),
                "v0_decision": v0_metrics.get("deterministic_decision"),
                "v1_decision": v1_metrics.get("deterministic_decision"),
                "v0_hard_fails": v0_metrics.get("hard_fails") or [],
                "v1_hard_fails": v1_metrics.get("hard_fails") or [],
                "comparison": result.get("comparison") or {},
            }
        )

    summary_path = manifest_path.with_name("summary.json")
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    summary_markdown_path = manifest_path.with_name("summary.md")
    summary_markdown_path.write_text(_render_optimization_summary_markdown(summary), encoding="utf-8")
    manifest["summary"] = str(summary_path)
    manifest["summary_markdown"] = str(summary_markdown_path)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return summary_path, summary_markdown_path


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


def render_retrieval_optimization_judge_packet(
    *,
    case: dict[str, Any],
    contexts: dict[str, dict[str, Any]],
    rubric_path: Path | None,
    source_audit: dict[str, Any] | None,
    lint: dict[str, Any] | None,
) -> str:
    rubric_text = rubric_path.read_text(encoding="utf-8") if rubric_path and rubric_path.exists() else "No rubric file provided."
    blocks = [
        "---",
        'schema_version: "meridian.retrieval_optimization_judge_packet.v1"',
        f'case_id: "{_escape(str(case.get("id")))}"',
        "---",
        "# Retrieval Optimization Judge Packet",
        "",
        "Judge whether the candidate retrieval packet improves research usefulness over the baseline. Focus on paper family selection, section/evidence targeting, hard distractor suppression, source-quality routing, and context compactness.",
        "",
        "## Case",
        "",
        "```json",
        json.dumps(case, indent=2, ensure_ascii=False),
        "```",
        "",
        "## Source / Lint",
        "",
        "```json",
        json.dumps({"source_audit": source_audit, "wiki_lint": lint}, indent=2, ensure_ascii=False),
        "```",
    ]
    for label in ("v0", "v1"):
        context = contexts[label]
        context_path = Path(str(context["context_packet"]))
        context_json_path = Path(str(context["context_json"]))
        blocks.extend(
            [
                "",
                f"## {label.upper()} Metrics",
                "",
                "```json",
                json.dumps(context["metrics"], indent=2, ensure_ascii=False),
                "```",
                "",
                f"## {label.upper()} Context Markdown",
                "",
                context_path.read_text(encoding="utf-8").rstrip() if context_path.exists() else "Missing context markdown.",
                "",
                f"## {label.upper()} Context JSON",
                "",
                "```json",
                context_json_path.read_text(encoding="utf-8").rstrip() if context_json_path.exists() else "{}",
                "```",
            ]
        )
    blocks.extend(
        [
            "",
            "## Rubric",
            "",
            rubric_text.rstrip(),
            "",
            "## Required Judge Output",
            "",
            "Write JSON to `judge-result.json` with decision, baseline_failures, candidate_failures, improvement_notes, residual_risks, and repair_buckets.",
        ]
    )
    return "\n".join(blocks).rstrip() + "\n"


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


def _score_required_page_groups(required_groups: list[list[str]], results: list[dict[str, Any]]) -> dict[str, Any]:
    hits = []
    missing = []
    reciprocal_ranks = []
    for index, group in enumerate(required_groups, start=1):
        matched_pattern = None
        matched_rank = None
        for rank, result in enumerate(results, start=1):
            for pattern in group:
                if _matches_page(result, pattern):
                    matched_pattern = pattern
                    matched_rank = rank
                    break
            if matched_pattern is not None:
                break
        group_id = f"group-{index}"
        if matched_pattern is None:
            missing.append({"group": group_id, "patterns": group})
            reciprocal_ranks.append(0.0)
        else:
            hits.append({"group": group_id, "matched": matched_pattern, "rank": matched_rank})
            reciprocal_ranks.append(1 / max(int(matched_rank or 1), 1))
    return {
        "required_page_group_hits": hits,
        "missing_required_page_family_groups": missing,
        "page_group_mrr": _avg(reciprocal_ranks),
    }


def _score_required_section_groups(required_section_groups: list[Any], results: list[dict[str, Any]]) -> dict[str, Any]:
    hits = []
    missing = []
    total = 0
    for group_index, requirement in enumerate(required_section_groups, start=1):
        if not isinstance(requirement, dict):
            continue
        page_patterns = [str(pattern) for pattern in requirement.get("page_families") or []]
        sections = [str(section) for section in requirement.get("sections") or []]
        group_id = str(requirement.get("id") or f"group-{group_index}")
        for section in sections:
            total += 1
            matched = next(
                (
                    pattern
                    for pattern in page_patterns
                    if any(_matches_page(result, pattern) and _result_has_section(result, section) for result in results)
                ),
                None,
            )
            if matched is None:
                missing.append({"group": group_id, "page_families": page_patterns, "section": section})
            else:
                hits.append({"group": group_id, "page": matched, "section": section})
    return {
        "required_section_total": total,
        "required_section_hits": hits,
        "missing_required_sections": missing,
        "section_hit_rate": len(hits) / total if total else None,
    }


def _merge_section_metrics(*metrics: dict[str, Any]) -> dict[str, Any]:
    total = 0
    hits = []
    missing = []
    for metric in metrics:
        total += int(metric.get("required_section_total") or 0)
        hits.extend(metric.get("required_section_hits") or [])
        missing.extend(metric.get("missing_required_sections") or [])
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


def _evidence_hit_rate(expected_evidence_types: list[Any], context_text: str) -> float | None:
    expected = [str(item).lower() for item in expected_evidence_types if str(item).strip()]
    if not expected:
        return None
    norm = context_text.lower()
    hits = sum(1 for item in expected if all(token in norm for token in item.replace("/", " ").split()))
    return hits / len(expected)


def _query_intent_coverage(*, case: dict[str, Any], context_text: str, results: list[dict[str, Any]]) -> float:
    tokens = set()
    for source in (
        case.get("query"),
        case.get("problem_description"),
        " ".join(str(item) for item in case.get("context_packet_expectations") or []),
    ):
        tokens.update(_case_tokens(str(source or "")))
    if not tokens:
        return 0.0
    context_tokens = _case_tokens(context_text)
    result_reason_tokens = set()
    for result in results:
        result_reason_tokens.update(_case_tokens(" ".join(str(item) for item in result.get("selection_reasons") or [])))
        result_reason_tokens.update(_case_tokens(" ".join(str(item.get("heading") or "") for item in result.get("matched_sections") or [])))
    hits = tokens & (context_tokens | result_reason_tokens)
    return len(hits) / len(tokens)


def _redundancy_rate(results: list[dict[str, Any]]) -> float:
    if len(results) <= 1:
        return 0.0
    seen_signatures = set()
    redundant = 0
    for result in results:
        routing = result.get("routing") or {}
        signature = tuple(
            sorted(str(value).lower() for value in _list(routing.get("topics"))[:3])
        )
        if signature and signature in seen_signatures:
            redundant += 1
        elif signature:
            seen_signatures.add(signature)
    return redundant / len(results)


def _mean_reciprocal_rank(required_patterns: list[str], results: list[dict[str, Any]]) -> float | None:
    if not required_patterns:
        return None
    ranks = []
    for pattern in required_patterns:
        for index, result in enumerate(results, start=1):
            if _matches_page(result, pattern):
                ranks.append(1 / index)
                break
        else:
            ranks.append(0.0)
    return sum(ranks) / len(ranks)


def _source_quality_failure(*, case: dict[str, Any], results: list[dict[str, Any]]) -> bool:
    intent = str(case.get("intent") or "")
    if "source_quality" in intent:
        return False
    for result in results:
        quality_text = " ".join(
            str(result.get(field) or "")
            for field in ("review_state", "quality_gate", "confidence")
        ).lower()
        if any(token in quality_text for token in ("hold", "fail", "source_quality")):
            return True
    return False


def _compare_optimization_metrics(v0: dict[str, Any], v1: dict[str, Any]) -> dict[str, Any]:
    comparison = {}
    for key in (
        "required_recall_at_k",
        "mrr",
        "section_hit_rate",
        "evidence_hit_rate",
        "hard_distractor_rate",
        "source_quality_failure_rate",
        "context_compactness",
        "redundancy_rate",
        "family_coverage",
        "query_intent_coverage",
    ):
        baseline = v0.get(key)
        candidate = v1.get(key)
        comparison[key] = (
            candidate - baseline
            if isinstance(baseline, (int, float)) and isinstance(candidate, (int, float))
            else None
        )
    comparison["v0_decision"] = v0.get("deterministic_decision")
    comparison["v1_decision"] = v1.get("deterministic_decision")
    return comparison


def _aggregate_optimization_metrics(results: list[dict[str, Any]], *, label: str) -> dict[str, Any]:
    keys = (
        "required_recall_at_k",
        "mrr",
        "section_hit_rate",
        "evidence_hit_rate",
        "hard_distractor_rate",
        "source_quality_failure_rate",
        "context_compactness",
        "redundancy_rate",
        "family_coverage",
        "query_intent_coverage",
    )
    aggregate = {}
    for key in keys:
        values = []
        for result in results:
            metrics = ((result.get("contexts") or {}).get(label) or {}).get("metrics") or {}
            value = metrics.get(key)
            if isinstance(value, (int, float)):
                values.append(float(value))
        aggregate[key] = _avg(values)
    decisions: dict[str, int] = {}
    hard_fails: dict[str, int] = {}
    for result in results:
        metrics = ((result.get("contexts") or {}).get(label) or {}).get("metrics") or {}
        decision = str(metrics.get("deterministic_decision") or "unknown")
        decisions[decision] = decisions.get(decision, 0) + 1
        for failure in metrics.get("hard_fails") or []:
            hard_fails[str(failure)] = hard_fails.get(str(failure), 0) + 1
    aggregate["decisions"] = decisions
    aggregate["hard_fails"] = hard_fails
    return aggregate


def _render_optimization_summary_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Retrieval Optimization Summary",
        "",
        f"- Cases: {summary.get('total_cases')}",
        f"- Baseline: `{summary.get('baseline_strategy')}`",
        f"- Candidate: `{summary.get('candidate_strategy')}`",
        "",
        "## Aggregate Metrics",
        "",
        "| Metric | v0 | v1 | Delta |",
        "| --- | ---: | ---: | ---: |",
    ]
    for key, delta in (summary.get("deltas") or {}).items():
        v0 = (summary.get("metrics") or {}).get("v0", {}).get(key)
        v1 = (summary.get("metrics") or {}).get("v1", {}).get(key)
        lines.append(f"| {key} | {_fmt(v0)} | {_fmt(v1)} | {_fmt(delta)} |")
    lines.extend(["", "## Case Decisions", "", "| Case | v0 | v1 | Remaining v1 hard fails |", "| --- | --- | --- | --- |"])
    for case in summary.get("cases") or []:
        lines.append(
            f"| {case.get('id')} | {case.get('v0_decision')} | {case.get('v1_decision')} | {', '.join(case.get('v1_hard_fails') or []) or 'none'} |"
        )
    return "\n".join(lines).rstrip() + "\n"


def _case_tokens(text: str) -> set[str]:
    stop = {
        "the",
        "and",
        "for",
        "that",
        "this",
        "with",
        "from",
        "into",
        "want",
        "need",
        "paper",
        "papers",
        "retrieve",
        "context",
        "should",
    }
    return {token for token in text.lower().replace("-", " ").replace("/", " ").split() if token not in stop and len(token) > 2}


def _list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _fmt(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.3f}"
    if isinstance(value, int):
        return str(value)
    return "n/a"


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
