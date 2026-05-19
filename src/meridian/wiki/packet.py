from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from meridian.wiki.extract import PdfExtraction, PageExtraction
from meridian.wiki.model import PaperModel
from meridian.wiki.sources import SourceRecord


REQUIRED_REVIEW_HEADINGS = [
    "Paper Identity",
    "Problem / Motivation",
    "Core Method",
    "Assumptions",
    "Main Claims",
    "Evidence Notes",
    "Figures / Tables / Equations Notes",
    "Experiments / Datasets / Metrics / Baselines",
    "Limitations",
    "Open Questions",
    "Candidate Wiki Updates",
    "Uncertainty / Gaps",
    "Publish Proposal",
]


def render_review_packet(
    title: str,
    pdf_path: Path,
    extraction: PdfExtraction,
    model: PaperModel,
    case_metadata: dict[str, object] | None = None,
    created_date: str = "1970-01-01",
    source_record: SourceRecord | None = None,
) -> str:
    page_summaries = "\n".join(_render_page_summary(page) for page in extraction.pages)
    section_index = _render_section_index(extraction.pages)
    visual_notes = _render_visual_notes(extraction.pages)
    case_block = _render_case_block(case_metadata)
    source_block = _render_source_block(source_record)
    metadata_authors = _trusted_metadata_authors(extraction)

    frontmatter = _render_frontmatter(
        {
            "type": "ingest_review",
            "title": f"One-Paper Ingest Review Packet: {title}",
            "status": "draft",
            "created": created_date,
            "updated": created_date,
            "source_pdf": str(pdf_path),
            "paper_page": "paper.md",
            "artifacts": [
                "paper.md",
                "claims.jsonl",
                "methods.jsonl",
                "evidence.jsonl",
                "extraction/pages.jsonl",
            ],
            "model_strategy": model.strategy,
            "tags": ["llm-wiki", "paper-ingest", "review-packet"],
            "confidence": "medium" if model.claim_records and model.method_records else "low",
            "write_policy": "review_before_publish",
            "canonical_wiki_mutated": False,
        }
    )
    contributions = _render_contributions(model.key_contributions)
    claims = _render_claim_index(model.claim_records)
    methods = _render_method_index(model.method_records)
    mechanism_facts = _render_mechanism_facts(model.mechanism_facts)
    evidence = _render_evidence_index(model.evidence_records)
    open_questions = "\n".join(f"- {question}" for question in model.open_questions)
    datasets = ", ".join(model.datasets) if model.datasets else "No known dataset names were detected."
    metrics = ", ".join(model.metrics) if model.metrics else "No known metric names were detected."

    return f"""{frontmatter}
# One-Paper Ingest Review Packet: {title}

> Status: draft-only review packet. This file is generated from extraction artifacts and remains separate from confirmed canonical knowledge.

## Paper Identity

- Title: {title}
- Source PDF: `{pdf_path}`
{source_block}
- Page count: {extraction.page_count}
- Metadata title: {extraction.metadata.get("title") or "not provided"}
- Metadata authors: {metadata_authors}
- Model strategy: `{model.strategy}`

{case_block}## Extraction Overview

{section_index}

## Problem / Motivation

{model.retrieval_summary}

## Core Method

The paper should be understandable from the method objects below without rereading the PDF.

{model.method_notes}

Primary method candidates:

{methods}

Mechanism details to verify:

{mechanism_facts}

## Assumptions

{_render_assumptions(model.method_records)}

## Main Claims

{claims}

Key contribution sentences:

{contributions}

## Evidence Notes

{evidence}

Evidence takeaways:

{_render_list(model.evidence_takeaways)}

## Figures / Tables / Equations Notes

{visual_notes}

Visual/math notes are page-level extraction signals, not final semantic interpretations. Pages with high drawing counts or table-like text should be prioritized by the judge or a later multimodal pass.

## Experiments / Datasets / Metrics / Baselines

- Detected datasets: {datasets}
- Detected metrics: {metrics}
- Baselines and fair-comparison caveats require evidence-level review before promotion.

## Limitations

{_render_list(model.limitations)}

## Open Questions

{open_questions}

## Candidate Wiki Updates

- Paper page: `paper.md`
- Claim candidates: `claims.jsonl`
- Method/concept candidates: `methods.jsonl`
- Evidence candidates: `evidence.jsonl`
- Publish scope: draft paper page only until judge convergence or human calibration accepts the packet.

## Uncertainty / Gaps

- Current strategy is `{model.strategy}` and relies on extracted text plus page-level visual signals.
- It does not fully parse formulas, tables, or figure semantics.
- Candidate records preserve provenance and `review_state`; promotion should depend on judge results, human calibration, or a later multimodal pass.

## Publish Proposal

- Proposed action: `draft_publish_when_quality_gate_allows`
- Canonical wiki mutation: draft paper page only
- Required before stronger promotion:
  - Judge or human confirms source fidelity and provenance.
  - Important figures, tables, and equations are semantically checked.
  - Durable claims and method concepts are selected for standalone wiki pages.

## Page-Level Extraction Notes

{page_summaries}
"""


def render_paper_draft(
    title: str,
    pdf_path: Path,
    extraction: PdfExtraction,
    model: PaperModel,
    created_date: str,
    source_record: SourceRecord | None = None,
) -> str:
    frontmatter = _render_frontmatter(
        {
            "type": "paper",
            "title": title,
            "status": "draft",
            "created": created_date,
            "updated": created_date,
            "aliases": _paper_aliases(title, model),
            "source_pdf": str(pdf_path),
            "source_id": source_record.source_id if source_record else None,
            "source_registry": str(source_record.registry_path) if source_record else None,
            "sources": [str(pdf_path)],
            "page_count": extraction.page_count,
            "model_strategy": model.strategy,
            "tags": ["llm-wiki", "paper", "paper-ingest"],
            "topics": model.topics,
            "methods": model.methods,
            "settings": model.settings,
            "models": [],
            "datasets": model.datasets,
            "metrics": model.metrics,
            "claims": [record["id"] for record in model.claim_records],
            "related": [],
            "confidence": "medium" if model.claim_records and model.method_records else "low",
            "review_state": "needs_review",
            "write_policy": "review_before_publish",
            "canonical_wiki_mutated": False,
            "artifacts": ["review.md", "claims.jsonl", "methods.jsonl", "evidence.jsonl", "extraction/pages.jsonl"],
        }
    )
    claims = _render_claim_index(model.claim_records)
    methods = _render_method_index(model.method_records)
    mechanism_facts = _render_mechanism_facts(model.mechanism_facts)
    open_questions = "\n".join(f"- {question}" for question in model.open_questions)
    source_block = _render_source_block(source_record)
    metadata_authors = _trusted_metadata_authors(extraction)
    retrieval_notes = _render_retrieval_notes(model)
    visual_pointers = _render_visual_pointers(extraction.pages)
    record_pointers = _render_record_pointers()
    mechanism_contracts = _render_mechanism_contracts(model.method_records)

    return f"""{frontmatter}
# {title}

> Retrieval-ready draft generated by `meridian wiki ingest`. Treat claims and method objects as candidates until judge convergence or human calibration.

## What To Remember

{model.one_line_takeaway}

## Retrieval Notes

{retrieval_notes}

Source:

- PDF: `{pdf_path}`
{source_block}
- Page count: {extraction.page_count}
- Metadata title: {extraction.metadata.get("title") or "not provided"}
- Metadata authors: {metadata_authors}
- Model strategy: `{model.strategy}`

## Paper Positioning

{model.retrieval_summary}

## Mechanism

{mechanism_contracts}

## Mechanism Details To Verify

{mechanism_facts}

## Evidence Map

Evidence takeaways:

{_render_list(model.evidence_takeaways)}

Claim candidates:

{claims}

Visual/table/equation pointers:

{visual_pointers}

## Implementation Hooks

{_render_list(model.implementation_notes)}

## Limitations / Uncertainty

{_render_list(model.limitations)}

Open questions:

{open_questions}

## Candidate Records

{record_pointers}

Method candidates:

{methods}

Evidence candidates:

{_render_evidence_index(model.evidence_records)}

Full extraction and review details live in `review.md`, `extraction/pages.jsonl`, and page images. Keep this page concise enough to be a future retrieval target.
"""


def _render_case_block(case_metadata: dict[str, object] | None) -> str:
    if not case_metadata:
        return ""
    return (
        "## Evaluation Case\n\n"
        f"- Case ID: {case_metadata.get('id')}\n"
        f"- Category: {case_metadata.get('category')}\n"
        f"- Problem: {case_metadata.get('problem_description')}\n"
        f"- Expected result: {case_metadata.get('expected_result')}\n\n"
    )


def _render_source_block(source_record: SourceRecord | None) -> str:
    if source_record is None:
        return "- Source management: `unmanaged_input_path`"
    return (
        f"- Source ID: `{source_record.source_id}`\n"
        f"- Source registry: `{source_record.registry_path}`\n"
        f"- Original input PDF: `{source_record.original_path}`"
    )


def _render_list(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items) if items else "- None extracted."


def _render_assumptions(records: list[dict[str, Any]]) -> str:
    lines = []
    for record in records:
        assumptions = record.get("assumptions") or []
        if not assumptions:
            continue
        lines.append(f"- {record['name']}: " + "; ".join(str(item) for item in assumptions))
    return "\n".join(lines) if lines else "- No implementation-critical assumptions were confidently structured."


def _render_contributions(contributions: list[dict[str, Any]]) -> str:
    if not contributions:
        return "- No explicit contribution sentence was confidently extracted."
    lines = []
    for contribution in contributions:
        provenance = _format_provenance(contribution.get("provenance", []))
        lines.append(f"- {contribution['text']} {provenance}".rstrip())
    return "\n".join(lines)


def _render_claim_index(records: list[dict[str, Any]]) -> str:
    lines = []
    for record in records:
        provenance = _format_provenance(record.get("provenance", []))
        lines.append(f"- `{record['id']}`: {record['claim']} {provenance}".rstrip())
    return "\n".join(lines) if lines else "- No claim candidates extracted."


def _render_method_index(records: list[dict[str, Any]]) -> str:
    lines = []
    for record in records:
        provenance = _format_provenance(record.get("provenance", []))
        inputs = ", ".join(record.get("inputs") or [])
        outputs = ", ".join(record.get("outputs") or [])
        io = ""
        if inputs or outputs:
            io = f" Inputs: {inputs or 'unknown'}. Outputs: {outputs or 'unknown'}."
        lines.append(f"- `{record['id']}`: {record['name']} - {record['summary']}{io} {provenance}".rstrip())
    return "\n".join(lines) if lines else "- No method candidates extracted."


def _render_mechanism_contracts(records: list[dict[str, Any]]) -> str:
    if not records:
        return "- No reliable method mechanism was extracted; inspect the methodology pages before using this paper."
    blocks = []
    for record in records:
        provenance = _format_provenance(record.get("provenance", []))
        inputs = _join_or_unknown(record.get("inputs"), "source objects not confidently extracted")
        outputs = _join_or_unknown(record.get("outputs"), "target representation or behavior not confidently extracted")
        assumptions = _join_or_unknown(record.get("assumptions"), "dependency not confidently extracted")
        checks = _join_or_unknown((record.get("implementation_notes") or [])[:2], "derive a small probe from the cited method pages before implementation")
        blocks.append(
            "\n".join(
                [
                    f"### {record['name']}",
                    "",
                    f"- Purpose: {record['summary']}",
                    f"- Operates on: {inputs}.",
                    f"- Produces: {outputs}.",
                    f"- Depends on: {assumptions}.",
                    f"- First checks: {checks}.",
                    f"- Source: {provenance or 'provenance not confidently extracted.'}",
                ]
            )
        )
    return "\n\n".join(blocks)


def _join_or_unknown(value: object, fallback: str) -> str:
    if isinstance(value, list):
        cleaned = [str(item).strip().rstrip(".") for item in value if str(item).strip()]
        if cleaned:
            return "; ".join(cleaned)
    text = str(value or "").strip().rstrip(".")
    return text if text else fallback


def _render_retrieval_notes(model: PaperModel) -> str:
    lines = ["Frontmatter is the machine-readable retrieval source of truth. Retrieve this page for questions about:"]
    scenarios = []
    if model.settings:
        scenarios.append(f"scope conditions such as {', '.join(model.settings[:3])}")
    if model.methods:
        scenarios.append(f"method-family comparisons involving {', '.join(model.methods[:3])}")
    if model.topics:
        scenarios.append(f"research questions around {', '.join(model.topics[:4])}")
    if model.datasets or model.metrics:
        scenario = "evidence checks"
        if model.datasets:
            scenario += f" on {', '.join(model.datasets[:3])}"
        if model.metrics:
            scenario += f" using {', '.join(model.metrics[:3])}"
        scenarios.append(scenario)
    if not scenarios:
        scenarios.append("the method, evidence, and uncertainty described in the sections below")
    lines.extend(f"- {scenario}." for scenario in scenarios[:4])
    return "\n".join(lines)


def _render_mechanism_facts(records: list[dict[str, Any]]) -> str:
    if not records:
        return "- No equation, algorithm, setting, or hardware-evidence details were extracted."
    lines = []
    for record in records:
        provenance = _format_provenance(record.get("provenance", []))
        fact_type = record.get("fact_type", "mechanism")
        component = record.get("component", "unknown")
        summary = record.get("summary", "")
        lines.append(f"- `{fact_type}` / {component}: {summary} {provenance}".rstrip())
    return "\n".join(lines)


def _render_evidence_index(records: list[dict[str, Any]]) -> str:
    selected = records[:8]
    lines = []
    for record in selected:
        section = f" ({record['section_hint']})" if record.get("section_hint") else ""
        supports = record.get("supports") or []
        suffix = f"; supports: {', '.join(supports)}" if supports else ""
        lines.append(f"- `{record['id']}`: p. {record['page']}{section}{suffix}")
    return "\n".join(lines) if lines else "- No evidence candidates extracted."


def _render_visual_pointers(pages: list[PageExtraction]) -> str:
    candidates = sorted(
        [
            page
            for page in pages
            if page.image_count > 0 or page.drawing_count >= 20 or _page_has_visual_keywords(page)
        ],
        key=lambda page: (-(page.image_count + page.drawing_count), page.page_number),
    )[:6]
    if not candidates:
        return "- No high-signal visual/table/equation pages detected; inspect `review.md` if visual semantics matter."

    lines = []
    for page in sorted(candidates, key=lambda item: item.page_number):
        reason = _visual_pointer_reason(page)
        lines.append(
            f"- p. {page.page_number}: {reason}; page image=`{page.image_path}`"
        )
    return "\n".join(lines)


def _page_has_visual_keywords(page: PageExtraction) -> bool:
    lowered = page.text.lower()
    return any(keyword in lowered for keyword in ("figure ", "table ", "algorithm ", "equation ", "theorem "))


def _visual_pointer_reason(page: PageExtraction) -> str:
    lowered = page.text.lower()
    reasons = []
    for label, keyword in (
        ("figure", "figure "),
        ("table", "table "),
        ("algorithm", "algorithm "),
        ("equation/theorem", "theorem "),
    ):
        if keyword in lowered:
            reasons.append(label)
    if page.image_count:
        reasons.append(f"{page.image_count} image object(s)")
    if page.drawing_count:
        reasons.append(f"{page.drawing_count} drawing object(s)")
    return ", ".join(reasons[:4]) if reasons else "visual/layout signal"


def _render_record_pointers() -> str:
    return "\n".join(
        [
            "- Claims: `claims.jsonl`",
            "- Methods: `methods.jsonl`",
            "- Evidence pages: `evidence.jsonl`",
            "- Review packet: `review.md`",
        ]
    )


def _paper_aliases(title: str, model: PaperModel) -> list[str]:
    aliases: list[str] = []
    if ":" in title:
        aliases.append(title.split(":", 1)[0].strip())
    for record in model.method_records:
        for value in (record.get("short_name"), record.get("name")):
            if value and str(value) not in aliases:
                aliases.append(str(value))
    return aliases[:8]


def _format_provenance(provenance: object) -> str:
    if not isinstance(provenance, list) or not provenance:
        return ""
    refs = []
    for item in provenance:
        if not isinstance(item, dict):
            continue
        page = item.get("page")
        section = item.get("section")
        if page and section:
            refs.append(f"p. {page} / {section}")
        elif page:
            refs.append(f"p. {page}")
    if not refs:
        return ""
    return f"Provenance: {', '.join(refs)}."


def _render_frontmatter(values: dict[str, Any]) -> str:
    lines = ["---"]
    for key, value in values.items():
        lines.extend(_render_yaml_field(key, value))
    lines.append("---")
    return "\n".join(lines)


def _render_yaml_field(key: str, value: Any) -> list[str]:
    if isinstance(value, bool):
        return [f"{key}: {'true' if value else 'false'}"]
    if isinstance(value, int):
        return [f"{key}: {value}"]
    if isinstance(value, list):
        if not value:
            return [f"{key}: []"]
        return [f"{key}:"] + [f"  - {_yaml_scalar(item)}" for item in value]
    if value is None:
        return [f"{key}: null"]
    return [f"{key}: {_yaml_scalar(value)}"]


def _yaml_scalar(value: object) -> str:
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


def _render_section_index(pages: list[PageExtraction]) -> str:
    hints = [f"- p. {page.page_number}: {page.section_hint}" for page in pages if page.section_hint]
    if not hints:
        return "- No section hints detected from first-page text windows. Use page-level extraction notes."
    return "\n".join(hints)


def _render_visual_notes(pages: list[PageExtraction]) -> str:
    candidates = [
        page
        for page in pages
        if page.image_count > 0 or page.drawing_count > 0
    ]
    if not candidates:
        return "No page-level image/drawing signals were detected. Still inspect page images for equations and layout-sensitive content."

    lines = [
        "- p. "
        f"{page.page_number}: image objects={page.image_count}, drawing objects={page.drawing_count}, "
        f"page image=`{page.image_path}`"
        for page in candidates
    ]
    return "\n".join(lines)


def _render_page_summary(page: PageExtraction) -> str:
    preview = " ".join(page.text.split())
    if len(preview) > 900:
        preview = preview[:900].rstrip() + "..."
    if not preview:
        preview = "[no extractable text; inspect page image]"
    section = f" ({page.section_hint})" if page.section_hint else ""
    return (
        f"### p. {page.page_number}{section}\n\n"
        f"- Page image: `{page.image_path}`\n"
        f"- Image objects: {page.image_count}\n"
        f"- Drawing objects: {page.drawing_count}\n"
        f"- Text preview: {preview}\n"
    )


def _trusted_metadata_authors(extraction: PdfExtraction) -> str:
    authors = str(extraction.metadata.get("author") or "").strip()
    if not authors:
        return "not provided"
    first_page = extraction.pages[0].text.lower() if extraction.pages else ""
    first_author = re.split(r"[,;]", authors, maxsplit=1)[0].strip()
    first_author_norm = re.sub(r"[^a-z]+", " ", first_author.lower()).strip()
    page_norm = re.sub(r"[^a-z]+", " ", first_page).strip()
    if first_author_norm and first_author_norm in page_norm:
        return authors
    return f"not trusted (PDF metadata says: {authors})"
