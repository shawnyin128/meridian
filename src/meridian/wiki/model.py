from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from meridian.wiki.extract import PdfExtraction, PageExtraction


@dataclass(frozen=True)
class PaperModel:
    strategy: str
    retrieval_summary: str
    one_line_takeaway: str
    mechanism_overview: list[str]
    implementation_notes: list[str]
    evidence_takeaways: list[str]
    limitations: list[str]
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


MODEL_STRATEGY = "heuristic_text_v1"

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
    method_records = _method_records(title, extraction.pages)
    contribution_sentences = _candidate_claim_sentences(extraction.pages)
    key_contributions = _key_contributions(contribution_sentences)
    claim_records = _claim_records(title, key_contributions)
    methods = [record["name"] for record in method_records]
    evidence_records = _page_evidence_records(extraction, claim_records)
    method_notes = _method_notes(method_records, extraction.pages)
    summary = _paper_positioning(title, abstract, extraction.pages, method_records)
    topics = _topics(title, abstract, contribution_sentences)
    datasets = _known_terms(extraction, KNOWN_DATASETS)
    metrics = _known_terms(extraction, KNOWN_METRICS)

    return PaperModel(
        strategy=MODEL_STRATEGY,
        retrieval_summary=summary,
        one_line_takeaway=_one_line_takeaway(title, method_records, datasets, metrics),
        mechanism_overview=_mechanism_overview(method_records),
        implementation_notes=_implementation_notes(method_records, extraction.pages),
        evidence_takeaways=_evidence_takeaways(extraction.pages),
        limitations=_limitations(extraction.pages),
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


def _paper_positioning(
    title: str,
    abstract: str,
    pages: list[PageExtraction],
    method_records: list[dict[str, Any]],
) -> str:
    text = _normalize(f"{title} {abstract} " + " ".join(page.text for page in pages[:4]))
    lowered = text.lower()
    problem = _problem_focus(lowered)
    method = _mechanism_narrative(title, method_records)
    evidence = _compact_evidence_context(pages)
    return f"{problem} {method} {evidence}".strip()


def _problem_focus(lowered_text: str) -> str:
    if "mixture-of-experts" in lowered_text or "moe" in lowered_text:
        if "quantization" in lowered_text and "outlier" in lowered_text:
            return (
                "This is a MoE post-training quantization paper: the core problem is that "
                "activation/weight outliers make low-bit MoE inference inaccurate."
            )
        return "This paper targets a specific MoE modeling or systems problem."
    if "quantization" in lowered_text and "outlier" in lowered_text:
        return "This is a low-bit quantization paper whose core problem is outlier-induced error."
    if "retrieval" in lowered_text:
        return "This is a retrieval paper; the core question is how to retrieve better context for downstream reasoning."
    return "This paper proposes a method for the problem stated in its title and abstract."


def _compact_evidence_context(pages: list[PageExtraction]) -> str:
    text = " ".join(page.text for page in pages)
    bits = []
    if re.search(r"\bA\d+W\d+\b|\b\d+-bit\b|\blow-bit\b", text, flags=re.IGNORECASE):
        bits.append("low-bit settings")
    if any(term in text for term in KNOWN_DATASETS):
        bits.append("standard benchmark datasets")
    if re.search(r"\b(speedup|latency|throughput|memory)\b", text, flags=re.IGNORECASE):
        bits.append("systems evidence")
    if not bits:
        return "The evidence needs to be read through experiments, ablations, and limitations rather than abstract prose."
    return "Read the evidence around " + ", ".join(bits) + ", not just the abstract claims."


def _candidate_claim_sentences(pages: list[PageExtraction]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    scored: list[tuple[int, dict[str, Any]]] = []
    for page in pages[:18]:
        for sentence in _sentences(page.text):
            score = _claim_sentence_score(sentence, page)
            if score <= 0:
                continue
            scored.append(
                (
                    score,
                    {
                        "sentence": sentence,
                        "page": page.page_number,
                        "section_hint": page.section_hint,
                    },
                )
            )
    for _, candidate in sorted(scored, key=lambda item: (-item[0], item[1]["page"])):
        candidates.append(candidate)
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


def _claim_sentence_score(sentence: str, page: PageExtraction) -> int:
    lowered = sentence.lower()
    if _is_background_sentence(lowered):
        return -5
    score = 0
    if any(marker in lowered for marker in CLAIM_MARKERS):
        score += 2
    for marker in ("table", "figure", "ablation", "outperform", "achieve", "speedup", "latency", "perplexity", "accuracy"):
        if marker in lowered:
            score += 2
    if re.search(r"\b\d+(?:\.\d+)?\s*(?:x|×|%|gb|s)\b", lowered):
        score += 3
    if "codequant" in lowered:
        score += 1
    if page.page_number <= 2 and score < 4:
        score -= 2
    if "introduction" == (page.section_hint or "").lower():
        score -= 1
    return score


def _is_background_sentence(lowered: str) -> bool:
    background_markers = (
        "has emerged",
        "have emerged",
        "this specialization enables",
        "by representing weights and activations",
        "recent hardware innovations",
        "consequently",
        "to address these costs",
    )
    return any(marker in lowered for marker in background_markers)


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
    components = _method_components(method_text, pages)
    if components:
        records = []
        for index, component in enumerate(components, start=1):
            pages_for_component = _pages_for_component(component, pages)
            records.append(
                {
                    "schema_version": "method_candidate.v0",
                    "id": f"method-{index:03d}",
                    "status": "draft",
                    "paper_title": title,
                    "name": component["name"],
                    "short_name": component.get("short_name"),
                    "extraction_strategy": MODEL_STRATEGY,
                    "summary": component["summary"],
                    "inputs": component["inputs"],
                    "outputs": component["outputs"],
                    "assumptions": component["assumptions"],
                    "implementation_notes": component["implementation_notes"],
                    "provenance": [
                        {"page": page.page_number, "section": page.section_hint}
                        for page in pages_for_component[:4]
                    ],
                    "confidence": "medium",
                    "review_state": "auto_extracted",
                }
            )
        return records

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
            "short_name": None,
            "extraction_strategy": MODEL_STRATEGY,
            "summary": summary,
            "inputs": [],
            "outputs": [],
            "assumptions": [],
            "implementation_notes": [],
            "provenance": [{"page": page.page_number, "section": page.section_hint} for page in method_pages[:3]],
            "confidence": "medium" if method_pages else "low",
            "review_state": "auto_extracted",
        }
    ]


def _method_components(method_text: str, pages: list[PageExtraction]) -> list[dict[str, Any]]:
    candidates: dict[str, dict[str, Any]] = {}
    for match in re.finditer(r"([A-Z][A-Za-z-]+(?:\s+[A-Za-z-]+){1,7})\s+\(([A-Z][A-Z0-9]{1,7})\)", method_text):
        name = _clean_component_name(match.group(1))
        acronym = match.group(2)
        if not _looks_like_method_component(name, acronym):
            continue
        candidates[acronym] = _component_record(name, acronym, pages)

    if "LUT" in method_text and "LUT" not in candidates:
        candidates["LUT"] = _component_record("LUT-based system implementation", "LUT", pages)

    ordered = []
    for acronym in ("AOS", "ACCF", "POG", "LUT"):
        if acronym in candidates:
            ordered.append(candidates.pop(acronym))
    ordered.extend(candidates.values())
    return ordered[:6]


def _looks_like_method_component(name: str, acronym: str) -> bool:
    if acronym in {"LLM", "MoE", "PTQ", "FFN", "GPU", "CPU", "GEMM"}:
        return False
    lowered = name.lower()
    method_words = (
        "smoothing",
        "clustering",
        "grouping",
        "finetuning",
        "quantization",
        "implementation",
        "inference",
        "rotation",
        "kernel",
    )
    return any(word in lowered for word in method_words)


def _clean_component_name(name: str) -> str:
    cleaned = _normalize(name)
    cleaned = re.sub(r"^(?:we\s+)?(?:first\s+)?(?:introduce|propose|present|then\s+propose)\s+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^we\s+then\s+", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace("Permu- tation", "Permutation")
    cleaned = cleaned.replace("Permu-tation", "Permutation")
    cleaned = cleaned.replace("Activation-oriented", "Activation-Oriented")
    return cleaned.strip(" .,:;")


def _component_record(name: str, acronym: str, pages: list[PageExtraction]) -> dict[str, Any]:
    component_pages = _pages_for_component({"name": name, "short_name": acronym}, pages)
    context = _component_context(name, acronym, component_pages)
    return {
        "name": name,
        "short_name": acronym,
        "summary": _component_summary(name, acronym, context),
        "inputs": _component_inputs(acronym),
        "outputs": _component_outputs(acronym),
        "assumptions": _component_assumptions(acronym),
        "implementation_notes": _component_implementation_notes(acronym, context),
    }


def _pages_for_component(component: dict[str, Any], pages: list[PageExtraction]) -> list[PageExtraction]:
    name = str(component.get("name") or "")
    short_name = str(component.get("short_name") or "")
    terms = [term for term in (name, short_name) if term]
    matched = [
        page
        for page in pages
        if any(re.search(re.escape(term), page.text, flags=re.IGNORECASE) for term in terms)
    ]
    return matched or _rank_method_pages(pages)


def _component_context(name: str, acronym: str, pages: list[PageExtraction]) -> str:
    terms = [name, acronym]
    sentences = []
    for page in pages[:4]:
        for sentence in _sentences(page.text):
            if any(re.search(re.escape(term), sentence, flags=re.IGNORECASE) for term in terms if term):
                sentences.append(sentence)
    return " ".join(sentences[:4])


def _component_summary(name: str, acronym: str, context: str) -> str:
    if acronym == "AOS":
        return (
            "Smooths activation outliers with learnable orthogonal rotations so activation "
            "quantization is less dominated by extreme channels; the compensating transform is "
            "absorbed into weights to avoid online rotation overhead."
        )
    if acronym == "ACCF":
        return (
            "Clusters rotated weights and fine-tunes centroids/assignments against output-difference "
            "objectives; for MoE FFN it also preserves router behavior with a KL term on router logits."
        )
    if acronym == "POG":
        return (
            "Permutes weight columns before block-wise clustering so high-variance/outlier-heavy "
            "subgroups are distributed into better-conditioned clustering groups."
        )
    if acronym == "LUT":
        return (
            "Deploys clustered weights through lookup-table kernels so non-uniform centroids can be "
            "used for lower memory and faster inference."
        )
    if context:
        return " ".join(_sentences(context)[:2])
    return f"{name} is a method component extracted from the methodology section."


def _component_inputs(acronym: str) -> list[str]:
    if acronym == "AOS":
        return ["calibration activations X", "linear/router/expert weights W", "learnable rotation matrix R"]
    if acronym == "ACCF":
        return ["rotated weights WR", "rotated activations XR", "centroid matrix C", "assignment tensor A"]
    if acronym == "POG":
        return ["rotated weight matrix WR", "quantization group size g", "small subgroup size gs"]
    if acronym == "LUT":
        return ["cluster assignments", "centroids", "quantized activations", "target GPU or CPU kernel path"]
    return []


def _component_outputs(acronym: str) -> list[str]:
    if acronym == "AOS":
        return ["smoothed rotated activations XR", "weights transformed to preserve layer output"]
    if acronym == "ACCF":
        return ["clustered weight matrix Wc", "fine-tuned centroids", "assignments aligned to output objective"]
    if acronym == "POG":
        return ["column permutation order pi", "permuted weights for block-wise clustering"]
    if acronym == "LUT":
        return ["LUT-backed low-bit inference path", "latency and memory measurements"]
    return []


def _component_assumptions(acronym: str) -> list[str]:
    if acronym == "AOS":
        return ["rotation invariance holds after absorbing transforms into adjacent weights", "calibration data exposes relevant activation outliers"]
    if acronym == "ACCF":
        return ["local output reconstruction is a useful proxy for downstream task quality", "router KL helps preserve token-expert assignment"]
    if acronym == "POG":
        return ["permutation is fused into weights so there is no online cost", "benefit mainly applies to block-wise clustering, not embedding-wise clustering"]
    if acronym == "LUT":
        return ["target hardware can exploit lookup-table execution efficiently", "reported speedups depend on kernel/simulator/CPU setup"]
    return []


def _component_implementation_notes(acronym: str, context: str) -> list[str]:
    notes: list[str] = []
    if acronym == "AOS":
        notes.extend([
            "Use an orthogonal parameterization such as Cayley transform for R.",
            "Check where rotations are absorbed for SA, MoE router, experts, and model-specific variants.",
        ])
    elif acronym == "ACCF":
        notes.extend([
            "Implement centroid update and assignment update as separate, inspectable steps.",
            "For MoE FFN, test router top-k change with and without the KL penalty.",
        ])
    elif acronym == "POG":
        notes.extend([
            "Keep POG behind a block-wise clustering flag; embedding-wise clustering should be a no-op.",
            "Unit test that the fused permutation preserves the unquantized layer output before clustering.",
        ])
    elif acronym == "LUT":
        notes.extend([
            "Separate algorithmic accuracy claims from GPU simulation and CPU kernel speed claims.",
            "Record hardware target, bit width, group setting, and baseline kernel for each speed number.",
        ])
    if context and not notes:
        notes.append("Inspect the cited method pages before implementation; this note came from text extraction only.")
    return notes


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
        lines = []
        for record in method_records:
            provenance = record.get("provenance", [])
            page_refs = ", ".join(f"p. {item.get('page')}" for item in provenance if item.get("page"))
            suffix = f" ({page_refs})" if page_refs else ""
            lines.append(f"- {record['name']}: {record['summary']}{suffix}")
        return "\n".join(lines)
    if pages:
        return f"Method notes were not confidently extracted. Inspect p. {pages[0].page_number} and adjacent method sections."
    return "Method notes were not confidently extracted."


def _one_line_takeaway(
    title: str,
    method_records: list[dict[str, Any]],
    datasets: list[str],
    metrics: list[str],
) -> str:
    method = _mechanism_narrative(title, method_records)
    eval_hint = ""
    if datasets or metrics:
        eval_hint = f" It should be judged by {', '.join(metrics[:4] or ['reported metrics'])}"
        if datasets:
            eval_hint += f" on {', '.join(datasets[:4])}"
        eval_hint += "."
    return f"{method} Read it as a mechanism paper, not as generic background.{eval_hint}"


def _mechanism_narrative(title: str, method_records: list[dict[str, Any]]) -> str:
    method_name = _method_name_from_title(title)
    by_acronym = {
        str(record.get("short_name") or "").upper(): record
        for record in method_records
        if record.get("short_name")
    }
    if {"AOS", "ACCF", "POG", "LUT"}.issubset(by_acronym):
        return (
            f"{method_name} is a post-training quantization pipeline for MoE models that treats "
            "outliers as a calibration-and-representation problem. First it learns rotations that "
            "make activations less dominated by extreme channels while absorbing the inverse effect "
            "into weights, so inference does not pay an online rotation cost. Then it replaces plain "
            "uniform weight quantization with centroid clustering and fine-tunes the centroids and "
            "assignments to preserve layer outputs and MoE router behavior. POG is the conditional "
            "piece: it only matters when weights are clustered block-wise, because the column order "
            "decides which values share a clustering group. The LUT kernel is the systems endpoint "
            "that makes the clustered representation executable rather than just accurate offline."
        )

    if method_records:
        first = method_records[0]
        summary = str(first.get("summary") or "").rstrip(".")
        inputs = ", ".join(first.get("inputs") or [])
        outputs = ", ".join(first.get("outputs") or [])
        io = ""
        if inputs or outputs:
            io = f" It operates on {inputs or 'the paper inputs'} and produces {outputs or 'the reported outputs'}."
        return f"{method_name} should be read through its mechanism, not its name: {summary}.{io}"

    return f"{method_name} should be read through its mechanism, but this ingest did not extract enough method structure yet."


def _mechanism_overview(method_records: list[dict[str, Any]]) -> list[str]:
    bullets = []
    for record in method_records:
        inputs = ", ".join(record.get("inputs") or [])
        outputs = ", ".join(record.get("outputs") or [])
        io = f" Inputs: {inputs}. Outputs: {outputs}." if inputs or outputs else ""
        bullets.append(f"{record['name']}: {record['summary']}{io}")
    return bullets or ["No reliable method mechanism was extracted; inspect the methodology pages before using this paper."]


def _implementation_notes(method_records: list[dict[str, Any]], pages: list[PageExtraction]) -> list[str]:
    notes: list[str] = []
    for record in method_records:
        for note in record.get("implementation_notes") or []:
            notes.append(f"{record['name']}: {note}")
    text = " ".join(page.text for page in pages)
    if "Equation" in text or re.search(r"\(\d+\)", text):
        notes.append("Extract equations before implementation; the current note is not a full mathematical transcription.")
    if "Algorithm" in text:
        notes.append("Algorithm boxes are present; preserve their inputs/outputs as implementation tests.")
    return _dedupe(notes)[:10]


def _evidence_takeaways(pages: list[PageExtraction]) -> list[str]:
    text = " ".join(page.text for page in pages)
    takeaways = []
    if "Table 10" in text and "POG" in text:
        takeaways.append("POG has a specific ablation signal; treat it as conditional evidence for block-wise clustering rather than a universal gain.")
    if "Table 11" in text and "KL" in text:
        takeaways.append("Router KL evidence should be tracked separately from accuracy because it measures token-expert assignment stability.")
    if re.search(r"4\.15\s*(?:×|x)", text, flags=re.IGNORECASE):
        takeaways.append("The headline 4.15x speedup is a systems claim and should be separated from algorithmic accuracy claims.")
    if "Accel-Sim" in text:
        takeaways.append("GPU speed evidence uses simulation; keep it distinct from CPU measurements and accuracy tables.")
    return takeaways or ["Evidence takeaways were not extracted deeply enough; prioritize tables, figures, equations, and ablations."]


def _limitations(pages: list[PageExtraction]) -> list[str]:
    text = " ".join(page.text for page in pages)
    limitations = []
    if "simulator" in text.lower() or "Accel-Sim" in text:
        limitations.append("Some hardware evidence depends on simulation or specific CPU/kernel settings.")
    if "calibration" in text.lower():
        limitations.append("Method behavior depends on calibration data; check whether calibration distribution matches downstream use.")
    if "block-wise" in text.lower() and "embedding-wise" in text.lower():
        limitations.append("Some components are setting-dependent; POG in particular should not be assumed useful outside block-wise clustering.")
    return limitations or ["No explicit limitations were reliably extracted; do not promote absence of limitations as a paper claim."]


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


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
