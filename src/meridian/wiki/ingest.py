from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.extract import PdfExtraction, extract_pdf
from meridian.wiki.model import build_paper_model
from meridian.wiki.packet import render_paper_draft, render_review_packet
from meridian.wiki.publish import PublishResult, publish_canonical_draft
from meridian.wiki.quality import QualityGate, evaluate_ingest_quality
from meridian.wiki.sources import SourceRecord, infer_wiki_root_from_out_dir, register_pdf_source


@dataclass(frozen=True)
class IngestResult:
    out_dir: Path
    review_path: Path
    paper_path: Path
    claims_path: Path
    methods_path: Path
    evidence_path: Path
    run_path: Path
    quality_gate: QualityGate
    publish_result: PublishResult | None
    source_record: SourceRecord | None


def run_ingest(
    pdf_path: Path,
    out_dir: Path,
    title_override: str | None = None,
    overwrite: bool = False,
    case_metadata: dict[str, object] | None = None,
    wiki_root: Path | None = None,
    publish_mode: str = "never",
) -> IngestResult:
    _prepare_out_dir(out_dir, overwrite=overwrite)
    extraction_dir = out_dir / "extraction"
    extraction: PdfExtraction = extract_pdf(pdf_path=pdf_path, extraction_dir=extraction_dir)

    title = title_override or _title_from_metadata_or_path(extraction, pdf_path)
    created_date = datetime.now(timezone.utc).date().isoformat()
    effective_wiki_root = wiki_root or infer_wiki_root_from_out_dir(out_dir)
    source_record = (
        register_pdf_source(pdf_path=pdf_path, wiki_root=effective_wiki_root, title=title)
        if effective_wiki_root is not None
        else None
    )
    source_pdf = source_record.managed_path if source_record is not None else pdf_path
    review_path = out_dir / "review.md"
    paper_path = out_dir / "paper.md"
    claims_path = out_dir / "claims.jsonl"
    methods_path = out_dir / "methods.jsonl"
    evidence_path = out_dir / "evidence.jsonl"
    run_path = out_dir / "run.json"
    model = build_paper_model(title=title, extraction=extraction)

    review_path.write_text(
        render_review_packet(
            title=title,
            pdf_path=source_pdf,
            extraction=extraction,
            model=model,
            case_metadata=case_metadata,
            created_date=created_date,
            source_record=source_record,
        ),
        encoding="utf-8",
    )
    paper_path.write_text(
        render_paper_draft(
            title=title,
            pdf_path=source_pdf,
            extraction=extraction,
            model=model,
            created_date=created_date,
            source_record=source_record,
        ),
        encoding="utf-8",
    )
    _write_jsonl(claims_path, model.claim_records)
    _write_jsonl(methods_path, model.method_records)
    _write_jsonl(evidence_path, model.evidence_records)

    quality_gate = evaluate_ingest_quality(
        extraction=extraction,
        paper_path=paper_path,
        claims_path=claims_path,
        methods_path=methods_path,
        evidence_path=evidence_path,
    )
    publish_result = _maybe_publish(
        wiki_root=effective_wiki_root,
        publish_mode=publish_mode,
        title=title,
        pdf_path=source_pdf,
        out_dir=out_dir,
        paper_path=paper_path,
        quality_gate=quality_gate,
        created_date=created_date,
        overwrite=overwrite,
    )

    run_payload: dict[str, Any] = {
        "schema_version": "paper_wiki_ingest.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_pdf": str(source_pdf),
        "input_pdf": str(pdf_path),
        "source_management": (
            {
                "mode": "managed",
                "source_id": source_record.source_id,
                "registry": str(source_record.registry_path),
                "managed_path": str(source_record.managed_path),
                "sha256": source_record.sha256,
            }
            if source_record is not None
            else {"mode": "unmanaged"}
        ),
        "title": title,
        "write_policy": "draft_only" if publish_result is None else "auto_publish_draft",
        "draft_artifacts": {
            "review_packet": str(review_path),
            "paper_page": str(paper_path),
            "claims": str(claims_path),
            "methods": str(methods_path),
            "evidence": str(evidence_path),
        },
        "quality_gate": quality_gate.to_json(),
        "paper_model": {
            "strategy": model.strategy,
            "claim_candidates": len(model.claim_records),
            "method_candidates": len(model.method_records),
            "mechanism_fact_candidates": len(model.mechanism_facts),
            "evidence_candidates": len(model.evidence_records),
            "topics": model.topics,
            "datasets": model.datasets,
            "metrics": model.metrics,
        },
        "review_packet": str(review_path),
        "paper_page": str(paper_path),
        "extraction_dir": str(extraction_dir),
        "page_count": extraction.page_count,
        "canonical_wiki_mutated": publish_result is not None,
    }
    if publish_result is not None:
        run_payload["canonical_artifacts"] = {
            "paper_page": str(publish_result.paper_path),
            "index": str(publish_result.index_path),
            "log": str(publish_result.log_path),
        }
    if case_metadata:
        run_payload["eval_case_id"] = case_metadata.get("id")

    run_path.write_text(json.dumps(run_payload, indent=2) + "\n", encoding="utf-8")
    return IngestResult(
        out_dir=out_dir,
        review_path=review_path,
        paper_path=paper_path,
        claims_path=claims_path,
        methods_path=methods_path,
        evidence_path=evidence_path,
        run_path=run_path,
        quality_gate=quality_gate,
        publish_result=publish_result,
        source_record=source_record,
    )


def _prepare_out_dir(out_dir: Path, overwrite: bool) -> None:
    if out_dir.exists():
        if not overwrite:
            raise FileExistsError(f"output directory already exists: {out_dir}")
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=False)


def _title_from_metadata_or_path(extraction: PdfExtraction, pdf_path: Path) -> str:
    metadata_title = str(extraction.metadata.get("title") or "").strip()
    page_title = _title_from_first_page(extraction)
    if (
        page_title
        and metadata_title
        and not _looks_like_arxiv_filename(metadata_title)
        and (_looks_truncated_title(metadata_title) or _page_title_is_better(metadata_title, page_title))
    ):
        return page_title
    if metadata_title and not _looks_like_arxiv_filename(metadata_title):
        return _clean_title_line(metadata_title)
    if page_title:
        return page_title
    stem = re.sub(r"[-_]+", " ", pdf_path.stem).strip()
    return stem.title() if stem else "Untitled Paper"


def _looks_like_arxiv_filename(title: str) -> bool:
    return bool(re.fullmatch(r"\d{4}\.\d{4,5}v\d+", title.strip(), flags=re.IGNORECASE))


def _looks_truncated_title(title: str) -> bool:
    normalized = title.strip()
    return normalized.endswith("-") or normalized.endswith(":")


def _page_title_is_better(metadata_title: str, page_title: str) -> bool:
    metadata_norm = re.sub(r"[^a-z0-9]+", "", metadata_title.lower())
    page_norm = re.sub(r"[^a-z0-9]+", "", page_title.lower())
    return len(page_title) >= len(metadata_title) + 12 and page_norm.startswith(metadata_norm[:24])


def _title_from_first_page(extraction: PdfExtraction) -> str | None:
    if not extraction.pages:
        return None
    lines = [line.strip() for line in extraction.pages[0].text.splitlines() if line.strip()]
    cleaned_lines = []
    for line in lines[:8]:
        line = re.sub(r"^Published as a conference paper at .*?\s+", "", line, flags=re.IGNORECASE)
        if not line or line.lower() in {"abstract", "keywords"}:
            continue
        if "@" in line or line.startswith("http"):
            continue
        cleaned_lines.append(line)

    multiline = _multi_line_title(cleaned_lines)
    if multiline:
        return multiline
    for line in cleaned_lines:
        if 8 <= len(line) <= 180 and _looks_like_title_line(line):
            return _clean_title_line(line)
    return None


def _multi_line_title(lines: list[str]) -> str | None:
    title_parts: list[str] = []
    for line in lines[:6]:
        lowered = line.lower()
        if lowered == "abstract":
            break
        if any(marker in lowered for marker in ("university", "department", "institute", "laboratory", "research†")):
            break
        is_title_continuation = bool(title_parts and _looks_title_continuation(line, title_parts))
        if not is_title_continuation and (
            _looks_author_line(line) or (title_parts and _looks_author_continuation(line))
        ):
            break
        if _looks_like_title_line(line) or title_parts:
            title_parts.append(line)
    if not title_parts:
        return None
    title = " ".join(title_parts)
    title = title.replace("- ", "")
    title = _clean_title_line(title)
    return title if 8 <= len(title) <= 220 else None


def _looks_author_line(line: str) -> bool:
    if any(marker in line for marker in ("∗", "†", "λ", "§", "∓")) and ":" not in line:
        return True
    if "," in line and len(line.split()) >= 4:
        return True
    tokens = line.replace("∗", "").replace("†", "").split()
    uppercase_count = sum(character.isupper() for character in line)
    alpha_count = sum(character.isalpha() for character in line)
    if uppercase_count / max(alpha_count, 1) > 0.55:
        return False
    capitalized = sum(bool(re.match(r"^[A-Z][a-zA-Z.-]+$", token)) for token in tokens)
    return len(tokens) >= 3 and capitalized / max(len(tokens), 1) > 0.7 and ":" not in line


def _looks_author_continuation(line: str) -> bool:
    if any(character.isdigit() for character in line) or any(marker in line for marker in (":", "(", ")", "/")):
        return False
    tokens = line.replace("∗", "").replace("†", "").split()
    if not 2 <= len(tokens) <= 5:
        return False
    uppercase_count = sum(character.isupper() for character in line)
    alpha_count = sum(character.isalpha() for character in line)
    if uppercase_count / max(alpha_count, 1) > 0.55:
        return False
    title_stopwords = {"of", "for", "with", "via", "and", "in", "on", "at", "to", "from"}
    if any(token.lower() in title_stopwords for token in tokens):
        return False
    capitalized = sum(bool(re.match(r"^[A-Z][a-zA-Z.-]+$", token)) for token in tokens)
    return capitalized == len(tokens)


def _looks_title_continuation(line: str, title_parts: list[str]) -> bool:
    previous = title_parts[-1].strip()
    if previous.endswith(("-", ":")):
        return True
    if previous.split()[-1].lower() in {"of", "for", "with", "via", "and", "dual", "model"}:
        return True
    technical_terms = {
        "activation",
        "activations",
        "calibrated",
        "inference",
        "language",
        "llm",
        "llms",
        "matrix",
        "model",
        "models",
        "multiplication",
        "outlier",
        "outliers",
        "quantization",
        "quantized",
        "refining",
        "rotations",
        "scale",
        "transformations",
        "transformers",
    }
    return any(token.lower().strip(":-,") in technical_terms for token in line.split())


def _looks_like_title_line(line: str) -> bool:
    lowered = line.lower()
    if any(marker in lowered for marker in ("university", "school of", "department", "institute")):
        return False
    alpha_count = sum(character.isalpha() for character in line)
    if alpha_count < 8:
        return False
    uppercase_count = sum(character.isupper() for character in line)
    return ":" in line or uppercase_count / max(alpha_count, 1) > 0.35 or len(line.split()) >= 4


def _clean_title_line(line: str) -> str:
    line = re.sub(r"\s+", " ", line).strip(" .")
    if sum(character.isupper() for character in line) / max(sum(character.isalpha() for character in line), 1) > 0.65:
        line = line.title()
    replacements = {
        "Llm": "LLM",
        "Ptq": "PTQ",
        "Ostquant": "OSTQuant",
        "Qsur": "QSUR",
        "Affinequant": "AffineQuant",
        "Spinquant": "SpinQuant",
        "Duquant": "DuQuant",
        "Flatquant": "FlatQuant",
        "D F Rot": "DFRot",
        "Dfrot": "DFRot",
        "Quarot": "QuaRot",
        "Omniquant": "OmniQuant",
        "Squeezellm": "SqueezeLLM",
        "Moequant": "MoEQuant",
    }
    for source, target in replacements.items():
        line = line.replace(source, target)
    return line


def _maybe_publish(
    *,
    wiki_root: Path | None,
    publish_mode: str,
    title: str,
    pdf_path: Path,
    out_dir: Path,
    paper_path: Path,
    quality_gate: QualityGate,
    created_date: str,
    overwrite: bool,
) -> PublishResult | None:
    if publish_mode == "never":
        return None
    if wiki_root is None:
        raise ValueError("--wiki-root is required when publish mode is not 'never'")
    if publish_mode == "auto" and quality_gate.decision == "fail":
        return None
    if publish_mode not in {"auto", "always"}:
        raise ValueError(f"unknown publish mode: {publish_mode}")

    return publish_canonical_draft(
        wiki_root=wiki_root,
        title=title,
        source_pdf=pdf_path,
        draft_paper_path=paper_path,
        draft_out_dir=out_dir,
        quality_gate=quality_gate,
        created_date=created_date,
        overwrite=overwrite,
    )


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
