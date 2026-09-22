from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.converge import converge_wiki_run, record_judge_result


CALIBRATION_DECISIONS = {"agree", "too_harsh", "too_lenient", "missed_key_issue"}
REFINE_BUCKETS = {
    "workflow",
    "schema",
    "extraction",
    "multimodal_understanding",
    "paper_model",
    "retrieval",
    "judge_rubric",
    "human_gate",
    "other",
}


@dataclass(frozen=True)
class EvalConvergeResult:
    manifest_path: Path
    summary_path: Path
    recorded_count: int
    missing_count: int


def converge_eval_run(
    *,
    manifest_path: Path,
    judge_dir: Path | None = None,
) -> EvalConvergeResult:
    manifest = _read_json(manifest_path)
    results = _result_rows(manifest)
    recorded_count = 0
    missing_count = 0

    for result in results:
        if result.get("status") == "error":
            continue
        case_id = str(result.get("id", ""))
        run_manifest_value = result.get("run_manifest")
        if not case_id or not run_manifest_value:
            result["evaluation_status"] = "missing_run_manifest"
            continue

        run_manifest = Path(str(run_manifest_value))
        judge_result = _find_judge_result(
            case_id=case_id,
            run_manifest=run_manifest,
            manifest_dir=manifest_path.parent,
            judge_dir=judge_dir,
        )
        if judge_result is None:
            result["evaluation_status"] = "awaiting_judge"
            missing_count += 1
            continue

        judge_record = record_judge_result(
            run_manifest=run_manifest,
            judge_result_path=judge_result,
        )
        convergence = converge_wiki_run(run_manifest=run_manifest)
        run_payload = _read_json(run_manifest)
        result["evaluation_status"] = "converged"
        result["judge_result"] = str(judge_record.judge_result_path)
        result["judge_decision"] = run_payload.get("judge_result", {}).get("decision")
        result["convergence"] = str(convergence.convergence_path)
        result["convergence_status"] = convergence.status
        recorded_count += 1

    manifest["results"] = results
    manifest["updated_at"] = _now()
    _write_json(manifest_path, manifest)
    summary_path = write_eval_summary(manifest_path=manifest_path)
    return EvalConvergeResult(
        manifest_path=manifest_path,
        summary_path=summary_path,
        recorded_count=recorded_count,
        missing_count=missing_count,
    )


def append_human_calibration(
    *,
    manifest_path: Path,
    case_id: str,
    human_decision: str,
    bucket: str,
    notes: str = "",
    should_require_human_review_next_time: bool | None = None,
) -> Path:
    if human_decision not in CALIBRATION_DECISIONS:
        raise ValueError(f"human decision must be one of: {', '.join(sorted(CALIBRATION_DECISIONS))}")
    if bucket not in REFINE_BUCKETS:
        raise ValueError(f"bucket must be one of: {', '.join(sorted(REFINE_BUCKETS))}")

    manifest = _read_json(manifest_path)
    result = _find_result(manifest, case_id)
    judge_result_path = result.get("judge_result")
    if judge_result_path is None:
        judge_result_path = _default_case_dir(manifest_path, case_id) / "judge-result.json"

    record: dict[str, Any] = {
        "schema_version": "paper_wiki_human_calibration.v0",
        "recorded_at": _now(),
        "case_id": case_id,
        "judge_result_path": str(judge_result_path),
        "human_decision": human_decision,
        "required_refine_bucket": bucket,
        "human_notes": notes,
    }
    if should_require_human_review_next_time is not None:
        record["should_require_human_review_next_time"] = should_require_human_review_next_time

    calibration_path = manifest_path.parent / "human_calibration.jsonl"
    with calibration_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    manifest["human_calibration"] = str(calibration_path)
    manifest["updated_at"] = _now()
    _write_json(manifest_path, manifest)
    write_eval_summary(manifest_path=manifest_path)
    return calibration_path


def write_eval_summary(*, manifest_path: Path, out_path: Path | None = None) -> Path:
    manifest = _read_json(manifest_path)
    results = _result_rows(manifest)
    calibrations = _read_calibrations(manifest)

    judge_decisions = _count_values(row.get("judge_decision") for row in results)
    convergence_statuses = _count_values(row.get("convergence_status") for row in results)
    quality_gate_decisions = _count_values(
        dict(row.get("quality_gate") or {}).get("decision") for row in results
    )
    refine_buckets = _count_values(
        _read_recorded_judge(row).get("recommended_refine_bucket") for row in results
    )
    blocking_issue_count = sum(
        len(_read_recorded_judge(row).get("blocking_issues", []) or [])
        for row in results
    )

    summary = {
        "schema_version": "paper_wiki_eval_summary.v0",
        "created_at": _now(),
        "manifest": str(manifest_path),
        "mode": manifest.get("mode"),
        "case_count": len(results),
        "generated_count": sum(1 for row in results if row.get("status") != "error"),
        "error_count": sum(1 for row in results if row.get("status") == "error"),
        "awaiting_judge_count": sum(
            1
            for row in results
            if row.get("status") != "error" and row.get("judge_decision") is None
        ),
        "quality_gate_decisions": quality_gate_decisions,
        "judge_decisions": judge_decisions,
        "convergence_statuses": convergence_statuses,
        "blocking_issue_count": blocking_issue_count,
        "refine_buckets": refine_buckets,
        "human_calibration_count": len(calibrations),
        "human_calibration_decisions": _count_values(
            row.get("human_decision") for row in calibrations
        ),
        "next_action": _next_action(results, calibrations),
    }
    target = out_path or manifest_path.parent / "eval_summary.json"
    _write_json(target, summary)
    return target


def _find_judge_result(
    *,
    case_id: str,
    run_manifest: Path,
    manifest_dir: Path,
    judge_dir: Path | None,
) -> Path | None:
    candidates = [
        run_manifest.parent / "judge-result.json",
        manifest_dir / f"{case_id}.judge-result.json",
        manifest_dir / f"{case_id}.judge.json",
    ]
    if judge_dir is not None:
        candidates.extend(
            [
                judge_dir / f"{case_id}.judge-result.json",
                judge_dir / f"{case_id}.judge.json",
                judge_dir / case_id / "judge-result.json",
            ]
        )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _read_recorded_judge(result: dict[str, Any]) -> dict[str, Any]:
    path_value = result.get("judge_result")
    if not path_value:
        return {}
    path = Path(str(path_value))
    if not path.exists():
        return {}
    return _read_json(path)


def _read_calibrations(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    path_value = manifest.get("human_calibration")
    if not path_value:
        return []
    path = Path(str(path_value))
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped:
            payload = json.loads(stripped)
            if isinstance(payload, dict):
                rows.append(payload)
    return rows


def _find_result(manifest: dict[str, Any], case_id: str) -> dict[str, Any]:
    for result in _result_rows(manifest):
        if result.get("id") == case_id:
            return result
    raise ValueError(f"case id not found in eval manifest: {case_id}")


def _result_rows(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    rows = manifest.get("results")
    if not isinstance(rows, list):
        raise ValueError("eval manifest missing results list")
    return [row for row in rows if isinstance(row, dict)]


def _default_case_dir(manifest_path: Path, case_id: str) -> Path:
    return manifest_path.parent / case_id


def _count_values(values: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        if value is None:
            continue
        key = str(value)
        counts[key] = counts.get(key, 0) + 1
    return counts


def _next_action(results: list[dict[str, Any]], calibrations: list[dict[str, Any]]) -> str:
    if any(row.get("status") == "error" for row in results):
        return "Fix errored cases before judging the run."
    if any(row.get("judge_decision") is None for row in results):
        return "Run LLM-as-Judge for awaiting cases, then run meridian wiki eval-converge."
    if not calibrations:
        return "Record human calibration for at least 3-5 judged cases before scaling."
    if any(row.get("convergence_status") == "needs_refine" for row in results):
        return "Refine the highest-count failure bucket before adding more cases."
    return "Calibration evidence is available; decide whether to expand the regression set."


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
