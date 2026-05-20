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
            "source_quality": model.source_quality.get("review_state"),
            "source_quality_reasons": model.source_quality.get("reasons", []),
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
    retrieval_intent = _render_retrieval_intent(model, title)
    visual_pointers = _render_visual_pointers(extraction.pages)
    record_pointers = _render_record_pointers()
    mechanism_contracts = _render_mechanism_contracts(model.method_records)

    return f"""{frontmatter}
# {title}

> Retrieval-ready draft generated by `meridian wiki ingest`. Treat claims and method objects as candidates until judge convergence or human calibration.

## What To Remember

{model.one_line_takeaway}

## When To Retrieve This Paper

{retrieval_intent}

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
        purpose = _mechanism_purpose(record)
        blocks.append(
            "\n".join(
                [
                    f"### {record['name']}",
                    "",
                    f"- Purpose: {purpose}",
                    f"- Operates on: {inputs}.",
                    f"- Produces: {outputs}.",
                    f"- Depends on: {assumptions}.",
                    f"- First checks: {checks}.",
                    f"- Source: {provenance or 'provenance not confidently extracted.'}",
                ]
            )
        )
    return "\n\n".join(blocks)


def _mechanism_purpose(record: dict[str, Any]) -> str:
    inputs = " ".join(str(item) for item in record.get("inputs") or []).lower()
    outputs = " ".join(str(item) for item in record.get("outputs") or []).lower()
    name = str(record.get("name") or "This method")
    if "kv-cache tensors" in inputs or "kv-cache" in outputs:
        return "Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff."
    if "query/key/value tiles" in inputs or "kernel throughput" in outputs:
        return "Schedule attention tiles, memory movement, and precision on the target GPU so attention is faster without changing the intended output."
    if "agent state" in inputs and "verified committed actions" in outputs:
        return "Predict future agent actions with a fast path, then verify, commit, or roll back them against a slower trusted executor."
    if "audio" in inputs and "language" in outputs:
        return "Align audio representations with language-model behavior for task-conditioned audio understanding."
    if "video" in inputs and "latent predictive representations" in outputs:
        return "Learn latent predictive video representations that transfer to downstream perception or planning tasks."
    if "pde residual" in inputs:
        return "Constrain a neural approximator with PDE residual and boundary/initial-condition losses."
    if "cluster count" in inputs and "centroids" in outputs:
        return "Analyze or optimize assignments to centroids under the stated clustering objective and assumptions."
    if "surveyed primary papers" in inputs:
        return "Organize primary papers into a taxonomy and expose gaps or follow-up sources rather than defining one algorithm."
    summary = str(record.get("summary") or "").strip()
    if len(summary) > 260:
        sentences = re.split(r"(?<=[.!?])\s+", summary)
        compact = " ".join(sentence for sentence in sentences[:2] if sentence).strip()
        summary = compact if compact and len(compact) <= 320 else summary[:257].rstrip() + "..."
    return summary or f"Explain the role of {name} in the paper's mechanism."


def _join_or_unknown(value: object, fallback: str) -> str:
    if isinstance(value, list):
        cleaned = [str(item).strip().rstrip(".") for item in value if str(item).strip()]
        if cleaned:
            return "; ".join(cleaned)
    text = str(value or "").strip().rstrip(".")
    return text if text else fallback


def _render_retrieval_intent(model: PaperModel, title: str) -> str:
    if model.source_quality.get("review_state") == "source_text_insufficient":
        return "\n".join(
            [
                "Canonical retrieval fits:",
                '- Query: "Which papers in my library failed ingest because the PDF needs OCR or a cleaner source file?"',
                "  Use because: This page records a source-quality hold, not scientific paper knowledge.",
                '- Query: "Before building a synthesis, show me source-quality holds that need OCR, page-image inspection, or replacement first."',
                "  Use because: The page prevents bad PDF text from becoming false wiki memory.",
                '- Query: "I am cleaning my Zotero library and need files that should be replaced or OCRed before paper analysis."',
                "  Use because: It preserves the managed source path, extraction artifacts, and source-quality reasons.",
                "",
                "Scope notes:",
                "- Primary fit: source cleanup, OCR triage, and ingest failure analysis.",
                "- Adjacent fit: audit of untrusted source artifacts before building a paper wiki synthesis.",
                "- Weak fit: research claims, method comparisons, or evidence synthesis until a readable PDF/OCR pass exists.",
            ]
        )
    method_family = _routing_method_focus(model.methods)
    topic_scope = _routing_topic_focus(model.topics, model.methods)
    topic_verb = "are" if _is_plural_phrase(topic_scope) else "is"
    setting_scope = _routing_setting_focus(model.settings)
    datasets = _human_list(model.datasets[:3], "the reported benchmark datasets")
    metrics = _human_list(model.metrics[:3], "the reported metrics")
    component_names = [
        str(record.get("short_name") or record.get("name"))
        for record in model.method_records[:4]
        if record.get("short_name") or record.get("name")
    ]
    component_focus = _routing_component_focus(component_names, title, method_family, topic_scope)

    examples: list[tuple[str, str]] = [
        (
            f'I want to compare or adapt {method_family} when {topic_scope} {topic_verb} the suspected bottleneck.',
            f"It explains a concrete {method_family} design for {setting_scope}, with assumptions and caveats separated below.",
        )
    ]
    if component_focus:
        examples.append(
            (
                f"I am implementing or modifying {method_family} and need probes, ablations, and sanity checks for {component_focus}.",
                "The Mechanism section turns each named component into inputs, outputs, dependencies, and first checks.",
            )
        )
    if model.datasets or model.metrics:
        examples.append(
            (
                f"I need papers that connect {topic_scope} claims in {method_family} to experimental evidence, {metrics}, and results on {datasets}.",
                f"The Evidence Map connects claims to {metrics} on {datasets}, plus source-page provenance.",
            )
        )
    if model.limitations:
        examples.append(
            (
                f"I have a new idea around {topic_scope} in {setting_scope}; which prior work gives mechanism constraints before I design experiments?",
                "The page keeps scope caveats, uncertainty, and implementation hooks close to the mechanism summary.",
            )
        )

    lowered_methods = " ".join(model.methods).lower()
    lowered_settings = " ".join(model.settings).lower()
    primary_fit = f"{method_family} in {setting_scope}"
    adjacent_fit = f"related work on {topic_scope}, if the setting difference is made explicit"
    weak_fit = "generic quantization surveys or training-time quantization"
    if "post-training quantization" in lowered_methods or "ptq" in lowered_methods:
        weak_fit = "training-time quantization or QAT, unless the query is explicitly comparing against PTQ"
    if "weight-only quantization" in lowered_settings and "weight-activation quantization" not in lowered_settings:
        adjacent_fit = f"{topic_scope} in activation or KV-cache quantization, but only as a contrast to this weight-only setting"
    elif "weight-activation quantization" in lowered_settings:
        adjacent_fit = f"weight-only PTQ comparisons, but only if activation behavior is treated as a setting difference"
    if "lut/kernel setting" in lowered_settings or "hardware-aware quantization" in lowered_methods:
        weak_fit = "systems or kernel claims outside the reported implementation stack unless hardware evidence is rechecked"
    else:
        weak_fit = "deployment speed or kernel claims if the Evidence Map has no direct systems measurement"

    example_lines = []
    for query, reason in examples[:4]:
        example_lines.append(f'- Query: "{query}"')
        example_lines.append(f"  Use because: {reason}")
    return "\n".join(
        [
            "Canonical retrieval fits:",
            *example_lines,
            "",
            "Scope notes:",
            f"- Primary fit: {primary_fit}.",
            f"- Adjacent fit: {adjacent_fit}.",
            f"- Weak fit: {weak_fit}.",
        ]
    )


def _routing_component_focus(component_names: list[str], title: str, method_family: str, topic_scope: str) -> str:
    title_norm = _norm_phrase(title)
    method_norm = _norm_phrase(method_family)
    cleaned: list[str] = []
    for name in component_names:
        item = str(name).strip()
        if not item:
            continue
        item_norm = _norm_phrase(item)
        if not item_norm or item_norm in {"method", "model", "paper"}:
            continue
        if item_norm == title_norm or (len(item_norm) > 8 and item_norm in title_norm):
            continue
        if item_norm == method_norm or (len(item_norm) > 8 and item_norm in method_norm):
            continue
        cleaned.append(item)
    cleaned = _dedupe_preserve(cleaned)
    if cleaned:
        return f"the component contracts around {_human_list(cleaned[:4], 'the core method')}"
    if topic_scope and topic_scope != "the target failure mode":
        return f"{topic_scope} within {method_family}"
    return f"the core {method_family} mechanism"


def _norm_phrase(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _dedupe_preserve(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        key = _norm_phrase(item)
        if key and key not in seen:
            seen.add(key)
            result.append(item)
    return result


def _routing_method_focus(methods: list[str]) -> str:
    lowered = {method.lower(): method for method in methods}
    if "moe quantization" in lowered and "post-training quantization" in lowered:
        return "MoE post-training quantization"
    if "attention kernel optimization" in lowered:
        return "attention kernel optimization"
    if "agent workflow acceleration" in lowered:
        return "agent workflow acceleration"
    if "llm-agent taxonomy" in lowered and "survey synthesis" in lowered:
        return "LLM-agent survey synthesis"
    if "speculative action execution" in lowered:
        return "speculative action execution"
    if "audio-language modeling" in lowered:
        return "audio-language modeling"
    if "video representation learning" in lowered:
        return "video representation learning"
    if "joint embedding predictive learning" in lowered:
        return "joint embedding predictive learning"
    if "kv-cache compression" in lowered:
        return "KV-cache compression"
    if "layer-wise ptq" in lowered:
        return "layer-wise post-training quantization"
    if "rotation-based quantization" in lowered and "post-training quantization" in lowered:
        return "rotation-based post-training quantization"
    if "speculative decoding" in lowered:
        return "speculative decoding"
    if "conditional diffusion" in lowered:
        return "conditional diffusion"
    if "grouped-query attention" in lowered:
        return "grouped-query attention"
    if "long-context inference" in lowered:
        return "long-context inference"
    if "clustering algorithm" in lowered:
        return "clustering algorithm"
    if "vision-language model quantization" in lowered:
        return "vision-language model quantization"
    if "vision-language representation learning" in lowered:
        return "vision-language representation learning"
    if "quantization-aware training" in lowered:
        return "quantization-aware training"
    if "sparse mixture-of-experts" in lowered:
        return "sparse mixture-of-experts"
    if "curve skeleton extraction" in lowered:
        return "curve skeleton extraction"
    if "rope scaling" in lowered:
        return "RoPE scaling"
    return _human_list(methods[:2], "the relevant method family")


def _paper_short_name(title: str) -> str:
    candidate = title.split(":", 1)[0].strip()
    if candidate and len(candidate.split()) <= 4:
        return candidate
    return "this paper"


def _routing_topic_focus(topics: list[str], methods: list[str]) -> str:
    method_keys = {method.lower() for method in methods}
    generic = {"post-training quantization", "low-bit quantization", "moe quantization", "layer-wise ptq"}
    selected = [topic for topic in topics if topic.lower() not in method_keys and topic.lower() not in generic]
    if any(method.lower() in {"agent workflow acceleration", "speculative action execution"} for method in methods):
        selected = [topic for topic in selected if topic.lower() != "speculative decoding"]
    priority = [
        "speculative action execution",
        "agent workflow acceleration",
        "attention kernel scheduling",
        "IO-aware attention",
        "low-precision attention",
        "audio-language modeling",
        "audio encoder alignment",
        "video representation learning",
        "joint embedding predictive learning",
        "KV-cache compression",
        "KV-cache memory",
        "context extrapolation",
        "activation outliers",
        "quantization error",
        "error propagation",
        "expert imbalance",
        "calibration representativeness",
        "expert routing",
        "calibration data selection",
    ]
    selected = sorted(selected, key=lambda item: priority.index(item.lower()) if item.lower() in priority else len(priority))
    return _human_list(selected[:3] or topics[:3], "the target failure mode")


def _routing_setting_focus(settings: list[str]) -> str:
    lowered = {setting.lower() for setting in settings}
    if "speculative decoding setting" in lowered:
        return "speculative decoding inference"
    if "agent workflow setting" in lowered or "speculative action execution setting" in lowered:
        return "agent workflow execution"
    if "agent survey/synthesis setting" in lowered:
        return "agent literature synthesis"
    if "gpu attention-kernel setting" in lowered:
        return "GPU attention-kernel execution"
    if "audio-language setting" in lowered:
        return "audio-language evaluation"
    if "video representation learning setting" in lowered:
        return "video representation learning"
    if "kv-cache compression setting" in lowered:
        return "long-context decoding with compressed KV cache"
    if "3d medical imaging setting" in lowered:
        return "3D medical imaging"
    if "decoder attention setting" in lowered:
        return "decoder attention inference"
    if "long-context inference setting" in lowered:
        return "long-context inference"
    if "clustering theory setting" in lowered:
        return "clustering theory"
    if "vision-language setting" in lowered:
        return "vision-language model evaluation"
    if "quantization-aware training setting" in lowered:
        return "quantization-aware training"
    if "3d geometry setting" in lowered:
        return "3D geometry processing"
    if "decoder inference setting" in lowered:
        return "decoder inference"
    if {"weight-activation quantization", "moe setting", "lut/kernel setting"} <= lowered:
        return "weight-activation MoE deployment with LUT/kernel constraints"
    if {"weight-only quantization", "moe setting"} <= lowered:
        return "weight-only MoE calibration"
    if "weight-only quantization" in lowered:
        return "weight-only quantization"
    if "weight-activation quantization" in lowered:
        return "weight-activation quantization"
    return _human_list(settings[:2], "the reported setting")


def _human_list(items: list[str], fallback: str) -> str:
    cleaned = [str(item).strip().rstrip(".") for item in items if str(item).strip()]
    if not cleaned:
        return fallback
    if len(cleaned) == 1:
        return cleaned[0]
    if len(cleaned) == 2:
        return f"{cleaned[0]} and {cleaned[1]}"
    return f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"


def _is_plural_phrase(text: str) -> bool:
    return "," in text or " and " in text


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
    aliases.extend(_title_specific_aliases(title))
    for record in model.method_records:
        for value in (record.get("short_name"), record.get("name")):
            if value and str(value) not in aliases:
                aliases.append(str(value))
    return aliases[:8]


def _title_specific_aliases(title: str) -> list[str]:
    aliases: list[str] = []
    generic = {
        "LLM",
        "LLMs",
        "KV",
        "CPU",
        "GPU",
        "PTQ",
        "QAT",
        "AI",
        "ML",
        "NLP",
        "VLM",
        "LUT",
        "Post-Training",
        "Quantization-Aware",
        "Outlier-Free",
        "Training-Free",
        "Activation-aware",
        "Weight-Only",
        "Low-Bit",
        "Technical",
        "Report",
        "Survey",
        "A",
        "An",
        "The",
    }
    cleaned_title = re.sub(r"^[A-Z][A-Za-z]+ et al\. - \d{4} - ", "", title)
    for match in re.findall(r"\b[A-Z][A-Za-z0-9]*(?:[-#][A-Za-z0-9]+)?\b", cleaned_title):
        if match in generic:
            continue
        has_method_shape = (
            any(character.isupper() for character in match[1:])
            or match.isupper()
            or "#" in match
            or bool(re.fullmatch(r"[A-Z]+-[A-Z0-9]+", match))
        )
        if has_method_shape:
            aliases.append(match)
    return _dedupe_preserve(aliases)[:4]


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
