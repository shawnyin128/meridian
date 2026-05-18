from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from meridian.wiki.eval import iter_cases, write_eval_manifest
from meridian.wiki.eval_run import (
    EvalConvergeResult,
    append_human_calibration,
    converge_eval_run,
    write_eval_summary,
)
from meridian.wiki.flow import WikiFlowResult, run_wiki_flow
from meridian.wiki.ingest import IngestResult, run_ingest
from meridian.wiki.judge import build_judge_packet
from meridian.wiki.converge import WikiConvergenceResult, converge_wiki_run, record_judge_result
from meridian.wiki.review import append_review_record


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


def ingest_pdf(
    pdf_path: Path,
    out_dir: Path,
    title_override: str | None = None,
    overwrite: bool = False,
    wiki_root: Path | None = None,
    publish_mode: str = "never",
) -> CommandIngestResult:
    result = run_ingest(
        pdf_path=pdf_path,
        out_dir=out_dir,
        title_override=title_override,
        overwrite=overwrite,
        wiki_root=wiki_root,
        publish_mode=publish_mode,
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


def eval_cases(
    cases_path: Path,
    out_dir: Path,
    overwrite: bool = False,
    publish_mode: str = "never",
    mode: str = "ingest",
    rubric_path: Path | None = None,
    wiki_root: Path | None = None,
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
                    wiki_root=case_out / "wiki" if publish_mode != "never" else None,
                    publish_mode=publish_mode,
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
