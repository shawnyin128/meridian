from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class JudgeRecordResult:
    judge_result_path: Path
    run_manifest: Path


@dataclass(frozen=True)
class WikiConvergenceResult:
    convergence_path: Path
    status: str
    run_manifest: Path


def record_judge_result(
    *,
    run_manifest: Path,
    judge_result_path: Path,
    out_path: Path | None = None,
) -> JudgeRecordResult:
    run = _read_json(run_manifest)
    judge_result = _read_json(judge_result_path)
    _validate_judge_result(judge_result)

    target = out_path or run_manifest.parent / "judge-result.json"
    if judge_result_path.resolve() != target.resolve():
        target.write_text(json.dumps(judge_result, indent=2) + "\n", encoding="utf-8")

    run["judge_result"] = {
        "schema_version": "paper_wiki_recorded_judge_result.v0",
        "path": str(target),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "decision": judge_result["decision"],
        "weighted_score": judge_result.get("weighted_score"),
        "blocking_issues": judge_result.get("blocking_issues", []),
        "recommended_refine_bucket": judge_result.get("recommended_refine_bucket"),
    }
    _write_json(run_manifest, run)
    _append_log_from_run(run, f"- Judge decision: `{judge_result['decision']}`\n- Judge result: `{target}`\n")
    return JudgeRecordResult(judge_result_path=target, run_manifest=run_manifest)


def converge_wiki_run(
    *,
    run_manifest: Path,
    out_path: Path | None = None,
) -> WikiConvergenceResult:
    run = _read_json(run_manifest)
    quality = dict(run.get("quality_gate") or {})
    judge_record = dict(run.get("judge_result") or {})

    if not judge_record:
        status = "needs_judge"
        reason = "No recorded LLM-as-Judge result is available."
        judge_decision = None
    else:
        judge_decision = judge_record.get("decision")
        if quality.get("decision") == "fail":
            status = "needs_refine"
            reason = "The structural quality gate failed."
        elif judge_decision == "pass":
            status = "converged"
            reason = "The quality gate did not fail and the LLM-as-Judge decision passed."
        else:
            status = "needs_refine"
            reason = "The LLM-as-Judge result requested refinement or failed the packet."

    payload: dict[str, Any] = {
        "schema_version": "paper_wiki_convergence.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "run_manifest": str(run_manifest),
        "status": status,
        "reason": reason,
        "quality_gate_decision": quality.get("decision"),
        "judge_decision": judge_decision,
    }
    target = out_path or run_manifest.parent / "convergence.json"
    _write_json(target, payload)

    run["convergence"] = {
        "path": str(target),
        "status": status,
        "updated_at": payload["created_at"],
    }
    _write_json(run_manifest, run)
    _update_canonical_review_state(run, status=status, judge_decision=judge_decision)
    _append_log_from_run(
        run,
        f"- Convergence status: `{status}`\n- Reason: {reason}\n- Convergence record: `{target}`\n",
    )
    return WikiConvergenceResult(convergence_path=target, status=status, run_manifest=run_manifest)


def _validate_judge_result(result: dict[str, Any]) -> None:
    if result.get("schema_version") != "paper_wiki_judge_result.v0":
        raise ValueError("judge result must use schema_version paper_wiki_judge_result.v0")
    if result.get("decision") not in {"pass", "needs_refine", "fail"}:
        raise ValueError("judge result decision must be pass, needs_refine, or fail")
    if "dimension_scores" not in result:
        raise ValueError("judge result missing dimension_scores")


def _update_canonical_review_state(
    run: dict[str, Any],
    *,
    status: str,
    judge_decision: object,
) -> None:
    canonical = dict(run.get("canonical_artifacts") or {})
    paper_path = canonical.get("paper_page")
    if not paper_path:
        return
    path = Path(str(paper_path))
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    review_state = "auto_converged" if status == "converged" else str(status)
    text = _replace_or_insert_frontmatter_field(text, "review_state", review_state)
    text = _replace_or_insert_frontmatter_field(text, "convergence_state", status)
    if judge_decision is not None:
        text = _replace_or_insert_frontmatter_field(text, "judge_decision", str(judge_decision))
    path.write_text(text, encoding="utf-8")


def _replace_or_insert_frontmatter_field(text: str, key: str, value: str) -> str:
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        return text
    for index in range(1, len(lines)):
        if lines[index] == "---":
            lines.insert(index, f"{key}: \"{value}\"")
            return "\n".join(lines) + "\n"
        if lines[index].startswith(f"{key}:"):
            lines[index] = f"{key}: \"{value}\""
            return "\n".join(lines) + "\n"
    return text


def _append_log_from_run(run: dict[str, Any], entry_body: str) -> None:
    canonical = dict(run.get("canonical_artifacts") or {})
    log_path = canonical.get("log")
    if not log_path:
        return
    path = Path(str(log_path))
    if not path.exists():
        return
    existing = path.read_text(encoding="utf-8").rstrip()
    title = run.get("title", "Untitled Paper")
    now = datetime.now(timezone.utc).date().isoformat()
    entry = f"\n\n## [{now}] converge | {title}\n\n{entry_body}"
    path.write_text(existing + entry, encoding="utf-8")


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
