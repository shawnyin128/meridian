from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.rubrics import complete_result_template, expected_result_schema, rubric_for, rubric_json
from meridian.wiki.structural_check import run_structural_self_check


AGENT_WEIGHTS = {
    "understanding": 0.45,
    "quality": 0.35,
    "structural": 0.20,
}

SUPPORTED_BACKENDS = {"agent-executed", "fake", "api", "vllm"}


@dataclass(frozen=True)
class SelfCheckRunResult:
    manifest_path: Path
    summary_path: Path | None
    status: str


@dataclass(frozen=True)
class SelfCheckAggregateResult:
    summary_path: Path
    decision: str
    weighted_score: float


@dataclass(frozen=True)
class SelfCheckEvalResult:
    summary_path: Path
    total_cases: int
    completed_cases: int
    awaiting_cases: int
    failed_cases: int


def run_self_check(
    *,
    run_manifest: Path,
    out_dir: Path | None = None,
    backend: str = "agent-executed",
    overwrite: bool = False,
) -> SelfCheckRunResult:
    if backend not in SUPPORTED_BACKENDS:
        raise ValueError(f"unknown self-check backend: {backend}")
    if backend in {"api", "vllm"}:
        raise NotImplementedError(
            f"{backend} backend is reserved by the judge backend contract but is not implemented in this prototype"
        )

    run = _read_json(run_manifest)
    output_dir = out_dir or run_manifest.parent / "self-check"
    _prepare_dir(output_dir, overwrite=overwrite)

    understanding_packet = output_dir / "understanding-agent.md"
    quality_packet = output_dir / "quality-agent.md"
    structural_result_path = output_dir / "structural-self-check.json"
    understanding_result_path = output_dir / "understanding-result.json"
    quality_result_path = output_dir / "quality-result.json"
    summary_path = output_dir / "self-check-summary.json"
    manifest_path = output_dir / "self-check-manifest.json"

    build_understanding_agent_packet(run_manifest=run_manifest, out_path=understanding_packet)
    build_quality_agent_packet(run_manifest=run_manifest, out_path=quality_packet)
    structural_result = run_structural_self_check(
        run_manifest=run_manifest,
        out_path=structural_result_path,
    )

    if backend == "fake":
        _write_fake_agent_result(
            agent="understanding",
            run=run,
            output_path=understanding_result_path,
            decision="pass",
            score=4.35,
        )
        _write_fake_agent_result(
            agent="quality",
            run=run,
            output_path=quality_result_path,
            decision="pass",
            score=4.30,
        )

    manifest = {
        "schema_version": "paper_wiki_self_check_manifest.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "backend": backend,
        "status": "ready_for_aggregate" if backend == "fake" else "awaiting_agent_results",
        "run_manifest": str(run_manifest),
        "title": run.get("title"),
        "backend_contract": {
            "agent-executed": "Codex or Claude Code reads packets, writes result JSON, then Meridian validates and aggregates.",
            "fake": "Deterministic test backend that writes schema-valid result JSON.",
            "api": "Reserved for external model API execution.",
            "vllm": "Reserved for local OpenAI-compatible vLLM endpoint execution.",
        },
        "agents": {
            "understanding": {
                "rubric": rubric_for("understanding").schema_version,
                "packet": str(understanding_packet),
                "expected_result": str(understanding_result_path),
                "result_schema": expected_result_schema("understanding"),
                "status": "completed" if backend == "fake" else "awaiting_agent_execution",
            },
            "quality": {
                "rubric": rubric_for("quality").schema_version,
                "packet": str(quality_packet),
                "expected_result": str(quality_result_path),
                "result_schema": expected_result_schema("quality"),
                "status": "completed" if backend == "fake" else "awaiting_agent_execution",
            },
            "structural": {
                "rubric": rubric_for("structural").schema_version,
                "packet": None,
                "expected_result": str(structural_result_path),
                "result_schema": expected_result_schema("structural"),
                "status": "completed",
                "decision": structural_result.decision,
                "weighted_score": round(structural_result.weighted_score, 3),
            },
        },
        "instructions_path": str(output_dir / "agent-execution-instructions.md"),
        "summary_path": str(summary_path),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    _write_agent_instructions(manifest_path=manifest_path, out_path=output_dir / "agent-execution-instructions.md")

    if backend == "fake":
        aggregate = aggregate_self_check(manifest_path=manifest_path, out_path=summary_path)
        return SelfCheckRunResult(manifest_path=manifest_path, summary_path=aggregate.summary_path, status="completed")
    return SelfCheckRunResult(manifest_path=manifest_path, summary_path=None, status="awaiting_agent_results")


def run_self_check_eval(
    *,
    eval_manifest: Path,
    out_dir: Path | None = None,
    backend: str = "agent-executed",
    overwrite: bool = False,
) -> SelfCheckEvalResult:
    eval_payload = _read_json(eval_manifest)
    results = list(eval_payload.get("results") or [])
    output_root = out_dir or eval_manifest.parent / "self-check"
    output_root.mkdir(parents=True, exist_ok=True)

    case_results = []
    counts = {"completed": 0, "awaiting_agent_results": 0, "failed": 0, "skipped": 0}
    for result in results:
        case_id = str(result.get("id") or f"case-{len(case_results) + 1}")
        run_manifest_value = result.get("run_manifest")
        if not run_manifest_value:
            case_results.append(
                {
                    "id": case_id,
                    "status": "skipped",
                    "reason": "eval result has no run_manifest",
                }
            )
            counts["skipped"] += 1
            continue
        case_dir = output_root / case_id
        try:
            run_result = run_self_check(
                run_manifest=Path(str(run_manifest_value)),
                out_dir=case_dir,
                backend=backend,
                overwrite=overwrite,
            )
            record: dict[str, Any] = {
                "id": case_id,
                "status": run_result.status,
                "run_manifest": str(run_manifest_value),
                "self_check_manifest": str(run_result.manifest_path),
            }
            if run_result.summary_path is not None:
                summary = _read_json(run_result.summary_path)
                record.update(
                    {
                        "self_check_summary": str(run_result.summary_path),
                        "decision": summary.get("decision"),
                        "weighted_score": summary.get("weighted_score"),
                        "agent_decisions": {
                            agent: dict(agent_result).get("decision")
                            for agent, agent_result in dict(summary.get("agents") or {}).items()
                        },
                    }
                )
            case_results.append(record)
            counts[run_result.status] = counts.get(run_result.status, 0) + 1
        except Exception as exc:  # noqa: BLE001 - preserve case-level failure for calibration.
            case_results.append(
                {
                    "id": case_id,
                    "status": "failed",
                    "run_manifest": str(run_manifest_value),
                    "error": str(exc),
                }
            )
            counts["failed"] += 1

    summary_path = output_root / "self-check-eval-summary.json"
    summary = {
        "schema_version": "paper_wiki_self_check_eval_summary.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "eval_manifest": str(eval_manifest),
        "backend": backend,
        "output_root": str(output_root),
        "total_cases": len(results),
        "completed_cases": counts.get("completed", 0),
        "awaiting_cases": counts.get("awaiting_agent_results", 0),
        "failed_cases": counts.get("failed", 0),
        "skipped_cases": counts.get("skipped", 0),
        "case_results": case_results,
    }
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return SelfCheckEvalResult(
        summary_path=summary_path,
        total_cases=len(results),
        completed_cases=counts.get("completed", 0),
        awaiting_cases=counts.get("awaiting_agent_results", 0),
        failed_cases=counts.get("failed", 0),
    )


def build_quality_agent_packet(*, run_manifest: Path, out_path: Path) -> Path:
    run = _read_json(run_manifest)
    artifacts = dict(run.get("draft_artifacts") or {})
    paper_path = Path(str(artifacts.get("paper_page") or run.get("paper_page") or ""))
    claims_path = Path(str(artifacts.get("claims") or ""))
    methods_path = Path(str(artifacts.get("methods") or ""))
    evidence_path = Path(str(artifacts.get("evidence") or ""))
    pages_path = Path(str(run.get("extraction_dir") or "")) / "pages.jsonl"

    packet = [
        "# Paper Wiki Quality Agent Packet",
        "",
        "Schema version: `paper_wiki_quality_agent_packet.v1`",
        "",
        "Judge whether `paper.md` is a high-quality durable wiki memory artifact.",
        "Focus on human readability, information density, retrieval usefulness, and research actionability.",
        "Do not judge structural file completeness here; the structural agent owns that.",
        "",
        "## Run Context",
        "",
        _fenced("json", json.dumps(_run_context(run), indent=2, ensure_ascii=False)),
        "",
        "## Rubric",
        "",
        _fenced("json", rubric_json("quality")),
        "",
        "## Required Output Schema",
        "",
        _fenced("json", json.dumps(expected_result_schema("quality"), indent=2, ensure_ascii=False)),
        "",
        "## Complex Retrieval Scenarios",
        "",
        "- A researcher has a new quantization or calibration idea and needs papers that explain what mechanism would be modified, what assumptions must stay true, and what evidence would falsify the idea.",
        "- A developer wants to implement or probe the method and needs the first functions to code, tensors/configs to log, ablations that isolate components, and sanity checks that prevent false positives.",
        "- A reviewer compares methods under a low-bit benchmark setting and needs datasets, metrics, baselines, speed/memory claims, and page-level evidence without mixing systems claims with accuracy claims.",
        "- A researcher wants to cite or build on prior work in a target area but must first inspect limitations, calibration dependence, model-family restrictions, and claims that should not generalize.",
        "- A reader needs prior work where figures, tables, algorithms, or equations carry the core argument, not only prose summaries.",
        "",
        "## paper.md",
        "",
        f"Path: `{paper_path}`",
        "",
        _fenced("markdown", _read_optional(paper_path)),
        "",
        "## Candidate Records",
        "",
        f"Claims: `{claims_path}`",
        "",
        _fenced("jsonl", _jsonl_preview(claims_path, 8)),
        "",
        f"Methods: `{methods_path}`",
        "",
        _fenced("jsonl", _jsonl_preview(methods_path, 8)),
        "",
        f"Evidence: `{evidence_path}`",
        "",
        _fenced("jsonl", _jsonl_preview(evidence_path, 10)),
        "",
        "## Source Page Signals",
        "",
        f"Pages: `{pages_path}`",
        "",
        _fenced("markdown", _source_page_signals(pages_path)),
        "",
        "## Task",
        "",
        "Return only JSON matching the required output schema.",
        "Every score must cite packet evidence and name a repair bucket when imperfect.",
        "Trigger hard failures when a high average score would hide a serious retrieval or quality defect.",
    ]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(packet).rstrip() + "\n", encoding="utf-8")
    return out_path


def build_understanding_agent_packet(*, run_manifest: Path, out_path: Path) -> Path:
    run = _read_json(run_manifest)
    artifacts = dict(run.get("draft_artifacts") or {})
    paper_path = Path(str(artifacts.get("paper_page") or run.get("paper_page") or ""))
    claims_path = Path(str(artifacts.get("claims") or ""))
    methods_path = Path(str(artifacts.get("methods") or ""))
    evidence_path = Path(str(artifacts.get("evidence") or ""))
    pages_path = Path(str(run.get("extraction_dir") or "")) / "pages.jsonl"

    packet = [
        "# Paper Wiki Understanding Agent Packet",
        "",
        "Schema version: `paper_wiki_understanding_agent_packet.v1`",
        "",
        "Execute the two-reader understanding rubric.",
        "Reader A must use only `paper.md`; Reader B must use source excerpts and candidate records.",
        "Then compare both understandings and attribute every meaningful gap to a repair bucket.",
        "",
        "## Run Context",
        "",
        _fenced("json", json.dumps(_run_context(run), indent=2, ensure_ascii=False)),
        "",
        "## Rubric",
        "",
        _fenced("json", rubric_json("understanding")),
        "",
        "## Required Output Schema",
        "",
        _fenced("json", json.dumps(expected_result_schema("understanding"), indent=2, ensure_ascii=False)),
        "",
        "## Reader A Task: paper.md Only",
        "",
        "Read only the generated `paper.md` below. Produce a concise but complete teach-back in your private working notes before scoring.",
        "If `paper.md` does not support a point, mark it as unknown rather than guessing.",
        "",
        f"Path: `{paper_path}`",
        "",
        _fenced("markdown", _read_optional(paper_path)),
        "",
        "## Reader B Task: Source Grounded",
        "",
        "Now ignore Reader A and use the source excerpts plus candidate records below. Build the source-grounded understanding needed to audit Reader A.",
        "",
        f"Source pages: `{pages_path}`",
        "",
        _fenced("markdown", _source_page_signals(pages_path)),
        "",
        f"Claims: `{claims_path}`",
        "",
        _fenced("jsonl", _jsonl_preview(claims_path, 8)),
        "",
        f"Methods: `{methods_path}`",
        "",
        _fenced("jsonl", _jsonl_preview(methods_path, 8)),
        "",
        f"Evidence: `{evidence_path}`",
        "",
        _fenced("jsonl", _jsonl_preview(evidence_path, 10)),
        "",
        "## Mandatory Comparison",
        "",
        "- Compare problem/scope, mechanism causality, component dependencies, math/algorithm semantics, visual/table semantics, claim/evidence alignment, limitations, and implementation/probe value.",
        "- Trigger hard failures for fabricated source facts, missing core method, major Reader A/B mismatch, or broken provenance for a core claim.",
        "- Return only JSON matching the required output schema.",
    ]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(packet).rstrip() + "\n", encoding="utf-8")
    return out_path


def aggregate_self_check(*, manifest_path: Path, out_path: Path | None = None) -> SelfCheckAggregateResult:
    manifest = _read_json(manifest_path)
    agents = dict(manifest.get("agents") or {})
    results = {
        "understanding": _load_agent_result(agents, "understanding"),
        "quality": _load_agent_result(agents, "quality"),
        "structural": _load_structural_result(agents),
    }
    validation_findings = []
    normalized = {}
    for agent, result in results.items():
        findings = _validate_agent_result(agent, result)
        validation_findings.extend(findings)
        normalized[agent] = _normalize_agent_result(agent, result, findings)

    hard_failures = [
        {"agent": agent, **hard_failure}
        for agent, result in normalized.items()
        for hard_failure in result.get("hard_failures", [])
    ]
    for finding in validation_findings:
        if finding["severity"] == "blocking":
            hard_failures.append({"agent": finding["agent"], "rule_id": "invalid_result_schema", **finding})

    weighted_score = sum(float(normalized[agent]["weighted_score"]) * AGENT_WEIGHTS[agent] for agent in AGENT_WEIGHTS)
    decision = _aggregate_decision(normalized, hard_failures, weighted_score)
    summary = {
        "schema_version": "paper_wiki_self_check_summary.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "manifest": str(manifest_path),
        "run_manifest": manifest.get("run_manifest"),
        "backend": manifest.get("backend"),
        "decision": decision,
        "weighted_score": round(weighted_score, 3),
        "agent_weights": AGENT_WEIGHTS,
        "agents": normalized,
        "hard_failures": hard_failures,
        "validation_findings": validation_findings,
        "recommended_repairs": _collect_repairs(normalized, validation_findings),
    }
    summary_output = out_path or Path(str(manifest.get("summary_path") or manifest_path.parent / "self-check-summary.json"))
    summary_output.parent.mkdir(parents=True, exist_ok=True)
    summary_output.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    manifest["status"] = "completed"
    manifest["summary_path"] = str(summary_output)
    manifest["decision"] = decision
    manifest["weighted_score"] = round(weighted_score, 3)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return SelfCheckAggregateResult(summary_path=summary_output, decision=decision, weighted_score=weighted_score)


def _write_fake_agent_result(*, agent: str, run: dict[str, Any], output_path: Path, decision: str, score: float) -> None:
    template = complete_result_template(agent)
    template["decision"] = decision
    template["weighted_score"] = score
    template["confidence"] = "medium"
    template["one_sentence_verdict"] = f"Fake backend result for {run.get('title') or 'paper'}."
    template["dimension_scores"] = [
        {
            "dimension": dimension.id,
            "score": score,
            "weight": dimension.weight,
            "anchor": "4",
            "evidence": "fake backend deterministic test result",
            "rationale": "Schema-valid fake result used for orchestration tests.",
            "repair_bucket": "judge_rubric",
        }
        for dimension in rubric_for(agent).dimensions
    ]
    template["calibration_notes"] = ["fake backend; do not use as semantic judgment"]
    output_path.write_text(json.dumps(template, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _load_agent_result(agents: dict[str, Any], agent: str) -> dict[str, Any]:
    path = Path(str(dict(agents.get(agent) or {}).get("expected_result") or ""))
    if not path.exists():
        return {
            "schema_version": rubric_for(agent).output_schema_version,
            "agent": agent,
            "decision": "fail",
            "weighted_score": 1.0,
            "confidence": "low",
            "one_sentence_verdict": "Result file is missing.",
            "dimension_scores": [],
            "hard_failures": [
                {
                    "rule_id": "missing_agent_result",
                    "severity": "blocking",
                    "evidence": str(path),
                    "repair_bucket": "judge_rubric",
                    "testable_fix": "Run the agent-executed rubric and write the expected result JSON.",
                }
            ],
            "findings": [],
            "recommended_repairs": ["Run missing agent result."],
            "calibration_notes": [],
        }
    return _read_json(path)


def _load_structural_result(agents: dict[str, Any]) -> dict[str, Any]:
    path = Path(str(dict(agents.get("structural") or {}).get("expected_result") or ""))
    payload = _read_json(path)
    return {
        "schema_version": "paper_wiki_structural_self_check.v0",
        "agent": "structural",
        "decision": payload.get("decision"),
        "weighted_score": payload.get("weighted_score"),
        "confidence": "high",
        "one_sentence_verdict": f"Structural check returned {payload.get('decision')}.",
        "dimension_scores": payload.get("dimension_scores") or [],
        "hard_failures": [
            {
                "rule_id": item.get("dimension", "structural_blocking"),
                "severity": "blocking",
                "evidence": item.get("reason", ""),
                "repair_bucket": item.get("bucket", "structural_schema"),
                "testable_fix": "Repair structural ingest artifact and rerun structural check.",
            }
            for item in payload.get("blocking_findings") or []
        ],
        "findings": [],
        "recommended_repairs": payload.get("recommended_repairs") or [],
        "calibration_notes": [],
    }


def _validate_agent_result(agent: str, result: dict[str, Any]) -> list[dict[str, str]]:
    findings = []
    rubric = rubric_for(agent)
    required_top_level = {
        "schema_version",
        "agent",
        "decision",
        "weighted_score",
        "confidence",
        "one_sentence_verdict",
        "dimension_scores",
        "hard_failures",
        "findings",
        "recommended_repairs",
        "calibration_notes",
    }
    missing_top_level = sorted(required_top_level - set(result))
    if missing_top_level:
        findings.append(
            {
                "agent": agent,
                "severity": "blocking",
                "problem": "missing result fields",
                "evidence": ",".join(missing_top_level),
            }
        )
    if result.get("schema_version") != rubric.output_schema_version:
        findings.append({"agent": agent, "severity": "blocking", "problem": "unexpected schema_version", "evidence": str(result.get("schema_version"))})
    if result.get("agent") != agent:
        findings.append({"agent": agent, "severity": "blocking", "problem": "agent mismatch", "evidence": str(result.get("agent"))})
    if result.get("decision") not in {"pass", "needs_refine", "fail"}:
        findings.append({"agent": agent, "severity": "blocking", "problem": "invalid decision", "evidence": str(result.get("decision"))})
    if not isinstance(result.get("dimension_scores"), list):
        findings.append({"agent": agent, "severity": "blocking", "problem": "dimension_scores must be a list", "evidence": type(result.get("dimension_scores")).__name__})
        return findings
    expected = {dimension.id for dimension in rubric.dimensions}
    actual = {str(item.get("dimension")) for item in result.get("dimension_scores") or [] if isinstance(item, dict)}
    missing = sorted(expected - actual)
    if missing:
        findings.append({"agent": agent, "severity": "blocking", "problem": "missing rubric dimensions", "evidence": ",".join(missing)})
    unknown = sorted(actual - expected)
    if unknown:
        findings.append({"agent": agent, "severity": "major", "problem": "unknown rubric dimensions", "evidence": ",".join(unknown)})
    expected_weights = {dimension.id: dimension.weight for dimension in rubric.dimensions}
    for item in result.get("dimension_scores") or []:
        if not isinstance(item, dict):
            findings.append({"agent": agent, "severity": "blocking", "problem": "dimension score is not an object", "evidence": repr(item)[:120]})
            continue
        dimension_id = str(item.get("dimension"))
        required_dimension_fields = {"dimension", "score", "weight"}
        if agent != "structural":
            required_dimension_fields.update({"anchor", "evidence", "rationale", "repair_bucket"})
        missing_dimension_fields = sorted(required_dimension_fields - set(item))
        if missing_dimension_fields:
            findings.append(
                {
                    "agent": agent,
                    "severity": "blocking",
                    "problem": "dimension score missing fields",
                    "evidence": f"{dimension_id}:{','.join(missing_dimension_fields)}",
                }
            )
        if not item.get("evidence") and agent != "structural":
            findings.append({"agent": agent, "severity": "major", "problem": "dimension score lacks evidence", "evidence": dimension_id})
        if not item.get("rationale") and agent != "structural":
            findings.append({"agent": agent, "severity": "major", "problem": "dimension score lacks rationale", "evidence": dimension_id})
        if dimension_id in expected_weights and abs(float(item.get("weight") or 0.0) - expected_weights[dimension_id]) > 0.0001:
            findings.append(
                {
                    "agent": agent,
                    "severity": "blocking",
                    "problem": "dimension weight mismatch",
                    "evidence": f"{dimension_id}:{item.get('weight')} expected {expected_weights[dimension_id]}",
                }
            )
        score = item.get("score")
        if not isinstance(score, (int, float)) or not 1 <= float(score) <= 5:
            findings.append({"agent": agent, "severity": "blocking", "problem": "dimension score outside 1-5", "evidence": str(item)})
    for list_field in ("hard_failures", "findings", "recommended_repairs", "calibration_notes"):
        if list_field in result and not isinstance(result.get(list_field), list):
            findings.append(
                {
                    "agent": agent,
                    "severity": "blocking",
                    "problem": f"{list_field} must be a list",
                    "evidence": type(result.get(list_field)).__name__,
                }
            )
    for failure in result.get("hard_failures") or []:
        if not isinstance(failure, dict):
            findings.append({"agent": agent, "severity": "blocking", "problem": "hard failure is not an object", "evidence": repr(failure)[:120]})
            continue
        missing_failure_fields = sorted({"rule_id", "severity", "evidence", "repair_bucket", "testable_fix"} - set(failure))
        if missing_failure_fields:
            findings.append(
                {
                    "agent": agent,
                    "severity": "blocking",
                    "problem": "hard failure missing fields",
                    "evidence": f"{failure.get('rule_id')}:{','.join(missing_failure_fields)}",
                }
            )
    return findings


def _normalize_agent_result(agent: str, result: dict[str, Any], validation_findings: list[dict[str, str]]) -> dict[str, Any]:
    blocking_validation = [finding for finding in validation_findings if finding["severity"] == "blocking"]
    decision = result.get("decision") if not blocking_validation else "fail"
    score = float(result.get("weighted_score") or 1.0)
    if blocking_validation:
        score = min(score, 2.0)
    return {
        "decision": decision,
        "weighted_score": round(score, 3),
        "confidence": result.get("confidence", "low"),
        "rubric": rubric_for(agent).schema_version,
        "dimension_scores": result.get("dimension_scores") or [],
        "hard_failures": result.get("hard_failures") or [],
        "findings": result.get("findings") or [],
        "recommended_repairs": result.get("recommended_repairs") or [],
        "calibration_notes": result.get("calibration_notes") or [],
    }


def _aggregate_decision(normalized: dict[str, dict[str, Any]], hard_failures: list[dict[str, Any]], weighted_score: float) -> str:
    if hard_failures or any(result["decision"] == "fail" for result in normalized.values()):
        return "fail"
    if any(result["decision"] == "needs_refine" for result in normalized.values()) or weighted_score < 4.2:
        return "needs_refine"
    return "pass"


def _collect_repairs(normalized: dict[str, dict[str, Any]], validation_findings: list[dict[str, str]]) -> list[str]:
    repairs = []
    for agent, result in normalized.items():
        for repair in result.get("recommended_repairs") or []:
            repairs.append(f"{agent}: {repair}")
        for failure in result.get("hard_failures") or []:
            repairs.append(f"{agent}: hard failure {failure.get('rule_id')} - {failure.get('testable_fix')}")
    for finding in validation_findings:
        repairs.append(f"{finding['agent']}: result validation - {finding['problem']} ({finding['evidence']})")
    return repairs


def _write_agent_instructions(*, manifest_path: Path, out_path: Path) -> None:
    manifest = _read_json(manifest_path)
    agents = dict(manifest.get("agents") or {})
    lines = [
        "# Agent-Executed Self-Check Instructions",
        "",
        "Run these steps in the active Codex or Claude Code session.",
        "Do not edit `paper.md` during judging. Write only the expected JSON result files, then run aggregation.",
        "",
        "## Understanding Agent",
        "",
        f"1. Read `{agents['understanding']['packet']}`.",
        f"2. Return JSON matching the embedded schema at `{agents['understanding']['expected_result']}`.",
        "",
        "## Quality Agent",
        "",
        f"1. Read `{agents['quality']['packet']}`.",
        f"2. Return JSON matching the embedded schema at `{agents['quality']['expected_result']}`.",
        "",
        "## Structural Agent",
        "",
        f"Already executed: `{agents['structural']['expected_result']}`.",
        "",
        "## Aggregate",
        "",
        f"After the two JSON result files exist, run `meridian wiki self-check-aggregate {manifest_path}`.",
    ]
    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _prepare_dir(path: Path, *, overwrite: bool) -> None:
    if path.exists() and any(path.iterdir()) and not overwrite:
        raise FileExistsError(f"self-check output directory already exists: {path}")
    path.mkdir(parents=True, exist_ok=True)


def _run_context(run: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": run.get("schema_version"),
        "title": run.get("title"),
        "quality_gate": run.get("quality_gate"),
        "paper_model": run.get("paper_model"),
        "source_management": run.get("source_management"),
        "canonical_wiki_mutated": run.get("canonical_wiki_mutated"),
    }


def _source_page_signals(path: Path) -> str:
    records = _read_jsonl(path)
    lines = []
    for record in records[:12]:
        text = str(record.get("text") or "").replace("\n", " ")
        lines.append(
            f"- p. {record.get('page_number')}: section={record.get('section_hint')}; "
            f"images={record.get('image_count')}; drawings={record.get('drawing_count')}; text={text[:300]}"
        )
    return "\n".join(lines)


def _jsonl_preview(path: Path, max_records: int) -> str:
    records = _read_jsonl(path)
    return "\n".join(json.dumps(record, ensure_ascii=False) for record in records[:max_records])


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                records.append(payload)
    return records


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_optional(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _fenced(language: str, content: str) -> str:
    return f"```{language}\n{content.rstrip()}\n```"
