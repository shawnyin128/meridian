from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from meridian.wiki.corpus import CatalogResult, RetrievalResult, build_knowledge_catalogs, build_paper_catalog, build_synthesis_catalog, retrieve_papers
from meridian.wiki.concepts import (
    ConceptAuditResult,
    ConceptLayerLintResult,
    ConceptLayerProposalResult,
    PublishConceptLayerResult,
    lint_concept_layer,
    propose_concept_layer,
    publish_concept_layer,
    run_concept_audit,
)
from meridian.wiki.eval import iter_cases, write_eval_manifest
from meridian.wiki.eval_run import (
    EvalConvergeResult,
    append_human_calibration,
    converge_eval_run,
    write_eval_summary,
)
from meridian.wiki.evolution import (
    PublishRefinementResult,
    RefinementDraftResult,
    RefinementLintResult,
    lint_refinement,
    propose_refinement,
    publish_refinement,
)
from meridian.wiki.flow import WikiFlowResult, run_wiki_flow
from meridian.wiki.final_product import (
    ContradictionReviewResult,
    FinalProductCheckResult,
    FinalStatusMigrationResult,
    MethodConsolidationResult,
    NavigationBuildResult,
    PublishMethodConsolidationResult,
    PublishSynthesisBatchResult,
    SynthesisBatchProposalResult,
    build_obsidian_navigation,
    final_product_check,
    migrate_final_statuses,
    propose_contradiction_review,
    propose_method_consolidation,
    propose_synthesis_batch,
    publish_method_consolidation,
    publish_synthesis_batch,
)
from meridian.wiki.ingest import IngestResult, run_ingest
from meridian.wiki.insights import (
    InsightLintResult,
    PublishInsightResult,
    UserInsightDraftResult,
    add_user_insight,
    lint_user_insight,
    publish_user_insight,
)
from meridian.wiki.judge import build_judge_packet
from meridian.wiki.knowledge import (
    KnowledgeAuditResult,
    KnowledgeRepairLintResult,
    KnowledgeRepairProposalResult,
    PublishKnowledgeRepairResult,
    lint_knowledge_repair,
    propose_knowledge_repair,
    publish_knowledge_repair,
    run_knowledge_audit,
)
from meridian.wiki.proposals import (
    ProposalLintResult,
    PublishProposalResult,
    QueryWritebackProposalResult,
    lint_query_writeback_proposal,
    propose_query_writeback,
    publish_query_writeback_proposal,
)
from meridian.wiki.promote import PublishRunResult, publish_run_to_wiki
from meridian.wiki.converge import WikiConvergenceResult, converge_wiki_run, record_judge_result
from meridian.wiki.quality_check import QualitySelfCheckResult, run_quality_self_check
from meridian.wiki.reader_check import build_reader_check_packet
from meridian.wiki.retrieval_eval import (
    RetrievalEvalResult,
    RetrievalEvalSummaryResult,
    RetrievalOptimizationEvalResult,
    run_retrieval_optimization_eval,
    run_retrieval_eval,
    summarize_retrieval_eval,
)
from meridian.wiki.retrieval_audit import RetrievalAuditResult, run_retrieval_audit
from meridian.wiki.review import append_review_record
from meridian.wiki.self_check import (
    SelfCheckAggregateResult,
    SelfCheckEvalResult,
    SelfCheckRunResult,
    aggregate_self_check,
    run_self_check,
    run_self_check_eval,
)
from meridian.wiki.structural_check import StructuralSelfCheckResult, run_structural_self_check
from meridian.wiki.system_eval import (
    SystemEvaluationResult,
    SystemOptimizationEvalResult,
    compare_system_optimization_runs,
    run_system_evaluation,
    run_system_optimization_eval,
)
from meridian.wiki.vault import (
    SourceAuditResult,
    WikiInitResult,
    WikiLintResult,
    audit_sources,
    init_wiki_vault,
    lint_wiki,
    rebuild_wiki_index,
    slugify,
)
from meridian.wiki.workspace import WorkspaceInitResult, init_workspace


@dataclass(frozen=True)
class CommandIngestResult:
    review_path: Path
    paper_path: Path
    claims_path: Path
    methods_path: Path
    evidence_path: Path
    run_path: Path
    canonical_paper_path: Path | None
    index_path: Path | None
    log_path: Path | None


@dataclass(frozen=True)
class BatchIngestResult:
    source_folder: Path
    batch_dir: Path
    batch_manifest: Path
    pdf_count: int
    success_count: int
    failure_count: int


def ingest_pdf(
    pdf_path: Path,
    out_dir: Path,
    title_override: str | None = None,
    overwrite: bool = False,
    wiki_root: Path | None = None,
    source_root: Path | None = None,
    publish_mode: str = "never",
    render_page_images: bool = True,
) -> CommandIngestResult:
    result = run_ingest(
        pdf_path=pdf_path,
        out_dir=out_dir,
        title_override=title_override,
        overwrite=overwrite,
        wiki_root=wiki_root,
        source_root=source_root,
        publish_mode=publish_mode,
        render_page_images=render_page_images,
    )
    return CommandIngestResult(
        review_path=result.review_path,
        paper_path=result.paper_path,
        claims_path=result.claims_path,
        methods_path=result.methods_path,
        evidence_path=result.evidence_path,
        run_path=result.run_path,
        canonical_paper_path=result.publish_result.paper_path if result.publish_result else None,
        index_path=result.publish_result.index_path if result.publish_result else None,
        log_path=result.publish_result.log_path if result.publish_result else None,
    )


def ingest_pdf_folder(
    *,
    source_folder: Path,
    batch_dir: Path,
    wiki_root: Path,
    source_root: Path | None = None,
    publish_mode: str = "auto",
    overwrite: bool = False,
    render_page_images: bool = False,
    limit: int | None = None,
    stop_on_error: bool = False,
) -> BatchIngestResult:
    source_folder = source_folder.expanduser().resolve()
    if not source_folder.is_dir():
        raise ValueError(f"source folder does not exist or is not a directory: {source_folder}")
    if limit is not None and limit < 1:
        raise ValueError("--limit must be greater than zero")
    if batch_dir.exists() and (batch_dir / "batch.json").exists() and not overwrite:
        raise ValueError(f"batch output already exists: {batch_dir}")

    pdf_paths = sorted(
        path for path in source_folder.rglob("*") if path.is_file() and path.suffix.lower() == ".pdf"
    )
    if limit is not None:
        pdf_paths = pdf_paths[:limit]
    if not pdf_paths:
        raise ValueError(f"no PDF files found under: {source_folder}")

    batch_dir.mkdir(parents=True, exist_ok=True)
    runs_dir = batch_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)

    used_slugs: set[str] = set()
    results: list[dict[str, object]] = []
    failures = 0
    for pdf_path in pdf_paths:
        run_slug = _unique_batch_slug(slugify(pdf_path.stem), used_slugs)
        run_dir = runs_dir / run_slug
        record: dict[str, object] = {
            "input_pdf": str(pdf_path),
            "run_dir": str(run_dir),
            "status": "pending",
        }
        try:
            ingest_result = run_ingest(
                pdf_path=pdf_path,
                out_dir=run_dir,
                overwrite=overwrite,
                wiki_root=wiki_root,
                source_root=source_root,
                publish_mode=publish_mode,
                render_page_images=render_page_images,
            )
            run_payload = json.loads(ingest_result.run_path.read_text(encoding="utf-8"))
            source_artifacts = dict(run_payload.get("source_artifacts") or {})
            product_artifacts = dict(run_payload.get("product_artifacts") or {})
            record.update(
                {
                    "status": "generated",
                    "run_manifest": str(ingest_result.run_path),
                    "managed_source_pdf": source_artifacts.get("managed_pdf"),
                    "canonical_paper_page": product_artifacts.get("canonical_paper_page"),
                    "quality_gate": dict(run_payload.get("quality_gate") or {}).get("decision"),
                    "review_state": dict(run_payload.get("deterministic_convergence") or {}).get("review_state"),
                    "artifact_role": "internal_ingest_run",
                }
            )
        except Exception as exc:  # noqa: BLE001 - keep batch ingestion moving by default.
            failures += 1
            record.update({"status": "error", "error": str(exc)})
            if stop_on_error:
                results.append(record)
                break
        results.append(record)

    created_at = datetime.now(timezone.utc).isoformat()
    success_count = sum(1 for item in results if item.get("status") == "generated")
    manifest = {
        "schema_version": "paper_wiki_folder_ingest.v0",
        "workflow": "Update Wiki",
        "source_kind": "zotero_export_or_pdf_folder",
        "source_folder": str(source_folder),
        "wiki_root": str(wiki_root),
        "source_root": str(source_root) if source_root else None,
        "batch_dir": str(batch_dir),
        "created_at": created_at,
        "pdf_count": len(pdf_paths),
        "success_count": success_count,
        "failure_count": failures,
        "publish_mode": publish_mode,
        "render_page_images": render_page_images,
        "results": results,
        "artifact_roles": {
            "batch_manifest": "internal_batch_summary",
            "per_pdf_run_dirs": "internal_ingest_runs",
            "managed_source_pdf": "source_artifact",
            "canonical_paper_page": "user_facing_wiki_artifact",
        },
        "product_summary": {
            "managed_sources_updated": success_count > 0,
            "canonical_wiki_pages_attempted": publish_mode != "never",
            "canonical_wiki_pages_published": sum(1 for item in results if item.get("canonical_paper_page")),
        },
    }
    batch_manifest = batch_dir / "batch.json"
    batch_manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    _write_batch_markdown_summary(batch_dir / "batch.md", manifest)

    return BatchIngestResult(
        source_folder=source_folder,
        batch_dir=batch_dir,
        batch_manifest=batch_manifest,
        pdf_count=len(pdf_paths),
        success_count=success_count,
        failure_count=failures,
    )


def _unique_batch_slug(base_slug: str, used_slugs: set[str]) -> str:
    slug = base_slug or "paper"
    if slug not in used_slugs:
        used_slugs.add(slug)
        return slug
    index = 2
    while f"{slug}-{index}" in used_slugs:
        index += 1
    unique = f"{slug}-{index}"
    used_slugs.add(unique)
    return unique


def _write_batch_markdown_summary(path: Path, manifest: dict[str, object]) -> None:
    lines = [
        "# Folder Ingest Batch",
        "",
        f"- Source folder: `{manifest['source_folder']}`",
        f"- PDF count: {manifest['pdf_count']}",
        f"- Success: {manifest['success_count']}",
        f"- Failures: {manifest['failure_count']}",
        f"- Publish mode: `{manifest['publish_mode']}`",
        "",
        "## Results",
        "",
    ]
    for item in manifest.get("results", []):
        if not isinstance(item, dict):
            continue
        status = item.get("status")
        lines.append(f"- `{status}` `{item.get('input_pdf')}`")
        if item.get("managed_source_pdf"):
            lines.append(f"  - Managed source: `{item['managed_source_pdf']}`")
        if item.get("canonical_paper_page"):
            lines.append(f"  - Canonical page: `{item['canonical_paper_page']}`")
        if item.get("error"):
            lines.append(f"  - Error: {item['error']}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def eval_cases(
    cases_path: Path,
    out_dir: Path,
    overwrite: bool = False,
    publish_mode: str = "never",
    mode: str = "ingest",
    rubric_path: Path | None = None,
    wiki_root: Path | None = None,
    render_page_images: bool = True,
) -> Path:
    if mode not in {"ingest", "flow"}:
        raise ValueError("eval mode must be ingest or flow")
    if mode == "flow" and rubric_path is None:
        raise ValueError("--rubric is required when --mode flow")

    out_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    effective_wiki_root = wiki_root or out_dir / "wiki"

    for case in iter_cases(cases_path):
        case_id = case["id"]
        case_out = out_dir / str(case_id)
        try:
            case_json_path = _write_case_snapshot(out_dir, str(case_id), case)
            if mode == "flow":
                assert rubric_path is not None
                flow_result: WikiFlowResult = run_wiki_flow(
                    pdf_path=Path(case["paper_path"]),
                    out_dir=case_out,
                    wiki_root=effective_wiki_root,
                    rubric_path=rubric_path,
                    title_override=case.get("title"),
                    overwrite=overwrite,
                    publish_mode="auto" if publish_mode == "never" else publish_mode,
                    case_path=case_json_path,
                    render_page_images=render_page_images,
                )
                run_payload = json.loads(flow_result.run_path.read_text(encoding="utf-8"))
                result_record = {
                    "id": case_id,
                    "status": flow_result.status,
                    "mode": "flow",
                    "quality_gate": run_payload.get("quality_gate"),
                    "paper_model": run_payload.get("paper_model"),
                    "flow_manifest": str(flow_result.flow_path),
                    "run_manifest": str(flow_result.run_path),
                    "judge_packet": str(flow_result.judge_packet_path),
                    "reader_check_packet": str(flow_result.reader_check_packet_path),
                    "quality_self_check": str(flow_result.quality_self_check_path),
                    "structural_self_check": str(flow_result.structural_self_check_path),
                    "case_snapshot": str(case_json_path),
                }
                canonical = dict(run_payload.get("canonical_artifacts") or {})
                if canonical:
                    result_record["canonical_artifacts"] = canonical
                results.append(result_record)
            else:
                ingest_result: IngestResult = run_ingest(
                    pdf_path=Path(case["paper_path"]),
                    out_dir=case_out,
                    title_override=case.get("title"),
                    overwrite=overwrite,
                    case_metadata=case,
                    wiki_root=case_out / "wiki",
                    publish_mode=publish_mode,
                    render_page_images=render_page_images,
                )
                result_record = {
                    "id": case_id,
                    "status": "generated",
                    "mode": "ingest",
                    "quality_gate": ingest_result.quality_gate.to_json(),
                    "review_packet": str(ingest_result.review_path),
                    "paper_page": str(ingest_result.paper_path),
                    "claims": str(ingest_result.claims_path),
                    "methods": str(ingest_result.methods_path),
                    "evidence": str(ingest_result.evidence_path),
                    "run_manifest": str(ingest_result.run_path),
                    "case_snapshot": str(case_json_path),
                }
                if ingest_result.publish_result is not None:
                    result_record["canonical_paper_page"] = str(ingest_result.publish_result.paper_path)
                    result_record["canonical_index"] = str(ingest_result.publish_result.index_path)
                    result_record["canonical_log"] = str(ingest_result.publish_result.log_path)
                results.append(result_record)
        except Exception as exc:  # noqa: BLE001 - preserve case-level failure.
            results.append({"id": case_id, "status": "error", "error": str(exc)})

    return write_eval_manifest(
        cases_path=cases_path,
        out_dir=out_dir,
        results=results,
        mode=mode,
        rubric_path=rubric_path,
        wiki_root=effective_wiki_root if mode == "flow" else None,
    )


def _write_case_snapshot(out_dir: Path, case_id: str, case: dict[str, object]) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    case_json_path = out_dir / f"{case_id}.case.json"
    case_json_path.write_text(json.dumps(case, indent=2) + "\n", encoding="utf-8")
    return case_json_path


def record_review(review_packet: Path, decision: str, bucket: str, notes: str) -> Path:
    return append_review_record(
        review_packet=review_packet,
        record={
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "decision": decision,
            "bucket": bucket,
            "notes": notes,
        },
    )


def create_judge_packet(
    run_manifest: Path,
    rubric_path: Path,
    out_path: Path,
    case_path: Path | None = None,
) -> Path:
    return build_judge_packet(
        run_manifest=run_manifest,
        rubric_path=rubric_path,
        out_path=out_path,
        case_path=case_path,
    )


def create_reader_check_packet(run_manifest: Path, out_path: Path) -> Path:
    return build_reader_check_packet(run_manifest=run_manifest, out_path=out_path)


def quality_check_run(run_manifest: Path, out_path: Path | None = None) -> QualitySelfCheckResult:
    return run_quality_self_check(run_manifest=run_manifest, out_path=out_path)


def structural_check_run(run_manifest: Path, out_path: Path | None = None) -> StructuralSelfCheckResult:
    return run_structural_self_check(run_manifest=run_manifest, out_path=out_path)


def self_check_run(
    run_manifest: Path,
    out_dir: Path | None = None,
    backend: str = "agent-executed",
    overwrite: bool = False,
) -> SelfCheckRunResult:
    return run_self_check(
        run_manifest=run_manifest,
        out_dir=out_dir,
        backend=backend,
        overwrite=overwrite,
    )


def self_check_aggregate(manifest_path: Path, out_path: Path | None = None) -> SelfCheckAggregateResult:
    return aggregate_self_check(manifest_path=manifest_path, out_path=out_path)


def self_check_eval(
    eval_manifest: Path,
    out_dir: Path | None = None,
    backend: str = "agent-executed",
    overwrite: bool = False,
) -> SelfCheckEvalResult:
    return run_self_check_eval(
        eval_manifest=eval_manifest,
        out_dir=out_dir,
        backend=backend,
        overwrite=overwrite,
    )


def run_flow(
    *,
    pdf_path: Path,
    out_dir: Path,
    wiki_root: Path,
    rubric_path: Path,
    title_override: str | None = None,
    overwrite: bool = False,
    publish_mode: str = "auto",
    case_path: Path | None = None,
    judge_result_path: Path | None = None,
    render_page_images: bool = True,
    source_root: Path | None = None,
) -> WikiFlowResult:
    return run_wiki_flow(
        pdf_path=pdf_path,
        out_dir=out_dir,
        wiki_root=wiki_root,
        rubric_path=rubric_path,
        title_override=title_override,
        overwrite=overwrite,
        publish_mode=publish_mode,
        case_path=case_path,
        judge_result_path=judge_result_path,
        render_page_images=render_page_images,
        source_root=source_root,
    )


def record_judge(run_manifest: Path, judge_result_path: Path, out_path: Path | None = None) -> Path:
    return record_judge_result(
        run_manifest=run_manifest,
        judge_result_path=judge_result_path,
        out_path=out_path,
    ).judge_result_path


def converge_run(run_manifest: Path, out_path: Path | None = None) -> WikiConvergenceResult:
    return converge_wiki_run(run_manifest=run_manifest, out_path=out_path)


def converge_eval(manifest_path: Path, judge_dir: Path | None = None) -> EvalConvergeResult:
    return converge_eval_run(manifest_path=manifest_path, judge_dir=judge_dir)


def calibrate_eval(
    *,
    manifest_path: Path,
    case_id: str,
    human_decision: str,
    bucket: str,
    notes: str = "",
    should_require_human_review_next_time: bool | None = None,
) -> Path:
    return append_human_calibration(
        manifest_path=manifest_path,
        case_id=case_id,
        human_decision=human_decision,
        bucket=bucket,
        notes=notes,
        should_require_human_review_next_time=should_require_human_review_next_time,
    )


def summarize_eval(manifest_path: Path, out_path: Path | None = None) -> Path:
    return write_eval_summary(manifest_path=manifest_path, out_path=out_path)


def catalog_wiki(wiki_root: Path, out_path: Path | None = None) -> CatalogResult:
    result = build_paper_catalog(wiki_root=wiki_root, out_path=out_path)
    if (wiki_root / "syntheses").exists():
        build_synthesis_catalog(wiki_root=wiki_root)
    build_knowledge_catalogs(wiki_root=wiki_root)
    return result


def retrieve_wiki(
    *,
    query: str,
    wiki_root: Path,
    catalog_path: Path | None = None,
    top_k: int = 5,
    strategy: str = "v1",
    packet_path: Path | None = None,
    result_path: Path | None = None,
) -> RetrievalResult:
    return retrieve_papers(
        query=query,
        wiki_root=wiki_root,
        catalog_path=catalog_path,
        top_k=top_k,
        strategy=strategy,
        packet_path=packet_path,
        result_path=result_path,
    )


def knowledge_audit_wiki(wiki_root: Path, out_path: Path | None = None, brief_path: Path | None = None) -> KnowledgeAuditResult:
    return run_knowledge_audit(wiki_root=wiki_root, out_path=out_path, brief_path=brief_path)


def concept_audit_wiki(wiki_root: Path, out_path: Path | None = None, brief_path: Path | None = None) -> ConceptAuditResult:
    return run_concept_audit(wiki_root=wiki_root, out_path=out_path, brief_path=brief_path)


def propose_concept_layer_wiki(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    overwrite: bool = False,
    max_concepts: int = 24,
) -> ConceptLayerProposalResult:
    return propose_concept_layer(wiki_root=wiki_root, out_dir=out_dir, overwrite=overwrite, max_concepts=max_concepts)


def concept_layer_lint_wiki(
    *,
    proposal_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
) -> ConceptLayerLintResult:
    return lint_concept_layer(proposal_manifest=proposal_manifest, wiki_root=wiki_root, out_path=out_path)


def publish_concept_layer_wiki(
    *,
    proposal_manifest: Path,
    wiki_root: Path,
) -> PublishConceptLayerResult:
    return publish_concept_layer(proposal_manifest=proposal_manifest, wiki_root=wiki_root)


def propose_knowledge_repair_wiki(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    audit_path: Path | None = None,
    overwrite: bool = False,
) -> KnowledgeRepairProposalResult:
    return propose_knowledge_repair(wiki_root=wiki_root, out_dir=out_dir, audit_path=audit_path, overwrite=overwrite)


def knowledge_repair_lint_wiki(
    *,
    repair_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
) -> KnowledgeRepairLintResult:
    return lint_knowledge_repair(repair_manifest=repair_manifest, wiki_root=wiki_root, out_path=out_path)


def publish_knowledge_repair_wiki(
    *,
    repair_manifest: Path,
    wiki_root: Path,
) -> PublishKnowledgeRepairResult:
    return publish_knowledge_repair(repair_manifest=repair_manifest, wiki_root=wiki_root)


def final_status_migrate_wiki(
    *,
    wiki_root: Path,
    out_path: Path | None = None,
) -> FinalStatusMigrationResult:
    return migrate_final_statuses(wiki_root=wiki_root, out_path=out_path)


def propose_synthesis_batch_wiki(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    max_items: int = 6,
    overwrite: bool = False,
) -> SynthesisBatchProposalResult:
    return propose_synthesis_batch(wiki_root=wiki_root, out_dir=out_dir, max_items=max_items, overwrite=overwrite)


def publish_synthesis_batch_wiki(
    *,
    batch_manifest: Path,
    wiki_root: Path,
    limit: int | None = None,
    overwrite: bool = False,
) -> PublishSynthesisBatchResult:
    return publish_synthesis_batch(batch_manifest=batch_manifest, wiki_root=wiki_root, limit=limit, overwrite=overwrite)


def propose_method_consolidation_wiki(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    overwrite: bool = False,
) -> MethodConsolidationResult:
    return propose_method_consolidation(wiki_root=wiki_root, out_dir=out_dir, overwrite=overwrite)


def publish_method_consolidation_wiki(
    *,
    consolidation_manifest: Path,
    wiki_root: Path,
) -> PublishMethodConsolidationResult:
    return publish_method_consolidation(consolidation_manifest=consolidation_manifest, wiki_root=wiki_root)


def propose_contradiction_review_wiki(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    overwrite: bool = False,
) -> ContradictionReviewResult:
    return propose_contradiction_review(wiki_root=wiki_root, out_dir=out_dir, overwrite=overwrite)


def build_navigation_wiki(
    *,
    wiki_root: Path,
    out_path: Path | None = None,
) -> NavigationBuildResult:
    return build_obsidian_navigation(wiki_root=wiki_root, out_path=out_path)


def final_product_check_wiki(
    *,
    wiki_root: Path,
    out_path: Path | None = None,
    brief_path: Path | None = None,
) -> FinalProductCheckResult:
    return final_product_check(wiki_root=wiki_root, out_path=out_path, brief_path=brief_path)


def add_insight_wiki(
    *,
    wiki_root: Path,
    paper: str,
    note: str = "",
    note_file: Path | None = None,
    insight_type: str = "paper-note",
    out_dir: Path | None = None,
    overwrite: bool = False,
) -> UserInsightDraftResult:
    return add_user_insight(
        wiki_root=wiki_root,
        paper=paper,
        note=note,
        note_file=note_file,
        insight_type=insight_type,
        out_dir=out_dir,
        overwrite=overwrite,
    )


def insight_lint_wiki(
    *,
    insight_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
) -> InsightLintResult:
    return lint_user_insight(insight_manifest=insight_manifest, wiki_root=wiki_root, out_path=out_path)


def publish_insight_wiki(
    *,
    insight_manifest: Path,
    wiki_root: Path,
) -> PublishInsightResult:
    return publish_user_insight(insight_manifest=insight_manifest, wiki_root=wiki_root)


def propose_refine_wiki(
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
    return propose_refinement(
        wiki_root=wiki_root,
        target=target,
        reason=reason,
        note=note,
        note_file=note_file,
        change_class=change_class,
        from_insight=from_insight,
        out_dir=out_dir,
        overwrite=overwrite,
    )


def refinement_lint_wiki(
    *,
    refinement_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
) -> RefinementLintResult:
    return lint_refinement(refinement_manifest=refinement_manifest, wiki_root=wiki_root, out_path=out_path)


def publish_refinement_wiki(
    *,
    refinement_manifest: Path,
    wiki_root: Path,
) -> PublishRefinementResult:
    return publish_refinement(refinement_manifest=refinement_manifest, wiki_root=wiki_root)


def retrieval_eval_wiki(
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
    return run_retrieval_eval(
        cases_path=cases_path,
        wiki_root=wiki_root,
        out_dir=out_dir,
        rubric_path=rubric_path,
        top_k=top_k,
        catalog_path=catalog_path,
        strategy=strategy,
        overwrite=overwrite,
    )


def retrieval_eval_summary(manifest_path: Path, out_path: Path | None = None) -> RetrievalEvalSummaryResult:
    return summarize_retrieval_eval(manifest_path=manifest_path, out_path=out_path)


def retrieval_optimization_eval_wiki(
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
    return run_retrieval_optimization_eval(
        cases_path=cases_path,
        wiki_root=wiki_root,
        out_dir=out_dir,
        rubric_path=rubric_path,
        top_k=top_k,
        catalog_path=catalog_path,
        baseline_strategy=baseline_strategy,
        candidate_strategy=candidate_strategy,
        overwrite=overwrite,
    )


def system_evaluate_wiki(
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
    return run_system_evaluation(
        wiki_root=wiki_root,
        case_path=case_path,
        context_path=context_path,
        out_dir=out_dir,
        rubric_path=rubric_path,
        selected_pages=selected_pages,
        proposal_path=proposal_path,
        audit_paths=audit_paths,
        overwrite=overwrite,
    )


def system_optimize_eval_wiki(
    *,
    wiki_root: Path,
    cases_path: Path,
    out_dir: Path,
    rubric_path: Path | None = None,
    top_k: int = 8,
    strategy: str = "v1",
    baseline_run: Path | None = None,
    selected_pages_per_case: int = 3,
    overwrite: bool = False,
) -> SystemOptimizationEvalResult:
    return run_system_optimization_eval(
        wiki_root=wiki_root,
        cases_path=cases_path,
        out_dir=out_dir,
        rubric_path=rubric_path,
        top_k=top_k,
        strategy=strategy,
        baseline_run=baseline_run,
        selected_pages_per_case=selected_pages_per_case,
        overwrite=overwrite,
    )


def system_optimize_compare_wiki(*, baseline_run: Path, candidate_run: Path, out_dir: Path) -> tuple[Path, Path]:
    return compare_system_optimization_runs(
        baseline_run=baseline_run,
        candidate_run=candidate_run,
        out_dir=out_dir,
    )


def retrieval_audit_wiki(
    *,
    wiki_root: Path,
    out_dir: Path,
    catalog_path: Path | None = None,
    top_k: int = 5,
    queries_per_paper: int = 3,
    max_papers: int | None = None,
    overwrite: bool = False,
) -> RetrievalAuditResult:
    return run_retrieval_audit(
        wiki_root=wiki_root,
        out_dir=out_dir,
        catalog_path=catalog_path,
        top_k=top_k,
        queries_per_paper=queries_per_paper,
        max_papers=max_papers,
        overwrite=overwrite,
    )


def propose_writeback_wiki(
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
    return propose_query_writeback(
        wiki_root=wiki_root,
        query=query,
        context_path=context_path,
        title=title,
        proposal_type=proposal_type,
        body_path=body_path,
        out_dir=out_dir,
        notes=notes,
        user_note=user_note,
        user_note_path=user_note_path,
        overwrite=overwrite,
        update_log=update_log,
    )


def proposal_lint_wiki(
    *,
    proposal_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
    overwrite: bool = False,
) -> ProposalLintResult:
    return lint_query_writeback_proposal(
        proposal_manifest=proposal_manifest,
        wiki_root=wiki_root,
        out_path=out_path,
        overwrite=overwrite,
    )


def publish_proposal_wiki(
    *,
    proposal_manifest: Path,
    wiki_root: Path,
    overwrite: bool = False,
) -> PublishProposalResult:
    return publish_query_writeback_proposal(
        proposal_manifest=proposal_manifest,
        wiki_root=wiki_root,
        overwrite=overwrite,
    )


def init_wiki(wiki_root: Path, overwrite_templates: bool = False) -> WikiInitResult:
    return init_wiki_vault(wiki_root=wiki_root, overwrite_templates=overwrite_templates)


def init_wiki_workspace(
    *,
    library_root: Path,
    wiki_root: Path | None = None,
    source_root: Path | None = None,
    set_default: bool = True,
    overwrite: bool = False,
    overwrite_templates: bool = False,
) -> WorkspaceInitResult:
    return init_workspace(
        library_root=library_root,
        wiki_root=wiki_root,
        source_root=source_root,
        set_default=set_default,
        overwrite=overwrite,
        overwrite_templates=overwrite_templates,
    )


def source_audit_wiki(wiki_root: Path, out_path: Path | None = None, source_root: Path | None = None) -> SourceAuditResult:
    return audit_sources(wiki_root=wiki_root, out_path=out_path, source_root=source_root)


def rebuild_index_wiki(wiki_root: Path) -> Path:
    return rebuild_wiki_index(wiki_root=wiki_root)


def lint_wiki_command(wiki_root: Path, out_path: Path | None = None, source_root: Path | None = None) -> WikiLintResult:
    return lint_wiki(wiki_root=wiki_root, out_path=out_path, source_root=source_root)


def publish_run(
    *,
    run_manifest: Path,
    wiki_root: Path,
    promote_candidates: bool = True,
    overwrite: bool = False,
) -> PublishRunResult:
    return publish_run_to_wiki(
        run_manifest=run_manifest,
        wiki_root=wiki_root,
        promote_candidates=promote_candidates,
        overwrite=overwrite,
    )
