from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.converge import WikiConvergenceResult, converge_wiki_run, record_judge_result
from meridian.wiki.corpus import parse_frontmatter
from meridian.wiki.ingest import IngestResult, run_ingest
from meridian.wiki.judge import build_judge_packet
from meridian.wiki.publish import publish_canonical_draft
from meridian.wiki.quality_check import QualitySelfCheckResult, run_quality_self_check
from meridian.wiki.reader_check import build_reader_check_packet
from meridian.wiki.source_fidelity import (
    build_source_fidelity_packet,
    decide_publish,
    load_source_fidelity_result,
    missing_source_fidelity_result,
    source_fidelity_manifest_payload,
)
from meridian.wiki.structural_check import StructuralSelfCheckResult, run_structural_self_check
from meridian.wiki.vault import init_wiki_vault


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
    source_fidelity_result_path: Path | None = None,
    render_page_images: bool = True,
    source_root: Path | None = None,
) -> WikiFlowResult:
    init_wiki_vault(wiki_root=wiki_root)
    ingest_result: IngestResult = run_ingest(
        pdf_path=pdf_path,
        out_dir=out_dir,
        title_override=title_override,
        overwrite=overwrite,
        wiki_root=wiki_root,
        source_root=source_root,
        publish_mode="never",
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
    source_fidelity_packet_path = build_source_fidelity_packet(
        run_manifest=ingest_result.run_path,
        out_path=out_dir / "source-fidelity-packet.md",
    )
    source_fidelity_result_provided = source_fidelity_result_path is not None
    source_fidelity_result = (
        load_source_fidelity_result(source_fidelity_result_path)
        if source_fidelity_result_provided
        else missing_source_fidelity_result(out_dir / "source-fidelity-result.json")
    )
    quality_gate = ingest_result.quality_gate.to_json()
    publish_decision = decide_publish(
        quality_gate_decision=str(quality_gate.get("decision") or "fail"),
        quality_self_check_decision=quality_self_check.decision,
        quality_self_check_score=quality_self_check.weighted_score,
        structural_self_check_decision=structural_self_check.decision,
        structural_self_check_score=structural_self_check.weighted_score,
        source_fidelity=source_fidelity_result,
        source_fidelity_result_provided=source_fidelity_result_provided,
        publish_mode=publish_mode,
    )
    source_fidelity_gate = source_fidelity_manifest_payload(source_fidelity_result, publish_decision)

    run_payload = _read_json(ingest_result.run_path)
    deterministic_review_state = "blocked"
    if publish_decision.decision == "published":
        publish_result = publish_canonical_draft(
            wiki_root=wiki_root,
            title=str(run_payload.get("title") or "Untitled Paper"),
            source_pdf=Path(str(run_payload.get("source_pdf") or pdf_path)),
            draft_paper_path=ingest_result.paper_path,
            draft_out_dir=out_dir,
            quality_gate=ingest_result.quality_gate,
            created_date=_created_date(run_payload),
            overwrite=overwrite,
        )
        canonical_artifacts = {
            "paper_page": str(publish_result.paper_path),
            "index": str(publish_result.index_path),
            "log": str(publish_result.log_path),
        }
        run_payload["canonical_artifacts"] = canonical_artifacts
        run_payload["canonical_wiki_mutated"] = True
        run_payload["write_policy"] = "auto_publish_draft"
        product_artifacts = dict(run_payload.get("product_artifacts") or {})
        product_artifacts.update(
            {
                "canonical_paper_page": str(publish_result.paper_path),
                "wiki_index": str(publish_result.index_path),
                "wiki_log": str(publish_result.log_path),
            }
        )
        run_payload["product_artifacts"] = product_artifacts
        retrieval_visibility = dict(run_payload.get("retrieval_visibility") or {})
        retrieval_visibility["canonical_page"] = str(publish_result.paper_path)
        run_payload["retrieval_visibility"] = retrieval_visibility
        _patch_canonical_publish_decision(publish_result.paper_path, publish_decision)
        _write_json(ingest_result.run_path, run_payload)
        deterministic_review_state = _apply_deterministic_review_state(
            run_manifest=ingest_result.run_path,
            quality_self_check=quality_self_check,
            structural_self_check=structural_self_check,
        )
        _patch_canonical_publish_decision(publish_result.paper_path, publish_decision)
    else:
        run_payload["canonical_wiki_mutated"] = False
        run_payload["write_policy"] = "draft_only"
        _write_json(ingest_result.run_path, run_payload)

    convergence: WikiConvergenceResult | None = None
    status = "blocked" if publish_decision.decision == "blocked" else "awaiting_judge"
    if judge_result_path is not None and publish_decision.decision != "blocked":
        record_judge_result(
            run_manifest=ingest_result.run_path,
            judge_result_path=judge_result_path,
        )
        convergence = converge_wiki_run(run_manifest=ingest_result.run_path)
        status = "blocked" if publish_decision.decision == "blocked" else convergence.status
        if publish_decision.decision == "published":
            refreshed = _read_json(ingest_result.run_path)
            canonical = dict(refreshed.get("canonical_artifacts") or {})
            paper_path = canonical.get("paper_page")
            if paper_path:
                _patch_canonical_publish_decision(Path(str(paper_path)), publish_decision)

    flow_path = out_dir / "flow.json"
    run_payload = _read_json(ingest_result.run_path)
    validation_artifacts = {
        "judge_packet": str(judge_packet_path),
        "reader_check_packet": str(reader_check_packet_path),
        "quality_self_check": str(quality_self_check.path),
        "structural_self_check": str(structural_self_check.path),
        "source_fidelity_packet": str(source_fidelity_packet_path),
        "source_fidelity_result": str(source_fidelity_result.path),
        "convergence": str(convergence.convergence_path) if convergence else None,
    }
    run_payload["validation_artifacts"] = validation_artifacts
    run_payload["flow_manifest"] = str(flow_path)
    run_payload.update(
        {
            "publish_decision": publish_decision.decision,
            "block_reason": publish_decision.reason if publish_decision.decision == "blocked" else None,
            "source_fidelity_gate": source_fidelity_gate,
            "source_fidelity_packet": str(source_fidelity_packet_path),
            "source_fidelity_result": str(source_fidelity_result.path),
            "source_fidelity_decision": source_fidelity_result.decision,
            "source_fidelity_score": round(source_fidelity_result.weighted_score, 3),
            "blocking_findings": publish_decision.blocking_findings,
        }
    )
    _write_json(ingest_result.run_path, run_payload)

    payload = {
        "schema_version": "paper_wiki_flow.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "source_pdf": str(pdf_path),
        "wiki_root": str(wiki_root),
        "source_root": str(source_root) if source_root is not None else None,
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
        "deterministic_review_state": deterministic_review_state,
        "publish_decision": publish_decision.decision,
        "block_reason": publish_decision.reason if publish_decision.decision == "blocked" else None,
        "source_fidelity_gate": source_fidelity_gate,
        "source_fidelity_packet": str(source_fidelity_packet_path),
        "source_fidelity_result": str(source_fidelity_result.path),
        "source_fidelity_decision": source_fidelity_result.decision,
        "source_fidelity_score": round(source_fidelity_result.weighted_score, 3),
        "blocking_findings": publish_decision.blocking_findings,
        "managed_self_check_agents": {
            "understanding": str(reader_check_packet_path),
            "quality": str(quality_self_check.path),
            "structural": str(structural_self_check.path),
            "source_fidelity": str(source_fidelity_packet_path),
        },
        "source_artifacts": run_payload.get("source_artifacts") or {},
        "product_artifacts": run_payload.get("product_artifacts") or {},
        "internal_artifacts": run_payload.get("internal_artifacts") or {},
        "debug_artifacts": run_payload.get("debug_artifacts") or {},
        "validation_artifacts": validation_artifacts,
        "canonical_artifacts": run_payload.get("canonical_artifacts") or {},
        "retrieval_visibility": run_payload.get("retrieval_visibility") or {},
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


def _apply_deterministic_review_state(
    *,
    run_manifest: Path,
    quality_self_check: QualitySelfCheckResult,
    structural_self_check: StructuralSelfCheckResult,
) -> str:
    run = _read_json(run_manifest)
    canonical = dict(run.get("canonical_artifacts") or {})
    draft = dict(run.get("draft_artifacts") or {})
    raw_canonical_path = canonical.get("paper_page")
    canonical_path = Path(str(raw_canonical_path)) if raw_canonical_path else None
    raw_read_path = raw_canonical_path or draft.get("paper_page") or run.get("paper_page")
    read_path = Path(str(raw_read_path)) if raw_read_path else None
    text = read_path.read_text(encoding="utf-8") if read_path is not None and read_path.exists() else ""
    frontmatter = parse_frontmatter(text) if text else {}
    source_quality = str(frontmatter.get("source_quality") or "")
    quality_gate = dict(run.get("quality_gate") or {})

    if source_quality == "source_text_insufficient":
        review_state = "source_quality_hold"
        convergence_state = "source_quality_hold"
        reason = "Extracted text is insufficient; keep as OCR/replacement triage."
    elif (
        quality_gate.get("decision") != "fail"
        and quality_self_check.decision == "pass"
        and quality_self_check.weighted_score >= 4.7
        and structural_self_check.decision == "pass"
        and structural_self_check.weighted_score >= 4.7
    ):
        review_state = "auto_converged"
        convergence_state = "deterministic_text_converged"
        reason = "Deterministic quality and structural self-checks passed; LLM-as-Judge remains optional/sampled."
    else:
        review_state = "needs_review"
        convergence_state = "deterministic_needs_review"
        reason = "Deterministic self-checks did not meet the auto-convergence threshold."

    if canonical_path is not None and canonical_path.exists():
        text = _replace_or_insert_frontmatter_field(text, "review_state", review_state)
        text = _replace_or_insert_frontmatter_field(text, "convergence_state", convergence_state)
        text = _replace_or_insert_frontmatter_field(text, "judge_decision", "not_run")
        canonical_path.write_text(text, encoding="utf-8")

    run["deterministic_convergence"] = {
        "schema_version": "paper_wiki_deterministic_convergence.v0",
        "review_state": review_state,
        "convergence_state": convergence_state,
        "reason": reason,
        "quality_self_check_decision": quality_self_check.decision,
        "quality_self_check_score": round(quality_self_check.weighted_score, 3),
        "structural_self_check_decision": structural_self_check.decision,
        "structural_self_check_score": round(structural_self_check.weighted_score, 3),
    }
    _write_json(run_manifest, run)
    return review_state


def _patch_canonical_publish_decision(path: Path, publish_decision: Any) -> None:
    text = path.read_text(encoding="utf-8")
    text = _replace_or_insert_frontmatter_field(text, "review_state", publish_decision.review_state)
    text = _replace_or_insert_frontmatter_field(text, "validation_state", publish_decision.validation_state)
    text = _replace_or_insert_frontmatter_field(text, "trust_state", publish_decision.trust_state)
    path.write_text(text, encoding="utf-8")


def _created_date(run: dict[str, Any]) -> str:
    created = str(run.get("created_at") or "")
    return created[:10] if len(created) >= 10 else datetime.now(timezone.utc).date().isoformat()


def _replace_or_insert_frontmatter_field(text: str, key: str, value: str) -> str:
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        return text
    rendered = f'{key}: "{value}"'
    out = [lines[0]]
    inserted = False
    frontmatter_closed = False
    for line in lines[1:]:
        if not frontmatter_closed and line == "---":
            if not inserted:
                out.append(rendered)
                inserted = True
            out.append(line)
            frontmatter_closed = True
            continue
        if not frontmatter_closed and line.startswith(f"{key}:"):
            if not inserted:
                out.append(rendered)
                inserted = True
            continue
        out.append(line)
    return "\n".join(out) + "\n"


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _next_action(status: str) -> str:
    if status == "blocked":
        return "Run the source-fidelity review packet and rerun the flow with a passing result before publishing."
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
