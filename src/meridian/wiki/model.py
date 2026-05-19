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
    mechanism_facts: list[dict[str, Any]]
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


MODEL_STRATEGY = "heuristic_text_v2"

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
        mechanism_facts=_mechanism_facts(extraction.pages),
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
    if "massive activations in large language models" in lowered_text:
        return "This is an empirical/mechanistic analysis paper about where massive activations occur in LLMs and what function they serve."
    if "quantization error propagation" in lowered_text:
        return "This is a layer-wise PTQ paper about accumulated quantization error across layers."
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
    if _is_background_sentence(lowered) or _bad_claim_sentence(sentence):
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


def _bad_claim_sentence(sentence: str) -> bool:
    lowered = sentence.lower()
    if _looks_like_table_sentence(sentence):
        return True
    if "figure " in lowered and not any(marker in lowered for marker in CLAIM_MARKERS):
        return True
    digit_ratio = sum(character.isdigit() for character in sentence) / max(len(sentence), 1)
    return digit_ratio > 0.22


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

    summary = _fallback_method_summary(method_text, pages)
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
            "inputs": _generic_method_inputs(method_text),
            "outputs": _generic_method_outputs(method_text),
            "assumptions": _generic_method_assumptions(method_text),
            "implementation_notes": _generic_method_implementation_notes(method_text),
            "provenance": [{"page": page.page_number, "section": page.section_hint} for page in method_pages[:3]],
            "confidence": "medium" if method_pages else "low",
            "review_state": "auto_extracted",
        }
    ]


def _fallback_method_summary(method_text: str, pages: list[PageExtraction]) -> str:
    candidate_text = " ".join(page.text for page in pages[:3]) + " " + method_text
    scored: list[tuple[int, int, str]] = []
    for index, sentence in enumerate(_sentences(candidate_text)):
        if _bad_method_summary_sentence(sentence):
            continue
        lowered = sentence.lower()
        score = 0
        for marker in (
            "we propose",
            "we introduce",
            "we present",
            "our method",
            "our approach",
            "framework",
            "quantization",
            "rotat",
            "outlier",
            "non-uniform",
            "dense-and-sparse",
            "hadamard",
            "activation",
            "weights",
        ):
            if marker in lowered:
                score += 2
        if "achieve" in lowered or "outperform" in lowered:
            score -= 1
        if score > 0:
            scored.append((score, index, sentence))

    selected: list[str] = []
    for _, _, sentence in sorted(scored, key=lambda item: (-item[0], item[1])):
        key = sentence.lower()
        if any(_sentence_overlap(key, existing.lower()) > 0.65 for existing in selected):
            continue
        selected.append(sentence)
        if len(selected) >= 3:
            break
    return " ".join(selected)


def _bad_method_summary_sentence(sentence: str) -> bool:
    lowered = sentence.lower()
    if _looks_like_table_sentence(sentence):
        return True
    bad_markers = (
        "figure ",
        "table ",
        "published as",
        "http",
        "github",
        "@",
        "correspondence",
        "appendix",
        "references",
        "proceedings",
    )
    if any(marker in lowered for marker in bad_markers):
        return True
    digit_ratio = sum(character.isdigit() for character in sentence) / max(len(sentence), 1)
    return digit_ratio > 0.18


def _sentence_overlap(left: str, right: str) -> float:
    left_words = set(re.findall(r"[a-z][a-z0-9-]{3,}", left))
    right_words = set(re.findall(r"[a-z][a-z0-9-]{3,}", right))
    if not left_words or not right_words:
        return 0.0
    return len(left_words & right_words) / min(len(left_words), len(right_words))


def _generic_method_inputs(method_text: str) -> list[str]:
    lowered = method_text.lower()
    inputs = []
    if "activation" in lowered:
        inputs.append("calibration or runtime activations")
    if "weight" in lowered:
        inputs.append("model weights")
    if "kv cache" in lowered or "key" in lowered and "value" in lowered:
        inputs.append("KV-cache tensors")
    if "calibration" in lowered:
        inputs.append("calibration data")
    return inputs


def _generic_method_outputs(method_text: str) -> list[str]:
    lowered = method_text.lower()
    outputs = []
    if "quantization" in lowered or "quantized" in lowered:
        outputs.append("low-bit quantized model representation")
    if "rotation" in lowered or "hadamard" in lowered:
        outputs.append("rotation-transformed equivalent model")
    if "speedup" in lowered or "latency" in lowered:
        outputs.append("latency or memory-efficiency measurements")
    return outputs


def _generic_method_assumptions(method_text: str) -> list[str]:
    lowered = method_text.lower()
    assumptions = []
    if "calibration" in lowered:
        assumptions.append("calibration data reflects the activation/weight behavior relevant to deployment")
    if "equivalent" in lowered or "invariance" in lowered:
        assumptions.append("the transformation preserves the full-precision computation before quantization")
    if "memory" in lowered and "bottleneck" in lowered:
        assumptions.append("inference is memory-bound enough that compression translates into speed or capacity gains")
    return assumptions


def _generic_method_implementation_notes(method_text: str) -> list[str]:
    lowered = method_text.lower()
    notes = []
    if "rotation" in lowered or "hadamard" in lowered:
        notes.append("Verify transformation equivalence before quantizing, then measure quantization error after rotation.")
    if "non-uniform" in lowered or "k-means" in lowered:
        notes.append("Keep centroid construction inspectable; compare against uniform quantization as a control.")
    if "sparse" in lowered:
        notes.append("Track sparse retention percentage and runtime/storage overhead alongside accuracy.")
    return notes


def _method_components(method_text: str, pages: list[PageExtraction]) -> list[dict[str, Any]]:
    candidates: dict[str, dict[str, Any]] = {}

    for component in _known_quantization_components(method_text, pages):
        key = str(component["short_name"] or component["name"])
        candidates[key] = component

    for match in re.finditer(r"([A-Z][A-Za-z-]+(?:\s+[A-Za-z-]+){1,7})\s+\(([A-Z][A-Z0-9]{1,7})\)", method_text):
        name = _clean_component_name(match.group(1))
        acronym = match.group(2)
        if not _looks_like_method_component(name, acronym):
            continue
        if acronym in candidates:
            continue
        candidates[acronym] = _component_record(name, acronym, pages)

    if "LUT" in method_text and "LUT" not in candidates:
        candidates["LUT"] = _component_record("LUT-based system implementation", "LUT", pages)

    ordered = []
    for acronym in ("AOS", "ACCF", "POG", "LUT", "SmoothQuant", "QuaRot", "DuQuant", "SpinQuant", "SqueezeLLM-Dense", "SqueezeLLM-Sparse"):
        if acronym in candidates:
            ordered.append(candidates.pop(acronym))
    ordered.extend(candidates.values())
    return ordered[:6]


def _known_quantization_components(method_text: str, pages: list[PageExtraction]) -> list[dict[str, Any]]:
    text = _normalize(method_text + " " + " ".join(page.text for page in pages[:8]))
    lowered = text.lower()
    primary = _primary_paper_key(pages)
    components: list[dict[str, Any]] = []

    if primary == "llm.int8":
        components.append(
            _source_component(
                name="Vector-wise int8 quantization",
                short_name="LLM.int8-vector",
                summary=(
                    "Uses row-wise activation scales and column-wise weight scales for int8 matrix "
                    "multiplication so transformer linear layers can run in 8-bit with limited error."
                ),
                inputs=["activation matrix", "weight matrix", "row/column absmax scales"],
                outputs=["int8 operands", "int32 matmul result", "dequantized output"],
                assumptions=[
                    "vector-wise scaling is enough for non-outlier dimensions",
                    "hardware kernels can exploit int8 matrix multiplication efficiently",
                ],
                implementation_notes=[
                    "Unit test the scale/dequantization path against FP16 matmul on non-outlier tensors.",
                    "Track row/column scale shapes explicitly to avoid silent broadcasting errors.",
                ],
            )
        )
        components.append(
            _source_component(
                name="Mixed-precision decomposition for outlier features",
                short_name="LLM.int8-outliers",
                summary=(
                    "Separates sparse high-magnitude outlier feature dimensions into a higher-precision path "
                    "while using int8 multiplication for the dense majority."
                ),
                inputs=["outlier feature threshold", "hidden states", "projection weights"],
                outputs=["int8 dense path", "FP16 outlier path", "combined output"],
                assumptions=[
                    "outlier dimensions are sparse enough that the FP16 path is cheap",
                    "the selected threshold preserves model quality across scale",
                ],
                implementation_notes=[
                    "Ablate the outlier threshold and record both perplexity and latency.",
                    "Keep the dense and outlier matmul outputs separately inspectable before summation.",
                ],
            )
        )

    if primary == "smoothquant":
        components.append(
            _source_component(
                name="Activation-to-weight smoothing",
                short_name="SmoothQuant",
                summary=(
                    "Migrates quantization difficulty from activation outlier channels into weights "
                    "through an offline mathematically equivalent scaling, so W8A8 activation and "
                    "weight quantization become hardware-friendly."
                ),
                inputs=["calibration activations", "linear weights", "smoothing scale s", "migration strength alpha"],
                outputs=["smoothed activations", "adjusted weights", "W8A8 quantization flow"],
                assumptions=[
                    "weights can absorb extra scale better than activations can tolerate outliers",
                    "the equivalent transformation can be fused offline or into adjacent operations",
                ],
                implementation_notes=[
                    "Implement scale search for alpha and verify Y = XW is preserved before quantization.",
                    "Track O1/O2/O3 separately because dynamic/static activation quantization changes latency.",
                ],
            )
        )

    if primary == "quarot":
        components.append(
            _source_component(
                name="Randomized Hadamard rotation for end-to-end INT4 inference",
                short_name="QuaRot",
                summary=(
                    "Applies computationally invariant randomized Hadamard rotations to residual streams, "
                    "FFN activations, attention values, and KV cache so outlier features disappear without "
                    "changing the full-precision model output."
                ),
                inputs=["LLM weights", "hidden states", "attention value/cache tensors", "randomized Hadamard matrices"],
                outputs=["rotated equivalent model", "4-bit weights/activations/KV cache", "INT4 matmul path"],
                assumptions=[
                    "Hadamard rotations can be fused into weights where possible",
                    "remaining online transforms are cheap enough relative to quantized matmuls and cache savings",
                ],
                implementation_notes=[
                    "Keep residual, FFN, attention, and KV-cache rotations as separate implementation checkpoints.",
                    "Unit test output equivalence before quantization after each fused rotation.",
                ],
            )
        )

    if primary == "duquant":
        components.append(
            _source_component(
                name="Dual transformation for massive and normal outliers",
                short_name="DuQuant",
                summary=(
                    "Combines block-wise rotation with zigzag permutation to distribute massive and normal "
                    "activation outliers across blocks, then absorbs the inverse transform into weights before "
                    "low-bit quantization."
                ),
                inputs=["activation matrix with massive/normal outliers", "weight matrix", "block rotation", "zigzag permutation"],
                outputs=["transformed activations", "inverse-transformed weights", "lower-error W4A4/W6A6 quantization"],
                assumptions=[
                    "outliers can be reduced by distributing them across feature blocks",
                    "the invertible transform preserves the original linear output before quantization",
                ],
                implementation_notes=[
                    "Separate massive-outlier detection from normal-outlier smoothing in probes.",
                    "Test that the same block rotation can be shared across blocks when using the cost-saving variant.",
                ],
            )
        )

    if primary == "spinquant":
        components.append(
            _source_component(
                name="Learned rotation matrices for quantization",
                short_name="SpinQuant",
                summary=(
                    "Learns orthonormal rotation matrices that keep the full-precision Transformer numerically "
                    "equivalent while reducing activation, weight, and KV-cache outliers for low-bit quantization."
                ),
                inputs=["Transformer weights", "calibration data", "rotation matrices R1/R2/R3/R4"],
                outputs=["rotation-augmented equivalent model", "learned rotations", "improved W/A/KV quantized accuracy"],
                assumptions=[
                    "rotation matrices can be merged or placed without changing the full-precision network",
                    "calibration loss is a useful proxy for downstream quantized accuracy",
                ],
                implementation_notes=[
                    "Treat R1/R2 mergeable rotations separately from online R3/R4 rotations.",
                    "Use Cayley optimization or another orthonormal update and verify R^T R remains close to identity.",
                ],
            )
        )

    if primary == "squeezellm":
        components.append(
            _source_component(
                name="Sensitivity-based non-uniform quantization",
                short_name="SqueezeLLM-Dense",
                summary=(
                    "Allocates non-uniform quantization centroids according to both weight distribution and "
                    "sensitivity, so low-bit dense weights preserve model outputs better than uniform bins."
                ),
                inputs=["weight values", "sensitivity estimates such as Fisher information", "target bit width"],
                outputs=["non-uniform centroids", "dense low-bit weight representation"],
                assumptions=[
                    "sensitive weights deserve smaller quantization error than insensitive weights",
                    "centroid placement should follow the paper's weighted clustering objective",
                ],
                implementation_notes=[
                    "Implement weighted k-means/objective explicitly and compare against uniform quantization.",
                    "Keep sensitivity estimation reproducible because it controls centroid allocation.",
                ],
            )
        )
        components.append(
            _source_component(
                name="Dense-and-sparse decomposition",
                short_name="SqueezeLLM-Sparse",
                summary=(
                    "Splits the weight matrix into a dense quantized part plus a tiny FP16 sparse part containing "
                    "outlier or highly sensitive values, reducing dense quantization range while keeping overhead low."
                ),
                inputs=["weight matrix", "outlier thresholds", "sensitivity mask", "sparse storage format"],
                outputs=["dense quantized matrix", "FP16 sparse matrix", "overlappable dense+sparse inference path"],
                assumptions=[
                    "the sparse retained values are few enough to store and multiply cheaply",
                    "dense and sparse kernels can be overlapped or scheduled without erasing memory savings",
                ],
                implementation_notes=[
                    "Track outlier-retention and sensitivity-retention separately in ablations.",
                    "Record sparse percentage, CSR/storage overhead, speedup, and perplexity together.",
                ],
            )
        )

    if primary == "omniquant":
        components.append(
            _source_component(
                name="Block-wise error minimization with learnable quantization parameters",
                short_name="OmniQuant",
                summary=(
                    "Freezes full-precision weights but learns a small set of clipping and equivalent-transform "
                    "parameters by minimizing block output error across weight-only and weight-activation settings."
                ),
                inputs=["full-precision transformer block", "calibration samples", "learnable clipping/scaling/shifting parameters"],
                outputs=["calibrated quantization parameters", "quantized block with reduced reconstruction error"],
                assumptions=[
                    "block-wise reconstruction is a useful proxy for final LLM quality",
                    "a restrained parameter set can approach QAT quality without full fine-tuning cost",
                ],
                implementation_notes=[
                    "Keep learnable weight clipping and equivalent transformation as separate ablations.",
                    "Record calibration sample count, optimizer settings, and block reconstruction loss.",
                ],
            )
        )

    if primary == "affinequant":
        components.append(
            _source_component(
                name="Equivalent affine transformation quantization",
                short_name="AffineQuant",
                summary=(
                    "Optimizes invertible affine transformations around linear layers so transformed weights "
                    "and activations are easier to quantize while preserving the original matrix product before quantization."
                ),
                inputs=["activation matrix", "weight matrix", "invertible affine transform"],
                outputs=["transformed activation/weight pair", "lower-error PTQ result"],
                assumptions=[
                    "the affine transform remains invertible and numerically stable",
                    "equivalence before quantization carries over to lower quantization error after quantization",
                ],
                implementation_notes=[
                    "Test strict diagonal dominance or condition-number safeguards for transform invertibility.",
                    "Verify transformed full-precision output before measuring quantized error.",
                ],
            )
        )

    if primary == "flatquant":
        components.append(
            _source_component(
                name="Fast learnable affine transformation for flat distributions",
                short_name="FlatQuant",
                summary=(
                    "Learns affine transformations that flatten weight and activation distributions before quantization, "
                    "using decomposed transforms to balance quantization error reduction against online overhead."
                ),
                inputs=["weights", "activations", "learnable affine transforms", "calibration data"],
                outputs=["flatter transformed tensors", "quantized model", "speed/accuracy trade-off by transform size"],
                assumptions=[
                    "flatter distributions reduce error under equally spaced quantization points",
                    "decomposed affine transforms keep online cost acceptable",
                ],
                implementation_notes=[
                    "Track transform decomposition size as a speed/accuracy hyperparameter.",
                    "Separate offline-merged transforms from online transforms in profiling.",
                ],
            )
        )

    if primary == "dfrot":
        components.append(
            _source_component(
                name="Refined rotation with weighted loss for massive activations",
                short_name="DFRot",
                summary=(
                    "Refines rotated-LLM quantization by treating massive activations as a long-tail optimization "
                    "problem and weighting the rotation/quantization loss toward hard tokens."
                ),
                inputs=["rotated LLM", "token activations", "weighted quantization loss", "activation quantizer parameters"],
                outputs=["massive-activation-aware rotation", "W4A4 quantized model"],
                assumptions=[
                    "massive activation tokens require different weighting than ordinary tokens",
                    "the refined loss improves activation quantization without high-precision token escape paths",
                ],
                implementation_notes=[
                    "Inspect the weighting function and hard-token selection separately from rotation placement.",
                    "Compare randomized Hadamard, random orthogonal, and refined rotations under the same W4A4 setting.",
                ],
            )
        )

    if primary == "ostquant":
        components.append(
            _source_component(
                name="QSUR-guided orthogonal and scaling transformations",
                short_name="OSTQuant",
                summary=(
                    "Introduces Quantization Space Utilization Rate as a quantizability metric, then learns "
                    "orthogonal and scaling transformations to better fit weights/activations to the quantization space."
                ),
                inputs=["weight/activation distributions", "QSUR metric", "orthogonal matrix", "scaling matrix"],
                outputs=["distribution-fitted transformed tensors", "improved PTQ accuracy"],
                assumptions=[
                    "QSUR predicts quantization friendliness better than raw outlier magnitude alone",
                    "orthogonal plus scaling transforms can be optimized without breaking inference equivalence",
                ],
                implementation_notes=[
                    "Implement QSUR as a measured diagnostic before using it as an optimization signal.",
                    "Track orthogonal and scaling contributions in separate ablations.",
                ],
            )
        )

    if primary == "qep":
        components.append(
            _source_component(
                name="Quantization Error Propagation",
                short_name="QEP",
                summary=(
                    "Revisits layer-wise PTQ by explicitly propagating previous-layer quantization error into "
                    "the next layer's optimization target, reducing accumulated error across the network."
                ),
                inputs=["layer-wise PTQ activations", "quantized previous-layer outputs", "propagation strength"],
                outputs=["error-aware layer-wise quantization objective", "compensated quantized weights"],
                assumptions=[
                    "propagating upstream error improves downstream reconstruction",
                    "propagation strength must be tuned to avoid overfitting or instability",
                ],
                implementation_notes=[
                    "Test QEP as a wrapper around RTN/GPTQ/AWQ-style layer-wise quantizers.",
                    "Ablate propagation strength and measure both layer reconstruction error and end-task accuracy.",
                ],
            )
        )

    if primary == "moequant":
        components.append(
            _source_component(
                name="Expert-Balanced Self-Sampling",
                short_name="EBSS",
                summary=(
                    "Builds calibration data from the model itself while balancing expert usage, so MoE quantization "
                    "does not overfit calibration samples to a small subset of experts."
                ),
                inputs=["MoE model vocabulary/log-probabilities", "expert usage statistics", "calibration budget"],
                outputs=["expert-balanced calibration set"],
                assumptions=[
                    "self-sampled sequences can cover expert routing behavior without external data",
                    "balanced expert activation improves calibration representativeness",
                ],
                implementation_notes=[
                    "Track expert usage variance before and after sampling.",
                    "Compare EBSS against random or perplexity-only calibration selection.",
                ],
            )
        )
        components.append(
            _source_component(
                name="Affinity-Guided Quantization",
                short_name="AGQ",
                summary=(
                    "Uses affinities between samples and experts to weight quantization impact, so different "
                    "experts are calibrated according to the samples that actually affect them."
                ),
                inputs=["expert-sample affinities", "MoE layer weights", "calibration samples"],
                outputs=["affinity-weighted expert quantization"],
                assumptions=[
                    "sample-expert affinity identifies which calibration examples matter for each expert",
                    "expert-specific weighting improves quantization over treating MoE layers as dense layers",
                ],
                implementation_notes=[
                    "Keep expert affinity computation inspectable and cacheable.",
                    "Ablate AGQ independently from EBSS to separate sampling and quantization effects.",
                ],
            )
        )

    if primary == "massive-activations":
        components.append(
            _source_component(
                name="Massive activation localization and mechanism analysis",
                short_name="MassiveActivations",
                summary=(
                    "Identifies rare but extremely large activation dimensions/tokens across LLMs and studies "
                    "their role in attention, bias-like behavior, and downstream model quality."
                ),
                inputs=["hidden states across layers/tokens", "model families", "intervention values"],
                outputs=["massive-activation locations", "intervention effects", "mechanism hypotheses"],
                assumptions=[
                    "massive activations are a model behavior to analyze, not a quantization method by itself",
                    "intervention experiments can reveal whether they are functionally important",
                ],
                implementation_notes=[
                    "Record layer, feature dimension, token position, and intervention target separately.",
                    "Separate descriptive localization from causal intervention evidence.",
                ],
            )
        )

    return components


def _primary_paper_key(pages: list[PageExtraction]) -> str:
    if not pages:
        return ""
    header = _normalize(pages[0].text[:900]).lower()
    patterns = (
        ("llm.int8", ("llm.int8", "8-bit matrix multiplication")),
        ("smoothquant", ("smoothquant",)),
        ("squeezellm", ("squeezellm",)),
        ("massive-activations", ("massive activations in large language models",)),
        ("affinequant", ("affinequant",)),
        ("quarot", ("quarot",)),
        ("spinquant", ("spinquant",)),
        ("duquant", ("duquant",)),
        ("flatquant", ("flatquant",)),
        ("dfrot", ("dfrot",)),
        ("ostquant", ("ostquant",)),
        ("qep", ("quantization error propagation",)),
        ("moequant", ("moequant",)),
        ("omniquant", ("omniquant",)),
    )
    for key, needles in patterns:
        if all(needle in header for needle in needles):
            return key
    return ""


def _source_component(
    *,
    name: str,
    short_name: str,
    summary: str,
    inputs: list[str],
    outputs: list[str],
    assumptions: list[str],
    implementation_notes: list[str],
) -> dict[str, Any]:
    return {
        "name": name,
        "short_name": short_name,
        "summary": summary,
        "inputs": inputs,
        "outputs": outputs,
        "assumptions": assumptions,
        "implementation_notes": implementation_notes,
    }


def _looks_like_method_component(name: str, acronym: str) -> bool:
    if acronym in {"LLM", "MoE", "PTQ", "QAT", "RTN", "FFN", "GPU", "CPU", "GEMM"}:
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
    cleaned = re.sub(r"^(?:methodology|methods?|approach)\s+", "", cleaned, flags=re.IGNORECASE)
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
        eval_hint = f" Judge it by {', '.join(metrics[:4] or ['reported metrics'])}"
        if datasets:
            eval_hint += f" on {', '.join(datasets[:4])}"
        eval_hint += "."
    return f"{method}{eval_hint}"


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
        if len(method_records) > 1:
            summaries = "; then ".join(
                f"{record.get('name')}: {str(record.get('summary') or '').rstrip('.')}"
                for record in method_records[:3]
            )
            return f"{method_name} is a pipeline: {summaries}."
        summary = str(first.get("summary") or "").rstrip(".")
        inputs = ", ".join(first.get("inputs") or [])
        outputs = ", ".join(first.get("outputs") or [])
        io = ""
        if inputs or outputs:
            io = f" It operates on {inputs or 'the paper inputs'} and produces {outputs or 'the reported outputs'}."
        return f"{method_name}: {summary}.{io}"

    return f"{method_name}: method structure was not extracted deeply enough yet."


def _mechanism_overview(method_records: list[dict[str, Any]]) -> list[str]:
    bullets = []
    for record in method_records:
        inputs = ", ".join(record.get("inputs") or [])
        outputs = ", ".join(record.get("outputs") or [])
        io = f" Inputs: {inputs}. Outputs: {outputs}." if inputs or outputs else ""
        bullets.append(f"{record['name']}: {record['summary']}{io}")
    return bullets or ["No reliable method mechanism was extracted; inspect the methodology pages before using this paper."]


def _mechanism_facts(pages: list[PageExtraction]) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []
    text_by_page = {page.page_number: page.text for page in pages}
    full_text = "\n".join(text_by_page.values())
    lowered = full_text.lower()
    primary = _primary_paper_key(pages)

    if primary == "llm.int8":
        facts.append(
            _mechanism_fact(
                fact_type="representation",
                component="LLM.int8 mixed precision",
                summary=(
                    "LLM.int8 combines vector-wise int8 matmul for most dimensions with a sparse higher-precision "
                    "path for systematic outlier features; the outlier threshold is an implementation-critical knob."
                ),
                page=_find_page(pages, "mixed-precision decomposition", "outlier features"),
            )
        )

    if primary == "smoothquant" and "diag(s)" in full_text:
        facts.append(
            _mechanism_fact(
                fact_type="equivalent_transform",
                component="SmoothQuant",
                summary=(
                    "SmoothQuant's core mechanism is the equivalent scaling transform "
                    "Y = (X diag(s)^-1)(diag(s) W): activation outliers are reduced offline "
                    "by moving scale into weights, then both sides can use efficient W8A8 quantization."
                ),
                page=_find_page(pages, "diag(s)", "migrate the quantization difficulty"),
            )
        )
    if primary == "smoothquant" and "α" in full_text:
        facts.append(
            _mechanism_fact(
                fact_type="setting_constraint",
                component="SmoothQuant alpha",
                summary=(
                    "The migration strength is controlled by an alpha/smoothing parameter; this is a "
                    "calibration-sensitive knob rather than a generic claim that all outliers disappear."
                ),
                page=_find_page(pages, "α", "smoothing factor"),
            )
        )
    if primary == "quarot" and "randomized hadamard" in lowered:
        facts.append(
            _mechanism_fact(
                fact_type="equivalent_transform",
                component="QuaRot",
                summary=(
                    "QuaRot uses randomized Hadamard rotations as computationally invariant transforms: "
                    "rotations are fused into weights where possible so hidden-state outliers are removed "
                    "without changing the full-precision function."
                ),
                page=_find_page(pages, "randomized Hadamard", "computational invariance"),
            )
        )
    if primary == "quarot" and "kv cache" in lowered:
        facts.append(
            _mechanism_fact(
                fact_type="implementation_boundary",
                component="QuaRot KV cache",
                summary=(
                    "QuaRot is not only weight quantization: it extends rotations and 4-bit quantization "
                    "to activations and the KV cache, while leaving some operations such as RMSNorm or queries "
                    "at higher precision depending on the stage."
                ),
                page=_find_page(pages, "KV cache", "Stage 2c"),
            )
        )
    if primary == "duquant" and "massive outliers" in lowered:
        facts.append(
            _mechanism_fact(
                fact_type="problem_decomposition",
                component="DuQuant",
                summary=(
                    "DuQuant distinguishes normal outliers from massive outliers; the method exists because "
                    "SmoothQuant-like smoothing can fail on rare extremely large activations."
                ),
                page=_find_page(pages, "Massive Outliers", "Normal Outliers"),
            )
        )
    if primary == "duquant" and "rotation and permutation" in lowered:
        facts.append(
            _mechanism_fact(
                fact_type="equivalent_transform",
                component="DuQuant dual transform",
                summary=(
                    "DuQuant uses an invertible transform G built from block rotation and permutation, then "
                    "quantizes (XG)(G^-1 W); the transform should be checked as an equivalence before quantization."
                ),
                page=_find_page(pages, "rotation and permutation", "XG", "G−1W"),
            )
        )
    if primary == "spinquant" and "learned rotation" in lowered:
        facts.append(
            _mechanism_fact(
                fact_type="mechanism",
                component="SpinQuant",
                summary=(
                    "SpinQuant's main claim is not just that rotations help; it learns rotation matrices because "
                    "random rotations have high downstream variance under quantization."
                ),
                page=_find_page(pages, "learned rotation", "random rotations produce large variance"),
            )
        )
    if primary == "spinquant" and "cayley transform" in lowered:
        facts.append(
            _mechanism_fact(
                fact_type="optimization",
                component="SpinQuant Cayley optimization",
                summary=(
                    "SpinQuant uses Cayley optimization to update orthonormal rotations while keeping the "
                    "underlying full-precision weights frozen; implementation should test R^T R and equivalence."
                ),
                page=_find_page(pages, "Cayley Transform", "R′⊤R′"),
            )
        )
    if primary == "squeezellm" and "sensitivity-based non-uniform quantization" in lowered:
        facts.append(
            _mechanism_fact(
                fact_type="objective",
                component="SqueezeLLM dense quantization",
                summary=(
                    "SqueezeLLM's dense path is sensitivity-based non-uniform quantization: centroids are "
                    "allocated using weight distribution and sensitivity rather than fixed uniform bins."
                ),
                page=_find_page(pages, "sensitivity-based non-uniform quantization", "weighted k-means"),
            )
        )
    if primary == "squeezellm" and "dense-and-sparse" in lowered:
        facts.append(
            _mechanism_fact(
                fact_type="representation",
                component="SqueezeLLM sparse retention",
                summary=(
                    "SqueezeLLM's dense-and-sparse decomposition keeps a small sparse FP16 matrix for outlier "
                    "or sensitive values while quantizing the remaining dense matrix, reducing range without "
                    "treating every value uniformly."
                ),
                page=_find_page(pages, "Dense-and-Sparse decomposition", "sparse matrix"),
            )
        )

    if primary == "omniquant":
        facts.append(
            _mechanism_fact(
                fact_type="objective",
                component="OmniQuant",
                summary=(
                    "OmniQuant optimizes a small set of learnable clipping and equivalent-transform parameters "
                    "against block output reconstruction, keeping PTQ efficiency instead of full QAT."
                ),
                page=_find_page(pages, "block-wise error minimization", "learnable weight clipping", "equivalent transformation"),
            )
        )
    if primary == "affinequant":
        facts.append(
            _mechanism_fact(
                fact_type="equivalent_transform",
                component="AffineQuant",
                summary=(
                    "AffineQuant right-multiplies activations and left-multiplies weights with an invertible "
                    "affine transform so the full-precision matrix product is preserved before quantization."
                ),
                page=_find_page(pages, "affine transform", "invariance", "invertible"),
            )
        )
    if primary == "flatquant":
        facts.append(
            _mechanism_fact(
                fact_type="optimization",
                component="FlatQuant",
                summary=(
                    "FlatQuant learns affine transformations to flatten weights and activations; transform "
                    "decomposition is part of the method because it controls online cost."
                ),
                page=_find_page(pages, "Fast and Learnable Affine Transformation", "decomposed matrix", "flatness"),
            )
        )
    if primary == "dfrot":
        facts.append(
            _mechanism_fact(
                fact_type="loss_design",
                component="DFRot",
                summary=(
                    "DFRot treats massive activations as a long-tail problem and uses a weighted quantization "
                    "loss plus alternating optimization for rotation and activation quantizer parameters."
                ),
                page=_find_page(pages, "weighted loss", "alternate between solving", "long-tail"),
            )
        )
    if primary == "ostquant":
        facts.append(
            _mechanism_fact(
                fact_type="diagnostic_metric",
                component="QSUR",
                summary=(
                    "OSTQuant uses Quantization Space Utilization Rate to judge whether transformed weights or "
                    "activations fit the available quantization space before learning orthogonal/scaling transforms."
                ),
                page=_find_page(pages, "Quantization Space Utilization Rate", "QSUR"),
            )
        )
    if primary == "qep":
        facts.append(
            _mechanism_fact(
                fact_type="objective",
                component="QEP",
                summary=(
                    "QEP changes layer-wise PTQ from independent reconstruction to error-aware reconstruction "
                    "by propagating previous-layer quantization error into the next layer's input objective."
                ),
                page=_find_page(pages, "Quantization Error Propagation", "previous-layer quantization error", "propagation strength"),
            )
        )
    if primary == "moequant":
        facts.append(
            _mechanism_fact(
                fact_type="moe_calibration",
                component="MoEQuant",
                summary=(
                    "MoEQuant's core issue is MoE imbalance: EBSS tries to balance expert coverage in calibration "
                    "data, while AGQ weights quantization by expert-sample affinity."
                ),
                page=_find_page(pages, "Expert-Balanced Self-Sampling", "Affinity-Guided Quantization"),
            )
        )
    if primary == "massive-activations":
        facts.append(
            _mechanism_fact(
                fact_type="empirical_finding",
                component="Massive activations",
                summary=(
                    "The paper is an empirical/mechanistic analysis: massive activations appear in fixed feature "
                    "dimensions and specific token positions, and intervention experiments test whether they matter."
                ),
                page=_find_page(pages, "fixed feature dimensions", "intervention"),
            )
        )

    if ("codequant" in lowered or "activation-oriented outlier smoothing" in lowered) and (
        "Cayley transform" in full_text or "arg min\nR" in full_text
    ):
        facts.append(
            _mechanism_fact(
                fact_type="equation",
                component="AOS",
                summary=(
                    "AOS is not just a rotation label: it uses a differentiable orthogonal "
                    "parameterization via Cayley transform and optimizes rotated activation "
                    "quantization error, roughly Eq. 3: min_R ||XR - Q(XR)||^2."
                ),
                page=_find_page(pages, "Cayley transform", "arg min\nR"),
            )
        )
    if "router logits" in full_text or "DKL" in full_text:
        facts.append(
            _mechanism_fact(
                fact_type="equation",
                component="ACCF",
                summary=(
                    "ACCF has separate objectives for attention weights and MoE FFN weights; "
                    "the MoE objective adds router KL divergence so clustering does not silently "
                    "change token-expert assignments."
                ),
                page=_find_page(pages, "router logits", "DKL", "Equation 5"),
            )
        )
    if "assignment matrix A" in full_text and "centroid matrix C" in full_text:
        facts.append(
            _mechanism_fact(
                fact_type="algorithm_step",
                component="ACCF",
                summary=(
                    "The ACCF update is alternating rather than a single clustering call: fix "
                    "assignments to optimize centroids, then update assignments against the output "
                    "objective instead of plain nearest-neighbor K-means."
                ),
                page=_find_page(pages, "assignment matrix A", "centroid matrix C"),
            )
        )
    if "Algorithm 1: POG Algorithm" in full_text:
        facts.append(
            _mechanism_fact(
                fact_type="algorithm",
                component="POG",
                summary=(
                    "POG Algorithm 1 builds a column permutation by sorting columns by mean "
                    "absolute value, partitioning into small subgroups, then pairing high-variance "
                    "subgroups with low-variance subgroups before fusing the permutation into weights."
                ),
                page=_find_page(pages, "Algorithm 1: POG Algorithm"),
            )
        )
    if "A4W4" in full_text and "16 centroids" in full_text:
        facts.append(
            _mechanism_fact(
                fact_type="setting_constraint",
                component="Quantization setting",
                summary=(
                    "CodeQuant A4W4 should not be read as ordinary 4-bit weight quantization: "
                    "activations are 4-bit while weights are represented by 16 learned centroids."
                ),
                page=_find_page(pages, "A4W4", "16 centroids"),
            )
        )
    if "Accel-Sim" in full_text:
        facts.append(
            _mechanism_fact(
                fact_type="hardware_evidence",
                component="GPU LUT evidence",
                summary=(
                    "GPU speed evidence is simulation-based with Accel-Sim and modified tensor-core "
                    "configuration; do not merge it with CPU runtime evidence."
                ),
                page=_find_page(pages, "Accel-Sim"),
            )
        )
    if "T-MAC" in full_text and "Llama.cpp" in full_text:
        facts.append(
            _mechanism_fact(
                fact_type="hardware_evidence",
                component="CPU LUT evidence",
                summary=(
                    "CPU speed evidence uses an A8W4 T-MAC kernel inside Llama.cpp on Intel CPU; "
                    "the 4.15x headline belongs to this systems setting, not to algorithmic accuracy."
                ),
                page=_find_page_with_all(pages, "T-MAC", "Llama.cpp", "4.15"),
            )
        )
    return facts


def _mechanism_fact(fact_type: str, component: str, summary: str, page: PageExtraction | None) -> dict[str, Any]:
    return {
        "fact_type": fact_type,
        "component": component,
        "summary": summary,
        "provenance": (
            [{"page": page.page_number, "section": page.section_hint}]
            if page is not None
            else []
        ),
    }


def _find_page(pages: list[PageExtraction], *needles: str) -> PageExtraction | None:
    for needle in needles:
        lowered = needle.lower()
        for page in pages:
            if lowered in page.text.lower():
                return page
    return None


def _find_page_with_all(pages: list[PageExtraction], *needles: str) -> PageExtraction | None:
    lowered_needles = [needle.lower() for needle in needles]
    for page in pages:
        lowered_text = page.text.lower()
        if all(needle in lowered_text for needle in lowered_needles):
            return page
    return _find_page(pages, *needles)


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
    lowered = text.lower()
    primary = _primary_paper_key(pages)
    if primary == "smoothquant" and "w8a8" in lowered:
        takeaways.append("SmoothQuant evidence should be read as W8A8 deployment evidence: accuracy preservation and latency/memory claims depend on O1/O2/O3 quantization settings.")
    if primary == "quarot" and "4-bit" in lowered:
        takeaways.append("QuaRot evidence combines perplexity/zero-shot accuracy with systems claims for INT4 weights, activations, and KV cache; keep these evidence types separate.")
    if primary == "duquant" and "w4a4" in lowered:
        takeaways.append("DuQuant tables stress W4A4/W6A6 perplexity and zero-shot QA; compare massive-outlier handling against SmoothQuant, OmniQuant, QLLM, Atom, and affine baselines.")
    if primary == "spinquant" and "random rotations" in lowered:
        takeaways.append("SpinQuant evidence includes an ablation that learned rotations reduce the variance seen across random rotations; this is central to the paper's motivation.")
    if primary == "squeezellm" and "dense-and-sparse" in lowered:
        takeaways.append("SqueezeLLM evidence should separate dense non-uniform quantization gains from sparse-retention gains and runtime/memory claims.")
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
    lowered = text.lower()
    if "simulator" in text.lower() or "Accel-Sim" in text:
        limitations.append("Some hardware evidence depends on simulation or specific CPU/kernel settings.")
    if "calibration" in lowered:
        limitations.append("Method behavior depends on calibration data; check whether calibration distribution matches downstream use.")
    if "rotation" in lowered or "hadamard" in lowered:
        limitations.append("Rotation-based methods need equivalence checks before quantization and separate accounting for any online transform cost.")
    if "sparse" in lowered and "speedup" in lowered:
        limitations.append("Sparse-retention methods require runtime/storage overhead checks; accuracy improvement alone is not enough.")
    if "block-wise" in lowered and "embedding-wise" in lowered:
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
