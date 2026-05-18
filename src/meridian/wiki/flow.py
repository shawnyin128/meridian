from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from meridian.wiki.converge import WikiConvergenceResult, converge_wiki_run, record_judge_result
from meridian.wiki.ingest import IngestResult, run_ingest
from meridian.wiki.judge import build_judge_packet


@dataclass(frozen=True)
class WikiFlowResult:
    flow_path: Path
    run_path: Path
    judge_packet_path: Path
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
) -> WikiFlowResult:
    ingest_result: IngestResult = run_ingest(
        pdf_path=pdf_path,
        out_dir=out_dir,
        title_override=title_override,
        overwrite=overwrite,
        wiki_root=wiki_root,
        publish_mode=publish_mode,
    )
    judge_packet_path = build_judge_packet(
        run_manifest=ingest_result.run_path,
        rubric_path=rubric_path,
        out_path=out_dir / "judge-packet.md",
        case_path=case_path,
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
        "convergence": str(convergence.convergence_path) if convergence else None,
        "next_action": _next_action(status),
    }
    flow_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return WikiFlowResult(
        flow_path=flow_path,
        run_path=ingest_result.run_path,
        judge_packet_path=judge_packet_path,
        convergence_path=convergence.convergence_path if convergence else None,
        status=status,
    )


def _next_action(status: str) -> str:
    if status == "awaiting_judge":
        return "Run an LLM-as-Judge on judge-packet.md, then record the result with meridian wiki judge-record."
    if status == "converged":
        return "No mandatory human review. Sample or inspect only if this paper is high impact."
    if status == "needs_refine":
        return "Refine the ingest output or skill, then rerun the flow."
    return "Inspect the flow and run manifest."
