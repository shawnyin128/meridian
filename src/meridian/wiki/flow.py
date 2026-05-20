from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from meridian.wiki.converge import WikiConvergenceResult, converge_wiki_run, record_judge_result
from meridian.wiki.ingest import IngestResult, run_ingest
from meridian.wiki.judge import build_judge_packet
from meridian.wiki.quality_check import QualitySelfCheckResult, run_quality_self_check
from meridian.wiki.reader_check import build_reader_check_packet
from meridian.wiki.structural_check import StructuralSelfCheckResult, run_structural_self_check


@dataclass(frozen=True)
class WikiFlowResult:
    flow_path: Path
    run_path: Path
    judge_packet_path: Path
    reader_check_packet_path: Path
    quality_self_check_path: Path
    structural_self_check_path: Path
    convergence_path: Path | None
    status: str


def run_wiki_flow(
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
) -> WikiFlowResult:
    ingest_result: IngestResult = run_ingest(
        pdf_path=pdf_path,
        out_dir=out_dir,
        title_override=title_override,
        overwrite=overwrite,
        wiki_root=wiki_root,
        publish_mode=publish_mode,
        render_page_images=render_page_images,
    )
    judge_packet_path = build_judge_packet(
        run_manifest=ingest_result.run_path,
        rubric_path=rubric_path,
        out_path=out_dir / "judge-packet.md",
        case_path=case_path,
    )
    reader_check_packet_path = build_reader_check_packet(
        run_manifest=ingest_result.run_path,
        out_path=out_dir / "reader-check.md",
    )
    quality_self_check: QualitySelfCheckResult = run_quality_self_check(
        run_manifest=ingest_result.run_path,
        out_path=out_dir / "quality-self-check.json",
    )
    structural_self_check: StructuralSelfCheckResult = run_structural_self_check(
        run_manifest=ingest_result.run_path,
        out_path=out_dir / "structural-self-check.json",
    )

    convergence: WikiConvergenceResult | None = None
    status = "awaiting_judge"
    if judge_result_path is not None:
        record_judge_result(
            run_manifest=ingest_result.run_path,
            judge_result_path=judge_result_path,
        )
        convergence = converge_wiki_run(run_manifest=ingest_result.run_path)
        status = convergence.status

    flow_path = out_dir / "flow.json"
    payload = {
        "schema_version": "paper_wiki_flow.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "source_pdf": str(pdf_path),
        "wiki_root": str(wiki_root),
        "rubric": str(rubric_path),
        "run_manifest": str(ingest_result.run_path),
        "judge_packet": str(judge_packet_path),
        "reader_check_packet": str(reader_check_packet_path),
        "quality_self_check": str(quality_self_check.path),
        "quality_self_check_decision": quality_self_check.decision,
        "quality_self_check_score": round(quality_self_check.weighted_score, 3),
        "structural_self_check": str(structural_self_check.path),
        "structural_self_check_decision": structural_self_check.decision,
        "structural_self_check_score": round(structural_self_check.weighted_score, 3),
        "managed_self_check_agents": {
            "understanding": str(reader_check_packet_path),
            "quality": str(quality_self_check.path),
            "structural": str(structural_self_check.path),
        },
        "convergence": str(convergence.convergence_path) if convergence else None,
        "next_action": _next_action(status),
    }
    flow_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return WikiFlowResult(
        flow_path=flow_path,
        run_path=ingest_result.run_path,
        judge_packet_path=judge_packet_path,
        reader_check_packet_path=reader_check_packet_path,
        quality_self_check_path=quality_self_check.path,
        structural_self_check_path=structural_self_check.path,
        convergence_path=convergence.convergence_path if convergence else None,
        status=status,
    )


def _next_action(status: str) -> str:
    if status == "awaiting_judge":
        return (
            "Run a reader self-check on reader-check.md, run an LLM-as-Judge on judge-packet.md, "
            "then record the judge result with meridian wiki judge-record."
        )
    if status == "converged":
        return "No mandatory human review. Sample or inspect only if this paper is high impact."
    if status == "needs_refine":
        return "Refine the ingest output or skill, then rerun the flow."
    return "Inspect the flow and run manifest."
