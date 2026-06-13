from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "paper_wiki_source_fidelity_result.v0"
PACKET_SCHEMA_VERSION = "paper_wiki_source_fidelity_packet.v0"

SUPPORTED_DECISIONS = {"pass", "needs_review", "fail"}
SUPPORTED_ROLES = {"source_fact", "wiki_synthesis", "uncertainty", "user_insight"}
SUPPORTED_VERDICTS = {"supported", "unsupported", "contradicted", "insufficient_context"}
SUPPORT_LOCATOR_FIELDS = {"page", "section", "table", "figure", "algorithm", "equation", "source"}


@dataclass(frozen=True)
class SourceFidelityResult:
    path: Path
    decision: str
    weighted_score: float
    blocking_findings: list[dict[str, Any]]


@dataclass(frozen=True)
class PublishDecision:
    decision: str
    reason: str
    review_state: str
    validation_state: str
    trust_state: str
    blocking_findings: list[dict[str, Any]]


def load_source_fidelity_result(path: Path) -> SourceFidelityResult:
    payload = _read_json_object(path)
    blocking = _validate_payload(payload)
    blocking.extend(_statement_blocking_findings(payload))

    raw_decision = str(payload.get("decision") or "fail")
    if raw_decision not in SUPPORTED_DECISIONS:
        blocking.append(_blocking("invalid_decision", raw_decision, "source_fidelity_schema"))
        raw_decision = "fail"

    hard_failures = payload.get("hard_failures") or []
    if isinstance(hard_failures, list):
        for failure in hard_failures:
            blocking.append(_hard_failure_blocking_finding(failure))
    else:
        blocking.append(_blocking("hard_failures_not_list", type(hard_failures).__name__, "source_fidelity_schema"))

    decision = "fail" if blocking or raw_decision == "fail" else raw_decision
    return SourceFidelityResult(
        path=path,
        decision=decision,
        weighted_score=_coerce_score(payload.get("weighted_score")),
        blocking_findings=blocking,
    )


def missing_source_fidelity_result(expected_path: Path) -> SourceFidelityResult:
    return SourceFidelityResult(
        path=expected_path,
        decision="needs_review",
        weighted_score=1.0,
        blocking_findings=[
            _blocking("missing_source_fidelity_result", str(expected_path), "source_fidelity_review")
        ],
    )


def decide_publish(
    *,
    quality_gate_decision: str,
    quality_self_check_decision: str,
    quality_self_check_score: float,
    structural_self_check_decision: str,
    structural_self_check_score: float,
    source_fidelity: SourceFidelityResult,
    source_fidelity_result_provided: bool,
    publish_mode: str,
) -> PublishDecision:
    if publish_mode == "always":
        if not source_fidelity_result_provided:
            blocking = [
                _blocking(
                    "manual_override_requires_source_fidelity_result",
                    str(source_fidelity.path),
                    "source_fidelity_review",
                )
            ]
            blocking.extend(source_fidelity.blocking_findings)
            return PublishDecision(
                decision="blocked",
                reason="manual_override_requires_source_fidelity_result",
                review_state="needs_review",
                validation_state="source_fidelity_not_passed",
                trust_state="quarantined",
                blocking_findings=blocking,
            )
        if source_fidelity.decision != "pass" or source_fidelity.blocking_findings:
            blocking = [_blocking("source_fidelity_not_pass", source_fidelity.decision, "source_fidelity_review")]
            blocking.extend(source_fidelity.blocking_findings)
            return PublishDecision(
                decision="blocked",
                reason=str(blocking[0]["rule_id"]),
                review_state="needs_review",
                validation_state="source_fidelity_not_passed",
                trust_state="quarantined",
                blocking_findings=blocking,
            )
        return PublishDecision(
            decision="published",
            reason="manual_override_publish_mode_always",
            review_state="human_overrode_gate",
            validation_state="source_fidelity_pass",
            trust_state="manual_override",
            blocking_findings=[],
        )

    blocking: list[dict[str, Any]] = []
    if quality_gate_decision != "pass":
        blocking.append(_blocking("quality_gate_not_pass", quality_gate_decision, "quality_gate"))
    if quality_self_check_decision != "pass" or quality_self_check_score < 4.25:
        blocking.append(
            _blocking(
                "quality_self_check_not_pass",
                f"{quality_self_check_decision}:{quality_self_check_score:.3f}",
                "quality_self_check",
            )
        )
    if structural_self_check_decision != "pass" or structural_self_check_score < 4.25:
        blocking.append(
            _blocking(
                "structural_self_check_not_pass",
                f"{structural_self_check_decision}:{structural_self_check_score:.3f}",
                "structural_self_check",
            )
        )
    if source_fidelity.decision != "pass":
        blocking.append(_blocking("source_fidelity_not_pass", source_fidelity.decision, "source_fidelity_review"))
    blocking.extend(source_fidelity.blocking_findings)

    if blocking:
        return PublishDecision(
            decision="blocked",
            reason=str(blocking[0]["rule_id"]),
            review_state="needs_review",
            validation_state="source_fidelity_not_passed",
            trust_state="quarantined",
            blocking_findings=blocking,
        )

    return PublishDecision(
        decision="published",
        reason="all_required_gates_passed",
        review_state="auto_converged",
        validation_state="source_fidelity_pass",
        trust_state="source_verified",
        blocking_findings=[],
    )


def build_source_fidelity_packet(run_manifest: Path, out_path: Path) -> Path:
    run = _read_json_object(run_manifest)
    artifacts = run.get("draft_artifacts")
    if not isinstance(artifacts, dict):
        artifacts = {}

    paper_ref = artifacts.get("paper_page") or run.get("paper_page") or run.get("paper_path")
    pages_ref = run.get("pages_jsonl") or run.get("pages_path")
    paper_path = _artifact_path(
        run_manifest,
        paper_ref,
    )
    pages_path = _artifact_path(run_manifest, pages_ref)
    if pages_path is None:
        extraction_dir = _artifact_path(run_manifest, run.get("extraction_dir"))
        pages_path = extraction_dir / "pages.jsonl" if extraction_dir is not None else None
        pages_ref = str(Path(str(run.get("extraction_dir"))) / "pages.jsonl") if run.get("extraction_dir") else pages_ref

    packet = [
        "# Paper Wiki Source-Fidelity Packet",
        "",
        f"Schema version: `{PACKET_SCHEMA_VERSION}`",
        "",
        "Judge whether the generated paper candidate is faithful to the source excerpts.",
        f"Return JSON matching `{SCHEMA_VERSION}`.",
        "",
        "## Run Context",
        "",
        _fenced("json", json.dumps(_run_context(run, run_manifest), indent=2, sort_keys=True)),
        "",
        "## paper.md",
        "",
        _fenced("markdown", _artifact_text(paper_path, paper_ref)),
        "",
        "## pages.jsonl",
        "",
        _fenced("jsonl", _artifact_text(pages_path, pages_ref)),
        "",
        "## Required Result Shape",
        "",
        _fenced("json", json.dumps(_result_shape(), indent=2)),
    ]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(packet).rstrip() + "\n", encoding="utf-8")
    return out_path


def source_fidelity_manifest_payload(result: SourceFidelityResult, decision: PublishDecision) -> dict[str, Any]:
    return {
        "schema_version": "paper_wiki_source_fidelity_gate.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "result_path": str(result.path),
        "source_fidelity_decision": result.decision,
        "source_fidelity_weighted_score": round(result.weighted_score, 3),
        "publish_decision": decision.decision,
        "block_reason": decision.reason if decision.decision == "blocked" else None,
        "review_state": decision.review_state,
        "validation_state": decision.validation_state,
        "trust_state": decision.trust_state,
        "blocking_findings": decision.blocking_findings,
    }


def _validate_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    blocking: list[dict[str, Any]] = []
    for field in ("schema_version", "agent", "decision", "weighted_score", "statements"):
        if field not in payload:
            blocking.append(_blocking("missing_field", field, "source_fidelity_schema"))
    if payload.get("schema_version") != SCHEMA_VERSION:
        blocking.append(_blocking("unexpected_schema_version", str(payload.get("schema_version")), "source_fidelity_schema"))
    if payload.get("agent") != "source_fidelity":
        blocking.append(_blocking("unexpected_agent", str(payload.get("agent")), "source_fidelity_schema"))
    if not isinstance(payload.get("statements"), list):
        blocking.append(_blocking("statements_not_list", type(payload.get("statements")).__name__, "source_fidelity_schema"))
    try:
        float(payload.get("weighted_score"))
    except (TypeError, ValueError):
        blocking.append(_blocking("invalid_weighted_score", str(payload.get("weighted_score")), "source_fidelity_schema"))
    return blocking


def _statement_blocking_findings(payload: dict[str, Any]) -> list[dict[str, Any]]:
    statements = payload.get("statements")
    if not isinstance(statements, list):
        return []

    blocking: list[dict[str, Any]] = []
    has_core_statement = False
    for index, statement in enumerate(statements, start=1):
        if not isinstance(statement, dict):
            blocking.append(_blocking("statement_not_object", f"index={index}", "source_fidelity_schema"))
            continue

        role = str(statement.get("role") or "")
        verdict = str(statement.get("verdict") or "")
        raw_core = statement.get("core")
        core = raw_core is True
        support = statement.get("support")

        if role not in SUPPORTED_ROLES:
            blocking.append(_blocking("invalid_statement_role", role, "source_fidelity_schema"))
        if verdict not in SUPPORTED_VERDICTS:
            blocking.append(_blocking("invalid_statement_verdict", verdict, "source_fidelity_schema"))
        if not isinstance(raw_core, bool):
            blocking.append(
                _blocking(
                    "invalid_statement_core",
                    str(statement.get("statement_id") or index),
                    "source_fidelity_schema",
                )
            )
        if core:
            has_core_statement = True
        if core and verdict != "supported":
            blocking.append(
                _blocking(
                    f"{verdict or 'invalid'}_core_statement",
                    str(statement.get("statement") or statement.get("statement_id") or index),
                    str(statement.get("repair_bucket") or "source_fidelity_review"),
                )
            )
        if core and verdict == "supported" and (not support or not isinstance(support, list)):
            blocking.append(
                _blocking(
                    "supported_core_statement_missing_support",
                    str(statement.get("statement_id") or index),
                    "source_fidelity_schema",
                )
            )
        elif core and verdict == "supported" and not any(_valid_support_item(item) for item in support):
            blocking.append(
                _blocking(
                    "invalid_statement_support",
                    str(statement.get("statement_id") or index),
                    "source_fidelity_schema",
                )
            )
    if not has_core_statement:
        blocking.append(_blocking("missing_core_statement", "statements", "source_fidelity_schema"))
    return blocking


def _hard_failure_blocking_finding(failure: Any) -> dict[str, Any]:
    if isinstance(failure, dict):
        return _blocking(
            str(failure.get("rule_id") or failure.get("code") or "hard_failure"),
            str(failure.get("evidence") or failure.get("message") or failure),
            str(failure.get("repair_bucket") or "source_fidelity_review"),
        )
    return _blocking("hard_failure", str(failure), "source_fidelity_review")


def _blocking(rule_id: str, evidence: str, repair_bucket: str) -> dict[str, Any]:
    return {"rule_id": rule_id, "evidence": evidence, "repair_bucket": repair_bucket}


def _read_json_object(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def _coerce_score(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 1.0


def _artifact_path(run_manifest: Path, value: Any) -> Path | None:
    if not value:
        return None
    path = Path(str(value))
    if path.is_absolute():
        return path
    candidate = run_manifest.parent / path
    if candidate.exists():
        return candidate
    if path.exists():
        return path
    return path


def _artifact_text(path: Path | None, original_ref: Any) -> str:
    if path is None or not path.exists():
        label = str(original_ref) if original_ref else "unspecified"
        return f"[missing artifact: {label}]"
    return path.read_text(encoding="utf-8")


def _valid_support_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    has_locator = any(_valid_locator_value(field, item.get(field)) for field in SUPPORT_LOCATOR_FIELDS)
    has_evidence = _valid_evidence_text(item.get("excerpt")) or _valid_evidence_text(item.get("evidence"))
    return has_locator and has_evidence


def _valid_locator_value(field: str, value: Any) -> bool:
    if field == "page":
        return _valid_page_locator(value)
    if not isinstance(value, str):
        return False
    return bool(value.strip())


def _valid_page_locator(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return value > 0
    if not isinstance(value, str):
        return False
    stripped = value.strip()
    if not stripped.isdigit():
        return False
    return int(stripped) > 0


def _valid_evidence_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _run_context(run: dict[str, Any], run_manifest: Path) -> dict[str, Any]:
    return {
        "run_manifest": str(run_manifest),
        "title": run.get("title"),
        "source_pdf": run.get("source_pdf") or run.get("pdf_path"),
        "paper_page": run.get("paper_page"),
        "draft_artifacts": run.get("draft_artifacts") or {},
    }


def _result_shape() -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "agent": "source_fidelity",
        "decision": "pass | needs_review | fail",
        "weighted_score": 1.0,
        "statements": [
            {
                "statement_id": "stmt-1",
                "statement": "A core source-grounded statement from paper.md.",
                "role": "source_fact",
                "core": True,
                "verdict": "supported | unsupported | contradicted | insufficient_context",
                "support": [{"page": 1, "excerpt": "source excerpt"}],
                "repair_bucket": "none | paper_model_extraction | source_fidelity_review",
            }
        ],
        "hard_failures": [],
        "recommended_repairs": [],
    }


def _fenced(language: str, content: str) -> str:
    return f"```{language}\n{content.rstrip()}\n```"
