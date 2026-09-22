from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from meridian.wiki.extract import PdfExtraction


@dataclass(frozen=True)
class QualityGate:
    decision: str
    review_state: str
    confidence: str
    errors: list[str]
    warnings: list[str]

    def to_json(self) -> dict[str, Any]:
        return {
            "schema_version": "paper_wiki_quality_gate.v0",
            "decision": self.decision,
            "review_state": self.review_state,
            "confidence": self.confidence,
            "errors": self.errors,
            "warnings": self.warnings,
        }


def evaluate_ingest_quality(
    extraction: PdfExtraction,
    paper_path: Path,
    claims_path: Path,
    methods_path: Path,
    evidence_path: Path,
) -> QualityGate:
    errors: list[str] = []
    warnings: list[str] = []

    if extraction.page_count <= 0:
        errors.append("no_pages_extracted")

    total_text_chars = sum(len(page.text.strip()) for page in extraction.pages)
    if total_text_chars == 0:
        errors.append("no_extractable_text")
    elif total_text_chars < 1000:
        warnings.append("low_text_volume")

    if not paper_path.exists():
        errors.append("missing_paper_page")
    else:
        paper_text = paper_path.read_text(encoding="utf-8")
        if not paper_text.startswith("---\n"):
            errors.append("paper_page_missing_frontmatter")
        if "Agent task:" in paper_text:
            warnings.append("paper_page_contains_unfilled_agent_tasks")

    _validate_jsonl_exists(claims_path, "claims", errors)
    _validate_jsonl_exists(methods_path, "methods", errors)
    evidence_records = _validate_jsonl_exists(evidence_path, "evidence", errors)

    if evidence_records and len(evidence_records) < extraction.page_count:
        warnings.append("evidence_records_do_not_cover_all_pages")

    for record in evidence_records:
        if record.get("page") is None:
            errors.append(f"evidence_missing_page:{record.get('id', 'unknown')}")
        if not record.get("page_image"):
            warnings.append(f"evidence_missing_page_image:{record.get('id', 'unknown')}")

    placeholder_count = _count_placeholder_records(claims_path) + _count_placeholder_records(methods_path)
    if placeholder_count:
        warnings.append(f"candidate_records_need_agent_fill:{placeholder_count}")

    if errors:
        return QualityGate(
            decision="fail",
            review_state="needs_review",
            confidence="low",
            errors=errors,
            warnings=warnings,
        )
    if warnings:
        return QualityGate(
            decision="warn",
            review_state="needs_review",
            confidence="low",
            errors=[],
            warnings=warnings,
        )
    return QualityGate(
        decision="pass",
        review_state="auto_ingested",
        confidence="medium",
        errors=[],
        warnings=[],
    )


def _validate_jsonl_exists(path: Path, label: str, errors: list[str]) -> list[dict[str, Any]]:
    if not path.exists():
        errors.append(f"missing_{label}_jsonl")
        return []

    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                record = json.loads(stripped)
            except json.JSONDecodeError:
                errors.append(f"invalid_{label}_jsonl:{line_number}")
                continue
            if not isinstance(record, dict):
                errors.append(f"non_object_{label}_jsonl:{line_number}")
                continue
            records.append(record)

    if not records:
        errors.append(f"empty_{label}_jsonl")
    return records


def _count_placeholder_records(path: Path) -> int:
    if not path.exists():
        return 0

    count = 0
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped:
                continue
            record = json.loads(stripped)
            if record.get("review_state") == "needs_agent_fill":
                count += 1
    return count
