from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class StructuralSelfCheckResult:
    path: Path
    decision: str
    weighted_score: float


DIMENSION_WEIGHTS = {
    "run_manifest_contract": 1.4,
    "artifact_existence": 1.5,
    "frontmatter_schema": 1.4,
    "frontmatter_body_source_of_truth": 1.1,
    "section_schema": 1.2,
    "candidate_jsonl_schema": 1.4,
    "provenance_linkage": 1.3,
    "extraction_consistency": 1.3,
    "source_management": 1.1,
}

REQUIRED_RUN_KEYS = {
    "schema_version",
    "created_at",
    "source_pdf",
    "input_pdf",
    "source_management",
    "title",
    "write_policy",
    "draft_artifacts",
    "quality_gate",
    "paper_model",
    "review_packet",
    "paper_page",
    "extraction_dir",
    "page_count",
    "canonical_wiki_mutated",
}

REQUIRED_ARTIFACT_KEYS = {"review_packet", "paper_page", "claims", "methods", "evidence"}

REQUIRED_FRONTMATTER_FIELDS = {
    "type",
    "title",
    "status",
    "created",
    "updated",
    "aliases",
    "source_pdf",
    "source_id",
    "source_registry",
    "sources",
    "page_count",
    "model_strategy",
    "tags",
    "topics",
    "methods",
    "settings",
    "datasets",
    "metrics",
    "claims",
    "confidence",
    "review_state",
    "artifacts",
}

LIST_FRONTMATTER_FIELDS = {
    "aliases",
    "sources",
    "tags",
    "topics",
    "methods",
    "settings",
    "datasets",
    "metrics",
    "claims",
    "related",
    "artifacts",
}

CRITICAL_FRONTMATTER_FIELDS = {
    "type",
    "title",
    "source_pdf",
    "source_id",
    "source_registry",
    "sources",
    "page_count",
    "model_strategy",
    "settings",
    "claims",
}

REQUIRED_SECTIONS = [
    "What To Remember",
    "When To Retrieve This Paper",
    "Mechanism",
    "Mechanism Details To Verify",
    "Evidence Map",
    "Implementation Hooks",
    "Limitations / Uncertainty",
    "Candidate Records",
]

CLAIM_REQUIRED_FIELDS = {
    "schema_version",
    "id",
    "status",
    "paper_title",
    "claim",
    "claim_type",
    "provenance",
    "evidence_ids",
    "confidence",
    "review_state",
}

METHOD_REQUIRED_FIELDS = {
    "schema_version",
    "id",
    "status",
    "paper_title",
    "name",
    "short_name",
    "summary",
    "inputs",
    "outputs",
    "assumptions",
    "implementation_notes",
    "provenance",
    "confidence",
    "review_state",
}

EVIDENCE_REQUIRED_FIELDS = {
    "schema_version",
    "id",
    "status",
    "evidence_type",
    "page",
    "text_preview",
    "page_image",
    "confidence",
    "review_state",
}


def run_structural_self_check(*, run_manifest: Path, out_path: Path | None = None) -> StructuralSelfCheckResult:
    run = json.loads(run_manifest.read_text(encoding="utf-8"))
    artifacts = dict(run.get("draft_artifacts") or {})
    paper_path = Path(str(artifacts.get("paper_page") or run.get("paper_page") or ""))
    review_path = Path(str(artifacts.get("review_packet") or run.get("review_packet") or ""))
    claims_path = Path(str(artifacts.get("claims") or ""))
    methods_path = Path(str(artifacts.get("methods") or ""))
    evidence_path = Path(str(artifacts.get("evidence") or ""))
    extraction_dir = Path(str(run.get("extraction_dir") or ""))
    pages_path = extraction_dir / "pages.jsonl"

    paper_text = _read_text(paper_path)
    frontmatter = _parse_frontmatter(paper_text)
    body = _strip_frontmatter(paper_text)
    sections = _sections(body)
    claims = _read_jsonl(claims_path)
    methods = _read_jsonl(methods_path)
    evidence = _read_jsonl(evidence_path)
    pages = _read_jsonl(pages_path)

    scores = [
        _run_manifest_score(run, artifacts),
        _artifact_existence_score(
            run=run,
            paper_path=paper_path,
            review_path=review_path,
            claims_path=claims_path,
            methods_path=methods_path,
            evidence_path=evidence_path,
            extraction_dir=extraction_dir,
            pages_path=pages_path,
        ),
        _frontmatter_score(frontmatter, run),
        _frontmatter_body_source_score(frontmatter, sections),
        _section_score(sections),
        _candidate_score(claims, methods, evidence),
        _provenance_score(claims, methods, evidence, sections, pages),
        _extraction_score(run, pages, extraction_dir),
        _source_management_score(run, frontmatter),
    ]
    weighted_score = _weighted_score(scores)
    blocking = _blocking_findings(scores)
    decision = _decision(weighted_score, blocking)

    payload = {
        "schema_version": "paper_wiki_structural_self_check.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "run_manifest": str(run_manifest),
        "paper_page": str(paper_path),
        "title": run.get("title"),
        "agent_role": "structural",
        "managed_agent_architecture": {
            "understanding_agent": "reader-check.md",
            "quality_agent": "quality-self-check.json",
            "structural_agent": "structural-self-check.json",
        },
        "decision": decision,
        "weighted_score": round(weighted_score, 3),
        "score_scale": "1=broken, 2=incomplete, 3=minimally recoverable, 4=stable, 5=complete",
        "dimension_scores": scores,
        "blocking_findings": blocking,
        "structure_buckets": _structure_buckets(scores),
        "recommended_repairs": _recommended_repairs(scores),
    }

    output = out_path or run_manifest.parent / "structural-self-check.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return StructuralSelfCheckResult(path=output, decision=decision, weighted_score=weighted_score)


def _run_manifest_score(run: dict[str, Any], artifacts: dict[str, Any]) -> dict[str, Any]:
    missing = sorted(REQUIRED_RUN_KEYS - set(run))
    artifact_missing = sorted(REQUIRED_ARTIFACT_KEYS - set(artifacts))
    findings = []
    if run.get("schema_version") != "paper_wiki_ingest.v0":
        findings.append(f"unexpected_schema:{run.get('schema_version')}")
    if missing:
        findings.append(f"missing_run_keys:{','.join(missing)}")
    if artifact_missing:
        findings.append(f"missing_artifact_keys:{','.join(artifact_missing)}")
    if artifacts.get("paper_page") != run.get("paper_page"):
        findings.append("paper_page_alias_mismatch")
    if artifacts.get("review_packet") != run.get("review_packet"):
        findings.append("review_packet_alias_mismatch")
    score = 5 - 0.55 * len(missing) - 0.7 * len(artifact_missing) - 0.8 * sum("mismatch" in item for item in findings)
    if run.get("schema_version") != "paper_wiki_ingest.v0":
        score -= 1.0
    return _dimension("run_manifest_contract", score, "run_manifest", "run.json exposes the stable ingest contract.", findings)


def _artifact_existence_score(
    *,
    run: dict[str, Any],
    paper_path: Path,
    review_path: Path,
    claims_path: Path,
    methods_path: Path,
    evidence_path: Path,
    extraction_dir: Path,
    pages_path: Path,
) -> dict[str, Any]:
    required_paths = [paper_path, review_path, claims_path, methods_path, evidence_path, pages_path]
    missing = [str(path) for path in required_paths if not path.exists()]
    empty = [str(path) for path in required_paths if path.exists() and path.is_file() and path.stat().st_size == 0]
    findings = []
    if missing:
        findings.append(f"missing_paths:{';'.join(missing[:8])}")
    if empty:
        findings.append(f"empty_paths:{';'.join(empty[:8])}")
    if not (extraction_dir / "page-images").exists():
        findings.append("missing_page_images_dir")
    if run.get("canonical_wiki_mutated"):
        canonical = dict(run.get("canonical_artifacts") or {})
        for key in ("paper_page", "index", "log"):
            if not canonical.get(key):
                findings.append(f"missing_canonical_artifact:{key}")
            elif not Path(str(canonical[key])).exists():
                findings.append(f"missing_canonical_path:{key}")
    score = 5 - 0.75 * len(missing) - 0.5 * len(empty) - 0.75 * len([f for f in findings if f.startswith("missing_canonical")])
    return _dimension("artifact_existence", score, "artifact_write", "All draft and required canonical artifacts are present and non-empty.", findings)


def _frontmatter_score(frontmatter: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    missing = sorted(REQUIRED_FRONTMATTER_FIELDS - set(frontmatter))
    critical_missing = sorted(CRITICAL_FRONTMATTER_FIELDS - set(frontmatter))
    type_errors = [field for field in LIST_FRONTMATTER_FIELDS if field in frontmatter and not isinstance(frontmatter[field], list)]
    findings = []
    if missing:
        findings.append(f"missing_frontmatter:{','.join(missing)}")
    if critical_missing:
        findings.append(f"missing_critical_frontmatter:{','.join(critical_missing)}")
    if type_errors:
        findings.append(f"frontmatter_list_type_errors:{','.join(type_errors)}")
    if frontmatter.get("type") != "paper":
        findings.append(f"frontmatter_type:{frontmatter.get('type')}")
    if str(frontmatter.get("title") or "") != str(run.get("title") or ""):
        findings.append("title_mismatch_run_vs_frontmatter")
    if str(frontmatter.get("source_id") or "") and str(frontmatter.get("source_id")) not in str(run.get("source_pdf") or ""):
        source_management = dict(run.get("source_management") or {})
        if str(frontmatter.get("source_id")) != str(source_management.get("source_id") or ""):
            findings.append("source_id_mismatch")
    page_count = _as_int(frontmatter.get("page_count"))
    if page_count is None or page_count != _as_int(run.get("page_count")):
        findings.append("page_count_mismatch")
    score = 5 - 0.35 * len(missing) - 0.5 * len(type_errors) - 0.6 * len([item for item in findings if item.endswith("mismatch")])
    if critical_missing:
        score = min(score, 2.5)
    if frontmatter.get("type") != "paper":
        score -= 1
    return _dimension("frontmatter_schema", score, "frontmatter", "paper.md frontmatter is complete and machine-routable.", findings)


def _frontmatter_body_source_score(frontmatter: dict[str, Any], sections: dict[str, str]) -> dict[str, Any]:
    retrieval_intent = sections.get("When To Retrieve This Paper", "")
    lower = retrieval_intent.lower()
    findings: list[str] = []
    if "Retrieval Anchors" in sections:
        findings.append("legacy_retrieval_anchors_section_present")
    if "Retrieval Notes" in sections:
        findings.append("legacy_retrieval_notes_section_present")
    if not retrieval_intent:
        findings.append("missing_when_to_retrieve")
    if re.search(r"^- (Methods|Topics|Settings|Datasets|Metrics):", retrieval_intent, flags=re.MULTILINE):
        findings.append("body_copies_frontmatter_field_lists")
    if "use this paper when you need to:" not in lower:
        findings.append("missing_positive_routing_header")
    if "do not use it when:" not in lower:
        findings.append("missing_negative_routing_header")
    for field in ("methods", "topics", "settings"):
        values = frontmatter.get(field)
        if field == "settings" and values == []:
            continue
        if not isinstance(values, list):
            findings.append(f"{field}_not_list")
    score = 5 - 0.9 * len(findings)
    if (
        "legacy_retrieval_anchors_section_present" in findings
        or "legacy_retrieval_notes_section_present" in findings
        or "body_copies_frontmatter_field_lists" in findings
    ):
        score = min(score, 3.0)
    return _dimension(
        "frontmatter_body_source_of_truth",
        score,
        "paper_page_template",
        "Frontmatter is the machine-readable retrieval source of truth and body when-to-retrieve intent does not duplicate field lists.",
        findings,
    )


def _section_score(sections: dict[str, str]) -> dict[str, Any]:
    missing = [section for section in REQUIRED_SECTIONS if section not in sections]
    empty = [section for section in REQUIRED_SECTIONS if not sections.get(section, "").strip()]
    order_errors = []
    actual_order = [section for section in sections if section in REQUIRED_SECTIONS]
    expected_order = [section for section in REQUIRED_SECTIONS if section in sections]
    if actual_order != expected_order:
        order_errors.append("required_sections_out_of_order")
    findings = []
    if missing:
        findings.append(f"missing_sections:{','.join(missing)}")
    if empty:
        findings.append(f"empty_sections:{','.join(empty)}")
    findings.extend(order_errors)
    score = 5 - 0.55 * len(missing) - 0.4 * len(empty) - 0.75 * len(order_errors)
    if missing:
        score = min(score, 2.5)
    return _dimension("section_schema", score, "paper_page_template", "paper.md preserves the required durable section contract.", findings)


def _candidate_score(
    claims: list[dict[str, Any]],
    methods: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
) -> dict[str, Any]:
    findings = []
    findings.extend(_records_missing_fields("claim", claims, CLAIM_REQUIRED_FIELDS))
    findings.extend(_records_missing_fields("method", methods, METHOD_REQUIRED_FIELDS))
    findings.extend(_records_missing_fields("evidence", evidence, EVIDENCE_REQUIRED_FIELDS))
    if not claims:
        findings.append("missing_claim_records")
    if not methods:
        findings.append("missing_method_records")
    if not evidence:
        findings.append("missing_evidence_records")
    method_contract_gaps = [
        str(record.get("id"))
        for record in methods
        if not (record.get("inputs") and record.get("outputs") and record.get("assumptions") and record.get("implementation_notes"))
    ]
    if method_contract_gaps:
        findings.append(f"method_contract_gaps:{','.join(method_contract_gaps[:6])}")
    score = 5 - 0.35 * len(findings)
    if not claims or not methods or not evidence:
        score = min(score, 2.5)
    return _dimension("candidate_jsonl_schema", score, "candidate_record_schema", "Candidate JSONL records are structurally promotable.", findings)


def _provenance_score(
    claims: list[dict[str, Any]],
    methods: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    sections: dict[str, str],
    pages: list[dict[str, Any]],
) -> dict[str, Any]:
    page_numbers = {_as_int(page.get("page_number")) for page in pages}
    page_numbers.discard(None)
    findings = []
    evidence_ids = {str(record.get("id")) for record in evidence}
    for label, records in (("claim", claims), ("method", methods)):
        for record in records:
            provenance = record.get("provenance")
            if not isinstance(provenance, list) or not provenance:
                findings.append(f"{label}_missing_provenance:{record.get('id')}")
                continue
            for item in provenance:
                page = _as_int(dict(item).get("page")) if isinstance(item, dict) else None
                if page is None or (page_numbers and page not in page_numbers):
                    findings.append(f"{label}_bad_provenance_page:{record.get('id')}")
                    break
    for claim in claims:
        for evidence_id in claim.get("evidence_ids") or []:
            if str(evidence_id) not in evidence_ids:
                findings.append(f"claim_missing_evidence_link:{claim.get('id')}->{evidence_id}")
    if not re.search(r"\bProvenance: p\. \d+", "\n".join(sections.values())):
        findings.append("paper_sections_lack_page_provenance")
    score = 5 - 0.35 * len(findings)
    return _dimension("provenance_linkage", score, "evidence_linking", "Structured records and prose retain page-level provenance links.", findings)


def _extraction_score(run: dict[str, Any], pages: list[dict[str, Any]], extraction_dir: Path) -> dict[str, Any]:
    page_count = _as_int(run.get("page_count")) or 0
    findings = []
    if len(pages) != page_count:
        findings.append(f"page_count_mismatch:pages_jsonl={len(pages)},run={page_count}")
    missing_fields = []
    for page in pages:
        for field in ("page_number", "text", "image_path", "image_count", "drawing_count"):
            if field not in page:
                missing_fields.append(f"p{page.get('page_number')}:{field}")
        image_path = Path(str(page.get("image_path") or ""))
        if image_path and not image_path.exists():
            findings.append(f"missing_page_image:{image_path}")
    if missing_fields:
        findings.append(f"page_record_missing_fields:{','.join(missing_fields[:8])}")
    rendered_images = list((extraction_dir / "page-images").glob("page-*.png"))
    if page_count and len(rendered_images) != page_count:
        findings.append(f"page_image_count_mismatch:images={len(rendered_images)},run={page_count}")
    if not (extraction_dir / "figures" / "README.md").exists():
        findings.append("missing_figures_readme")
    if not (extraction_dir / "tables" / "README.md").exists():
        findings.append("missing_tables_readme")
    score = 5 - 0.4 * len(findings)
    if not pages:
        score = 1
    return _dimension("extraction_consistency", score, "extraction", "Extraction artifacts are complete enough to replay source-grounded review.", findings)


def _source_management_score(run: dict[str, Any], frontmatter: dict[str, Any]) -> dict[str, Any]:
    source_management = dict(run.get("source_management") or {})
    findings = []
    if source_management.get("mode") != "managed":
        findings.append(f"source_management_mode:{source_management.get('mode')}")
        return _dimension("source_management", 3.0, "source_management", "Raw source registration is present when wiki root is available.", findings)
    required = {"source_id", "registry", "managed_path", "sha256"}
    missing = sorted(required - set(source_management))
    if missing:
        findings.append(f"missing_source_management:{','.join(missing)}")
    registry_path = Path(str(source_management.get("registry") or ""))
    managed_path = Path(str(source_management.get("managed_path") or ""))
    if not registry_path.exists():
        findings.append(f"missing_source_registry:{registry_path}")
    if not managed_path.exists():
        findings.append(f"missing_managed_source:{managed_path}")
    if frontmatter.get("source_registry") and str(frontmatter.get("source_registry")) != str(registry_path):
        findings.append("frontmatter_registry_mismatch")
    if frontmatter.get("source_pdf") and str(frontmatter.get("source_pdf")) != str(managed_path):
        findings.append("frontmatter_source_pdf_mismatch")
    if registry_path.exists() and source_management.get("source_id"):
        registry_records = _read_jsonl(registry_path)
        matching = [record for record in registry_records if record.get("source_id") == source_management.get("source_id")]
        if not matching:
            findings.append("source_id_absent_from_registry")
        elif matching[-1].get("sha256") != source_management.get("sha256"):
            findings.append("source_registry_sha_mismatch")
    score = 5 - 0.45 * len(findings)
    return _dimension("source_management", score, "source_management", "Raw PDF is managed as immutable source with registry identity.", findings)


def _records_missing_fields(label: str, records: list[dict[str, Any]], required_fields: set[str]) -> list[str]:
    findings = []
    for record in records:
        missing = sorted(required_fields - set(record))
        if missing:
            findings.append(f"{label}_missing_fields:{record.get('id')}:{','.join(missing)}")
    return findings


def _blocking_findings(scores: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "dimension": str(score["dimension"]),
            "bucket": str(score["structure_bucket"]),
            "reason": "; ".join(str(item) for item in score.get("findings") or []),
        }
        for score in scores
        if float(score["score"]) < 3.0
    ]


def _structure_buckets(scores: list[dict[str, Any]]) -> dict[str, list[str]]:
    buckets: dict[str, list[str]] = {}
    for score in scores:
        if float(score["score"]) >= 4.0:
            continue
        bucket = str(score["structure_bucket"])
        buckets.setdefault(bucket, []).append(str(score["dimension"]))
    return buckets


def _recommended_repairs(scores: list[dict[str, Any]]) -> list[str]:
    repairs = []
    for score in scores:
        if float(score["score"]) >= 4.0:
            continue
        repairs.append(
            f"{score['dimension']}: repair {score['structure_bucket']} because {score.get('findings') or score.get('description')}"
        )
    return repairs


def _decision(weighted_score: float, blocking: list[dict[str, str]]) -> str:
    if weighted_score >= 4.25 and not blocking:
        return "pass"
    if weighted_score >= 3.25:
        return "needs_refine"
    return "fail"


def _weighted_score(scores: list[dict[str, Any]]) -> float:
    total_weight = 0.0
    weighted = 0.0
    for score in scores:
        weight = float(score["weight"])
        total_weight += weight
        weighted += float(score["score"]) * weight
    return weighted / total_weight if total_weight else 0.0


def _dimension(
    dimension: str,
    score: float,
    structure_bucket: str,
    description: str,
    findings: list[Any],
) -> dict[str, Any]:
    return {
        "dimension": dimension,
        "score": round(max(1.0, min(5.0, score)), 2),
        "weight": DIMENSION_WEIGHTS[dimension],
        "structure_bucket": structure_bucket,
        "description": description,
        "findings": findings,
    }


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                records.append({"_invalid_json": stripped[:120]})
                continue
            if isinstance(payload, dict):
                records.append(payload)
    return records


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _parse_frontmatter(text: str) -> dict[str, Any]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    lines = text[4:end].splitlines()
    data: dict[str, Any] = {}
    current_key: str | None = None
    for line in lines:
        if not line.strip():
            continue
        if line.startswith("  - ") and current_key:
            data.setdefault(current_key, []).append(_unquote(line[4:].strip()))
            continue
        if ":" not in line:
            continue
        key, raw = line.split(":", 1)
        current_key = key.strip()
        value = raw.strip()
        if not value:
            data[current_key] = []
        elif value == "[]":
            data[current_key] = []
        else:
            data[current_key] = _coerce_scalar(_unquote(value))
    return data


def _strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---", 4)
    if end == -1:
        return text
    return text[end + 4 :].lstrip()


def _sections(markdown: str) -> dict[str, str]:
    matches = list(re.finditer(r"^## (.+)$", markdown, flags=re.MULTILINE))
    result: dict[str, str] = {}
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        result[match.group(1).strip()] = markdown[start:end].strip()
    return result


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return value


def _coerce_scalar(value: str) -> Any:
    if value.isdigit():
        return int(value)
    if value == "true":
        return True
    if value == "false":
        return False
    return value


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
