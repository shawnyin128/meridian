from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from meridian.wiki.extract import PdfExtraction, PageExtraction


@dataclass(frozen=True)
class PaperModel:
    strategy: str
    retrieval_summary: str
    key_contributions: list[dict[str, Any]]
    method_notes: str
    open_questions: list[str]
    topics: list[str]
    methods: list[str]
    datasets: list[str]
    metrics: list[str]
    claim_records: list[dict[str, Any]]
    method_records: list[dict[str, Any]]
    evidence_records: list[dict[str, Any]]


MODEL_STRATEGY = "heuristic_text_v0"

METHOD_TERMS = (
    "method",
    "model",
    "framework",
    "algorithm",
    "approach",
    "architecture",
    "optimization",
    "training",
    "quantization",
    "clustering",
    "retrieval",
)

CLAIM_MARKERS = (
    "we propose",
    "we introduce",
    "we present",
    "we show",
    "we demonstrate",
    "we find",
    "our method",
    "our approach",
    "outperform",
    "improve",
    "achieve",
)

KNOWN_METRICS = (
    "accuracy",
    "perplexity",
    "latency",
    "throughput",
    "f1",
    "precision",
    "recall",
    "auc",
    "loss",
    "speedup",
    "memory",
)

KNOWN_DATASETS = (
    "WikiText2",
    "C4",
    "MMLU",
    "GSM8K",
    "MATH500",
    "HellaSwag",
    "PIQA",
    "WinoGrande",
    "ARC-Challenge",
    "ARC-Easy",
    "ImageNet",
    "COCO",
    "SQuAD",
)


def build_paper_model(title: str, extraction: PdfExtraction) -> PaperModel:
    abstract = _extract_abstract(extraction)
    summary = _summary_from_abstract_or_pages(abstract, extraction.pages)
    contribution_sentences = _candidate_claim_sentences(extraction.pages)
    key_contributions = _key_contributions(contribution_sentences)
    claim_records = _claim_records(title, key_contributions)
    method_records = _method_records(title, extraction.pages)
    methods = [record["name"] for record in method_records]
    evidence_records = _page_evidence_records(extraction, claim_records)
    method_notes = _method_notes(method_records, extraction.pages)
    topics = _topics(title, abstract, contribution_sentences)
    datasets = _known_terms(extraction, KNOWN_DATASETS)
    metrics = _known_terms(extraction, KNOWN_METRICS)

    return PaperModel(
        strategy=MODEL_STRATEGY,
        retrieval_summary=summary,
        key_contributions=key_contributions,
        method_notes=method_notes,
        open_questions=_open_questions(claim_records, method_records, evidence_records),
        topics=topics,
        methods=methods,
        datasets=datasets,
        metrics=metrics,
        claim_records=claim_records,
        method_records=method_records,
        evidence_records=evidence_records,
    )


def _extract_abstract(extraction: PdfExtraction) -> str:
    text = "\n".join(page.text for page in extraction.pages[:2])
    match = re.search(
        r"\babstract\b\s*(.*?)(?:\n\s*(?:1\s+)?introduction\b|\n\s*keywords?\b|\n\s*1\s)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if match:
        return _normalize(match.group(1))
    return _normalize(extraction.pages[0].text if extraction.pages else "")


def _summary_from_abstract_or_pages(abstract: str, pages: list[PageExtraction]) -> str:
    sentences = _sentences(abstract)
    if not sentences:
        sentences = _sentences(" ".join(page.text for page in pages[:2]))
    if not sentences:
        return "No reliable text summary could be extracted; inspect source pages before using this paper."
    selected = sentences[:3]
    return " ".join(selected)


def _candidate_claim_sentences(pages: list[PageExtraction]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for page in pages[:8]:
        for sentence in _sentences(page.text):
            lowered = sentence.lower()
            if any(marker in lowered for marker in CLAIM_MARKERS):
                candidates.append(
                    {
                        "sentence": sentence,
                        "page": page.page_number,
                        "section_hint": page.section_hint,
                    }
                )
            if len(candidates) >= 8:
                return candidates
    if not candidates:
        for page in pages[:3]:
            for sentence in _sentences(page.text):
                if 60 <= len(sentence) <= 260:
                    candidates.append(
                        {
                            "sentence": sentence,
                            "page": page.page_number,
                            "section_hint": page.section_hint,
                        }
                    )
                    if len(candidates) >= 3:
                        return candidates
    return candidates


def _key_contributions(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    contributions: list[dict[str, Any]] = []
    for candidate in candidates:
        sentence = str(candidate["sentence"])
        key = sentence.lower()
        if key in seen:
            continue
        seen.add(key)
        contributions.append(
            {
                "text": sentence,
                "provenance": [
                    {
                        "page": candidate["page"],
                        "section": candidate.get("section_hint"),
                    }
                ],
            }
        )
        if len(contributions) >= 5:
            break
    return contributions


def _claim_records(title: str, contributions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = []
    for index, contribution in enumerate(contributions, start=1):
        records.append(
            {
                "schema_version": "claim_candidate.v0",
                "id": f"claim-{index:03d}",
                "status": "draft",
                "paper_title": title,
                "claim": contribution["text"],
                "claim_type": "source_claim",
                "extraction_strategy": MODEL_STRATEGY,
                "provenance": contribution["provenance"],
                "evidence_ids": [f"evidence-p{contribution['provenance'][0]['page']:04d}"],
                "confidence": "medium",
                "review_state": "auto_extracted",
            }
        )
    if not records:
        records.append(
            {
                "schema_version": "claim_candidate.v0",
                "id": "claim-001",
                "status": "draft",
                "paper_title": title,
                "claim": "No explicit claim sentence was confidently extracted; inspect the paper before promoting claims.",
                "claim_type": "extraction_gap",
                "extraction_strategy": MODEL_STRATEGY,
                "provenance": [],
                "evidence_ids": [],
                "confidence": "low",
                "review_state": "needs_review",
            }
        )
    return records


def _method_records(title: str, pages: list[PageExtraction]) -> list[dict[str, Any]]:
    method_pages = _rank_method_pages(pages)
    method_text = _normalize(" ".join(page.text for page in method_pages))
    summary = " ".join(
        sentence for sentence in _sentences(method_text) if not _looks_like_table_sentence(sentence)
    )
    summary = " ".join(_sentences(summary)[:3])
    if not summary:
        summary = "Method details were not reliably extracted; inspect source pages before implementation use."

    method_name = _method_name_from_title(title)
    return [
        {
            "schema_version": "method_candidate.v0",
            "id": "method-001",
            "status": "draft",
            "paper_title": title,
            "name": method_name,
            "extraction_strategy": MODEL_STRATEGY,
            "summary": summary,
            "inputs": [],
            "outputs": [],
            "assumptions": [],
            "provenance": [{"page": page.page_number, "section": page.section_hint} for page in method_pages[:3]],
            "confidence": "medium" if method_pages else "low",
            "review_state": "auto_extracted",
        }
    ]


def _rank_method_pages(pages: list[PageExtraction]) -> list[PageExtraction]:
    scored: list[tuple[int, PageExtraction]] = []
    for page in pages[:12]:
        text = page.text.lower()
        score = 0
        if page.section_hint and page.section_hint.lower() in {"method", "methods", "approach"}:
            score += 2
        for term in (
            "framework",
            "stage",
            "algorithm",
            "objective",
            "clustering",
            "rotation",
            "outlier",
            "quantization",
            "optimization",
            "we propose",
            "we introduce",
        ):
            if term in text:
                score += 2
        if "table " in text:
            score -= 4
        if "references" in text or "ethics statement" in text:
            score -= 6
        scored.append((score, page))

    selected = [
        page
        for score, page in sorted(scored, key=lambda item: (-item[0], item[1].page_number))
        if score > 0
    ]
    if selected:
        return selected[:3]
    return pages[2:6] if len(pages) >= 6 else pages[:3]


def _looks_like_table_sentence(sentence: str) -> bool:
    lowered = sentence.lower()
    table_markers = ("table ", "models methods", "wiki2", "arc-challenge", "hellaswag")
    return any(marker in lowered for marker in table_markers)


def _page_evidence_records(
    extraction: PdfExtraction,
    claim_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    support_by_page: dict[int, list[str]] = {}
    for claim in claim_records:
        for provenance in claim.get("provenance", []):
            page = provenance.get("page")
            if isinstance(page, int):
                support_by_page.setdefault(page, []).append(str(claim["id"]))

    records = []
    for page in extraction.pages:
        preview = " ".join(page.text.split())
        if len(preview) > 500:
            preview = preview[:500].rstrip() + "..."
        records.append(
            {
                "schema_version": "evidence_candidate.v0",
                "id": f"evidence-p{page.page_number:04d}",
                "status": "draft",
                "evidence_type": "page",
                "extraction_strategy": MODEL_STRATEGY,
                "page": page.page_number,
                "section_hint": page.section_hint,
                "text_preview": preview,
                "page_image": page.image_path,
                "image_count": page.image_count,
                "drawing_count": page.drawing_count,
                "supports": support_by_page.get(page.page_number, []),
                "confidence": "medium" if preview else "low",
                "review_state": "auto_extracted" if preview else "needs_review",
            }
        )
    return records


def _method_notes(method_records: list[dict[str, Any]], pages: list[PageExtraction]) -> str:
    if method_records:
        record = method_records[0]
        provenance = record.get("provenance", [])
        page_refs = ", ".join(f"p. {item.get('page')}" for item in provenance if item.get("page"))
        suffix = f" Provenance: {page_refs}." if page_refs else ""
        return f"{record['summary']}{suffix}"
    if pages:
        return f"Method notes were not confidently extracted. Inspect p. {pages[0].page_number} and adjacent method sections."
    return "Method notes were not confidently extracted."


def _open_questions(
    claim_records: list[dict[str, Any]],
    method_records: list[dict[str, Any]],
    evidence_records: list[dict[str, Any]],
) -> list[str]:
    questions = []
    if any(record.get("confidence") == "low" for record in claim_records):
        questions.append("Which extracted claims are strong enough to promote beyond the paper page?")
    if any(not record.get("inputs") or not record.get("outputs") for record in method_records):
        questions.append("What are the method inputs, outputs, and implementation-critical assumptions?")
    if any(record.get("image_count", 0) or record.get("drawing_count", 0) for record in evidence_records):
        questions.append("Do key figures, tables, or equations change the interpretation of the text extraction?")
    if not questions:
        questions.append("Which claims should become canonical claim pages after cross-paper comparison?")
    return questions


def _topics(title: str, abstract: str, candidates: list[dict[str, Any]]) -> list[str]:
    text = f"{title} {abstract} " + " ".join(str(item["sentence"]) for item in candidates)
    words = re.findall(r"[A-Za-z][A-Za-z0-9-]{3,}", text)
    stop = {
        "this",
        "that",
        "with",
        "from",
        "paper",
        "method",
        "results",
        "show",
        "using",
        "which",
        "their",
        "these",
        "those",
        "while",
        "across",
        "within",
        "under",
        "between",
        "through",
        "have",
        "been",
    }
    counts: dict[str, int] = {}
    for word in words:
        key = word.lower()
        if key in stop:
            continue
        counts[key] = counts.get(key, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [word for word, _ in ranked[:8]]


def _known_terms(extraction: PdfExtraction, terms: tuple[str, ...]) -> list[str]:
    text = "\n".join(page.text for page in extraction.pages)
    found = []
    for term in terms:
        if re.search(rf"\b{re.escape(term)}\b", text, flags=re.IGNORECASE):
            found.append(term)
    return found


def _method_name_from_title(title: str) -> str:
    if ":" in title:
        return title.split(":", 1)[0].strip()
    for term in METHOD_TERMS:
        match = re.search(rf"\b([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*)* {term})\b", title)
        if match:
            return match.group(1).strip()
    return title.strip() or "Primary Method"


def _sentences(text: str) -> list[str]:
    normalized = _normalize(text)
    pieces = re.split(r"(?<=[.!?])\s+", normalized)
    sentences = []
    for piece in pieces:
        cleaned = _clean_sentence(piece)
        if 30 <= len(cleaned) <= 500:
            sentences.append(cleaned)
    return sentences


def _clean_sentence(sentence: str) -> str:
    cleaned = sentence.strip()
    cleaned = re.sub(r"^Published as a conference paper at ICLR 2026\s+", "", cleaned)
    return cleaned.strip()


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()
