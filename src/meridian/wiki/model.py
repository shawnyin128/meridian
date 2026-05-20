from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from meridian.wiki.extract import PdfExtraction, PageExtraction


@dataclass(frozen=True)
class PaperModel:
    strategy: str
    source_quality: dict[str, Any]
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
    settings: list[str]
    datasets: list[str]
    metrics: list[str]
    claim_records: list[dict[str, Any]]
    method_records: list[dict[str, Any]]
    evidence_records: list[dict[str, Any]]


MODEL_STRATEGY = "heuristic_text_v3"

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
    "MT-Bench",
    "HumanEval",
    "AlpacaEval",
    "HellaSwag",
    "PIQA",
    "WinoGrande",
    "ARC-Challenge",
    "ARC-Easy",
    "ImageNet",
    "COCO",
    "SQuAD",
)

CONTROLLED_TOPIC_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("post-training quantization", ("post-training quantization", " ptq ", "ptq")),
    ("layer-wise PTQ", ("layer-wise ptq", "layer-wise post-training quantization", "layerwise ptq")),
    ("low-bit quantization", ("low-bit", "4-bit", "3-bit", "2-bit", "int4", "int8", "w4a", "a4w", "w8a8")),
    ("weight-only quantization", ("weight-only", "weight only", "w4a16", "w3a16", "w2a16")),
    ("weight-activation quantization", ("weight-activation", "weight activation", "weights and activations", "w8a8", "w4a4", "w6a6", "a4w4", "activation quantization")),
    ("KV-cache quantization", ("kv cache", "kv-cache")),
    ("MoE quantization", ("mixture-of-experts", "mixture of experts", " moe ", "moe llm", "moe model")),
    ("expert routing", ("expert routing", "router", "routing", "token-expert", "expert usage")),
    ("calibration data selection", ("calibration data", "calibration set", "calibration samples", "self-sampling", "sampling")),
    ("activation outliers", ("activation outlier", "activation outliers", "outlier activations")),
    ("LLM outliers", ("large language model outlier", "large language models outlier", "llm outlier", "llm outliers", "massive activations")),
    ("quantization error", ("quantization error", "quantization errors")),
    ("error propagation", ("error propagation", "propagating quantization error", "propagated error")),
    ("equivalent transformation", ("equivalent transformation", "equivalence transformation", "computationally invariant", "invariant transformation")),
    ("rotation-based quantization", ("rotation", "rotations", "hadamard", "orthogonal rotation", "orthogonal transform")),
    ("affine transformation", ("affine transform", "affine transformation")),
    ("non-uniform quantization", ("non-uniform", "nonuniform", "centroid", "centroids", "k-means", "clustering")),
    ("sparse outlier retention", ("dense-and-sparse", "sparse retention", "sparse matrix", "outlier retention")),
    ("hardware-aware quantization", ("hardware", "kernel", "latency", "throughput", "speedup", "memory saving")),
    ("lookup-table inference", ("lookup table", "lookup-table", " lut ", "lut-based")),
    ("benchmark evaluation", ("mmlu", "hellaswag", "gsm8k", "wikitext", "zero-shot")),
    ("mechanistic activation analysis", ("massive activations", "fixed feature dimensions", "intervention")),
    ("speculative decoding", ("speculative decoding", "speculative sampling", "draft model", "draft token", "draft tree", "verification stage")),
    ("speculative action execution", ("speculative actions", "agentic systems", "tentatively pursue", "ground-truth executor", "rollback")),
    ("agent workflow acceleration", ("faster agentic systems", "speculative framework for agentic", "action-level speculation")),
    ("attention kernel scheduling", ("flashattention", "warp-specialization", "asynchrony", "tensor cores", "tma")),
    ("IO-aware attention", ("io-aware", "memory movement", "block-wise matmul", "softmax")),
    ("low-precision attention", ("fp8 attention", "low-precision attention", "block quantization and incoherent processing")),
    ("dynamic draft tree", ("dynamic draft tree", "context-aware draft", "tree attention", "acceptance rate")),
    ("long-context inference", ("long context", "long-context", "longrope", "context window", "position interpolation")),
    ("sparse attention", ("sparse attention", "sparse transformer", "fixed attention pattern", "strided attention")),
    ("KV-cache compression", ("kv cache compression", "kv-cache compression", "cache pruning", "key token", "kv retention")),
    ("grouped-query attention", ("grouped-query attention", "grouped query attention", " gqa ", "multi-query attention", "multihead checkpoint")),
    ("conditional diffusion", ("conditional diffusion", "conditional ddpm", "denoising diffusion", "diffusion model")),
    ("3D medical image synthesis", ("3d brain mri", "semantic 3d", "medical image synthesis", "mri synthesis", "brain mri")),
    ("semantic conditioning", ("segmentation mask", "semantic label", "conditional image synthesis")),
    ("low-rank adaptation", ("low-rank", "low rank", "rank compensator", "low-rank compensator")),
    ("clustering theory", ("k-means", "principal component analysis", "pca", "cluster centers", "clustering algorithm")),
    ("learned quantization intervals", ("quantization interval", "learned interval", "qil")),
    ("learned quantizer scale", ("learned step size", "learnable offsets", "lsq+")),
    ("vision-language quantization", ("q-vlm", "large vision-language model", "multimodal reasoning")),
    ("vision-language representation learning", ("vl-jepa", "joint embedding predictive", "vision-language alignment")),
    ("RoPE scaling", ("rope scaling", "rotary position", "position interpolation", "longrope")),
    ("self-speculative decoding", ("self-speculative", "early exiting", "early-exit")),
    ("sparse mixture-of-experts", ("sparse mixture-of-experts", "mixtral", "top-k expert")),
    ("curve skeleton extraction", ("curve skeleton", "skeleton extraction", "incomplete point cloud")),
    ("point-cloud geometry", ("point cloud", "mesh contraction", "shape abstraction")),
    ("feature-wise modulation", ("feature-wise linear modulation", "film layer", "gamma", "beta")),
    ("visual reasoning", ("visual reasoning", "clevr", "question answering")),
    ("feature uncertainty", ("feature uncertainty", "draft feature", "speculative sampling")),
    ("human preference feedback", ("human preference", "human feedback", "preference feedback", "trajectory comparisons")),
    ("reward modeling", ("reward model", "reward predictor", "predicted reward", "reward function")),
    ("RLHF", ("reinforcement learning from human feedback", "rlhf")),
    ("preference optimization", ("preference optimization", "direct preference", "preference learning")),
    ("self-rewarding models", ("self-rewarding", "self rewarding", "meta-reward", "llm-as-a-judge", "meta-judge")),
    ("policy optimization", ("policy optimization", "ppo", "proximal policy optimization", "policy gradient")),
    ("test-time reinforcement learning", ("test-time reinforcement learning", "test time reinforcement learning", "ttrl")),
    ("instruction tuning", ("self-instruct", "instruction tuning", "self-generated instructions")),
    ("transformer architecture", ("transformer", "self-attention", "attention is all you need")),
    ("relative position representation", ("relative position", "relative positional", "positional representations")),
    ("recurrent computation", ("universal transformer", "adaptive computation time", "recurrent steps")),
    ("continuous-depth models", ("neural ordinary differential", "neural ode", "ordinary differential equation", "adjoint sensitivity")),
    ("physics-informed neural networks", ("physics-informed neural network", "physics informed neural network", "pinn")),
    ("partial differential equations", ("partial differential equation", "partial differential equations", "nonlinear pde", "pde")),
    ("agent planning", ("agent planning", "autonomous agent", "generative agent", "agent-based modeling")),
    ("LLM agents", ("llm agent", "large language model based autonomous agents", "generative agents")),
    ("multi-agent simulation", ("multi-agent", "agent society", "simulation of llm-driven")),
    ("audio-language modeling", ("audio-language", "qwen-audio", "qwen2-audio", "audio understanding")),
    ("audio encoder alignment", ("audio encoder", "audio-text", "audio text", "audio-language training")),
    ("model training dynamics", ("training dynamics", "continual improving", "sft", "upt")),
    ("survey synthesis", ("survey on", "in-depth survey", "technical report", "opportunities")),
    ("root-system digitization", ("root system", "root-system", "root excavation", "digitization")),
    ("computer architecture", ("computer architecture", "quantitative approach", "processor", "memory hierarchy")),
    ("performance evaluation", ("performance evaluation", "quantitative evaluation", "benchmarking", "measurement")),
    ("parameter-efficient adaptation", ("lora", "low-rank adaptation", "fine-tuning", "parameter-efficient")),
    ("chain-of-thought reasoning", ("chain-of-thought", "chain of thought", "faithful reasoning")),
    ("single-view 3D reconstruction", ("single-view 3d", "single view 3d", "3d reconstruction", "gaussian splatting")),
    ("world model learning", ("world model", "autonomous machine intelligence", "joint embedding architecture")),
    ("video representation learning", ("self-supervised video", "video models", "latent video", "video representation")),
    ("joint embedding predictive learning", ("jepa", "joint embedding predictive")),
    ("root system analysis", ("root image", "root architecture", "root bimodality", "root system")),
)


def build_paper_model(title: str, extraction: PdfExtraction) -> PaperModel:
    source_quality = _source_quality(extraction)
    if source_quality["review_state"] == "source_text_insufficient":
        return _source_hold_model(title, extraction, source_quality)

    abstract = _extract_abstract(extraction)
    method_records = _method_records(title, extraction.pages)
    contribution_sentences = _candidate_claim_sentences(extraction.pages, title=title, method_records=method_records)
    key_contributions = _key_contributions(contribution_sentences)
    claim_records = _claim_records(title, key_contributions)
    settings = _settings(extraction.pages)
    methods = _method_families(title, extraction.pages, method_records, settings)
    evidence_records = _page_evidence_records(extraction, claim_records)
    method_notes = _method_notes(method_records, extraction.pages)
    summary = _paper_positioning(title, abstract, extraction.pages, method_records)
    topics = _topics(title, abstract, contribution_sentences, extraction.pages, method_records, settings)
    datasets = _known_terms(extraction, KNOWN_DATASETS)
    if _is_non_llm_clustering_text(_focus_text(title, extraction.pages)):
        datasets = []
    metrics = _known_terms(extraction, KNOWN_METRICS)

    return PaperModel(
        strategy=MODEL_STRATEGY,
        source_quality=source_quality,
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
        settings=settings,
        datasets=datasets,
        metrics=metrics,
        claim_records=claim_records,
        method_records=method_records,
        evidence_records=evidence_records,
    )


def _source_quality(extraction: PdfExtraction) -> dict[str, Any]:
    page_words = [len(re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}", page.text)) for page in extraction.pages]
    word_count = sum(page_words)
    nonempty_pages = sum(count >= 30 for count in page_words)
    first_text = _normalize(extraction.pages[0].text if extraction.pages else "")
    first_lower = first_text.lower()
    jstor_cover = (
        "jstor to digitize" in first_lower
        or ("institute of mathematical statistics" in first_lower and "www.jstor.org" in first_lower)
    )
    minimum_text_pages = 0 if extraction.page_count <= 4 else max(1, min(3, extraction.page_count // 3))
    insufficient = word_count == 0 or nonempty_pages < minimum_text_pages or jstor_cover
    reasons: list[str] = []
    if word_count == 0:
        reasons.append(f"low_extracted_word_count:{word_count}")
    if nonempty_pages < minimum_text_pages:
        reasons.append(f"few_text_pages:{nonempty_pages}/{extraction.page_count}")
    if jstor_cover:
        reasons.append("jstor_or_scanned_cover_detected")
    return {
        "review_state": "source_text_insufficient" if insufficient else "text_extractable",
        "word_count": word_count,
        "nonempty_pages": nonempty_pages,
        "page_count": extraction.page_count,
        "reasons": reasons,
    }


def _source_hold_model(title: str, extraction: PdfExtraction, source_quality: dict[str, Any]) -> PaperModel:
    page = extraction.pages[0].page_number if extraction.pages else None
    provenance = [{"page": page, "section": extraction.pages[0].section_hint if extraction.pages else None}] if page else []
    reason_text = "; ".join(source_quality.get("reasons") or ["text extraction did not expose enough paper content"])
    claim_records = [
        {
            "schema_version": "claim_candidate.v0",
            "id": "claim-001",
            "status": "draft",
            "paper_title": title,
            "claim": "Scientific claims are on source-quality hold because the PDF text extraction is insufficient.",
            "claim_type": "source_quality_gap",
            "extraction_strategy": MODEL_STRATEGY,
            "provenance": provenance,
            "evidence_ids": [f"evidence-p{page:04d}"] if page else [],
            "confidence": "high",
            "review_state": "source_text_insufficient",
        }
    ]
    method_records = [
        {
            "schema_version": "method_candidate.v0",
            "id": "method-001",
            "status": "draft",
            "paper_title": title,
            "name": "Source-quality triage",
            "short_name": "source-quality-hold",
            "extraction_strategy": MODEL_STRATEGY,
            "summary": (
                "Stops paper understanding when extracted text is too sparse or looks like a cover/scan placeholder, "
                "so the wiki does not convert a bad PDF into false paper knowledge."
            ),
            "inputs": ["PDF extraction text", "page images", "page-level word counts"],
            "outputs": ["source-quality hold", "request for OCR or a cleaner PDF before knowledge promotion"],
            "assumptions": ["a retrieval-ready paper page requires enough source text or a later OCR/multimodal pass"],
            "implementation_notes": [
                "Inspect page images or run OCR before treating this file as a paper.",
                "Log extracted word counts, test OCR output, and compare replacement PDFs before promoting any method, claim, topic, or evidence knowledge.",
            ],
            "provenance": provenance,
            "confidence": "high",
            "review_state": "source_text_insufficient",
        }
    ]
    evidence_records = _page_evidence_records(extraction, claim_records)
    return PaperModel(
        strategy=MODEL_STRATEGY,
        source_quality=source_quality,
        retrieval_summary=(
            f"This source is on hold: extracted text is insufficient for paper understanding ({reason_text}). "
            "Route it as a source-management problem, not as prior work."
        ),
        one_line_takeaway=(
            f"`{title}` is source-quality state rather than paper knowledge: Meridian only found insufficient text ({reason_text}), "
            "so the next step is OCR or PDF replacement."
        ),
        mechanism_overview=[
            "Source-quality triage checks whether extraction contains enough paper text before generating claims or method knowledge."
        ],
        mechanism_facts=[
            {
                "fact_type": "source_quality",
                "component": "PDF extraction",
                "summary": f"Extracted text was insufficient for reliable paper ingest: {reason_text}.",
                "provenance": provenance,
            }
        ],
        implementation_notes=[
            "Run OCR or provide a cleaner PDF, then rerun `meridian wiki ingest` before reviewing paper content.",
            "Use page images only for source triage unless a multimodal/OCR pass is explicitly available.",
            "Record the failure bucket as source-quality, not paper-understanding, so evaluation does not reward hallucinated summaries.",
            "Compare the managed PDF path against Zotero or publisher backups before deleting or replacing the source.",
            "Inspect extracted pages and measure word-count recovery after OCR so the next ingest has auditable source-quality evidence.",
        ],
        evidence_takeaways=[
            "Evidence is limited to extraction quality; no scientific claim, method, or result should be promoted from this file."
        ],
        limitations=[
            "This is not a content limitation of the paper; it is a source-quality limitation of the available PDF.",
            "Retrieval should find this page only for source cleanup or missing-OCR triage, not for research synthesis.",
        ],
        key_contributions=[],
        method_notes="- Source-quality triage: extraction did not expose enough paper text for content ingest.",
        open_questions=[
            "Can OCR recover the actual paper text?",
            "Is there a cleaner PDF in Zotero, arXiv, publisher, or local backups?",
        ],
        topics=["source text extraction", "paper source quality"],
        methods=["source-quality triage"],
        settings=["source-text-insufficient"],
        datasets=[],
        metrics=[],
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
    primary = _primary_paper_key(pages)
    primary_positioning = _primary_positioning(primary)
    if primary_positioning:
        return primary_positioning
    text = _normalize(f"{title} {abstract} " + " ".join(page.text for page in pages[:4]))
    lowered = text.lower()
    problem = _problem_focus(lowered)
    evidence = _compact_evidence_context(pages, primary=primary)
    comparison = _comparison_frame(pages, method_records)
    return f"{problem} Route this paper with other work on {comparison}. {evidence}".strip()


def _primary_positioning(primary: str) -> str | None:
    positioning = {
        "smoothquant": (
            "This is a W8A8 post-training quantization paper about moving activation outlier difficulty into weights through an equivalent smoothing transform. "
            "Route it with activation-outlier smoothing, calibration-sensitive PTQ, and hardware-friendly W8A8 deployment. "
            "Read evidence around alpha sensitivity, O1/O2/O3 quantization settings, accuracy/perplexity, and latency or memory claims."
        ),
        "quarot": (
            "This is a rotation-based PTQ paper about using computationally invariant Hadamard rotations to remove LLM outliers for end-to-end low-bit inference. "
            "Route it with equivalent-transform quantization, activation/KV-cache quantization, and systems-aware INT4 inference. "
            "Read evidence around transform equivalence, W/A/KV bit-width settings, perplexity/accuracy, and online rotation overhead."
        ),
        "duquant": (
            "This is an outlier-aware PTQ paper about distributing massive and normal activation outliers with dual transforms before low-bit weight-activation quantization. "
            "Route it with rotation/permutation-based PTQ, activation-outlier handling, and W4A4/W6A6 quantization comparisons. "
            "Read evidence around massive-outlier detection, permutation/rotation ablations, perplexity/zero-shot accuracy, and prefill/decode speed claims."
        ),
        "flatquant": (
            "This is an affine-transform PTQ paper about learning transformations that make weight and activation distributions flatter before low-bit quantization. "
            "Route it with equivalent-transform PTQ, calibration-aware transform search, and transform-overhead versus accuracy tradeoffs. "
            "Read evidence around flatness/error reduction, transform decomposition, W/A bit-widths, perplexity/accuracy, and kernel-fused latency."
        ),
        "affinequant": (
            "This is an affine-transformation PTQ paper about expanding the equivalent-transform search space for low-bit LLM quantization. "
            "Route it with calibration-aware equivalent transforms, activation/weight outlier control, and W4A4-style accuracy comparisons. "
            "Read evidence around affine search ablations, calibration assumptions, quantization error, and matched-bit benchmark results."
        ),
        "dfrot": (
            "This is a refined rotation-based PTQ paper about handling massive activation features more carefully than generic randomized rotations. "
            "Route it with LLM activation outliers, rotation-based quantization, and equivalent-transform implementation checks. "
            "Read evidence around token/feature outlier analysis, rotation refinements, bit-width settings, and downstream accuracy."
        ),
        "ostquant": (
            "This is an orthogonal/scaling PTQ paper about improving quantization robustness through structured equivalent transformations. "
            "Route it with rotation-based and scaling-based PTQ, distribution-shape diagnostics, and low-bit LLM evaluation. "
            "Read evidence around QSUR or distribution metrics, transform ablations, perplexity/accuracy, and deployment overhead."
        ),
    }
    return positioning.get(primary)


def _focus_text(title: str, pages: list[PageExtraction], page_limit: int = 5) -> str:
    return _normalize(f"{title} " + " ".join(page.text for page in pages[:page_limit])).lower()


def _has_ppo(text: str) -> bool:
    return re.search(r"\bppo\b", text, flags=re.IGNORECASE) is not None


def _contains_phrase(text: str, needle: str) -> bool:
    normalized = f" {_normalize(text).lower()} "
    target = _normalize(needle).lower()
    if not target:
        return False
    if len(target) <= 4 and re.fullmatch(r"[a-z0-9.+#-]+", target):
        return re.search(rf"(?<![a-z0-9]){re.escape(target)}(?![a-z0-9])", normalized) is not None
    return target in normalized


def _is_quantization_research_context(text: str, pages: list[PageExtraction]) -> bool:
    lowered = f" {_normalize(text + ' ' + ' '.join(page.text[:1500] for page in pages[:4])).lower()} "
    primary = _primary_paper_key(pages)
    if primary in {
        "llm.int8",
        "smoothquant",
        "quarot",
        "spinquant",
        "duquant",
        "squeezellm",
        "omniquant",
        "affinequant",
        "flatquant",
        "dfrot",
        "ostquant",
        "qep",
        "moequant",
        "codequant",
        "milo",
        "qil",
        "lsqplus",
        "qvlm",
    }:
        return True
    if "flashattention" in lowered or ("attention" in lowered and "hopper" in lowered):
        return False
    if "jepa" in lowered and ("video" in lowered or "joint embedding" in lowered):
        return False
    if _is_non_llm_clustering_text(lowered):
        return False
    research_markers = (
        "post-training quantization",
        "quantization-aware training",
        "weight-only quantization",
        "weight activation quantization",
        "weight-activation quantization",
        "activation quantization",
        "quantized llm",
        "llm quantization",
        "model quantization",
        "quantized model",
        "low-bit llm",
        "low-bit quantization",
        "calibration data",
        "round-to-nearest",
    )
    bit_markers = re.search(r"\b(?:w[2348]a(?:4|8|16)|a[2348]w[2348]|int[2348]|[2348]-bit)\b", lowered)
    return any(marker in lowered for marker in research_markers) or bool(bit_markers)


def _comparison_frame(pages: list[PageExtraction], method_records: list[dict[str, Any]]) -> str:
    text = _normalize(" ".join(page.text for page in pages[:8])).lower()
    names = " ".join(str(record.get("name") or "") for record in method_records).lower()
    if "speculative actions" in text or "agentic systems" in text:
        return "agent workflow acceleration, speculative action execution, and correctness/latency tradeoffs"
    if "flashattention" in text or ("hopper" in text and "attention" in text):
        return "attention-kernel scheduling, IO/memory movement, low-precision numerical checks, and GPU throughput"
    if "survey" in text and ("autonomous agent" in text or "llm-based autonomous agent" in text or "large language model based autonomous agent" in text):
        return "LLM-agent survey taxonomy, agent architecture components, evaluation gaps, and primary-paper followups"
    if "speculative decoding" in text or "draft model" in text or "draft tree" in text:
        return "speculative decoding, draft-token verification, and inference-speed/quality tradeoffs"
    if "conditional diffusion" in text or "denoising diffusion" in text or "ddpm" in text:
        return "conditional diffusion, semantic conditioning, and generated-sample evaluation"
    if _is_kv_cache_efficiency_text(text):
        return "KV-cache compression, retention policies, and decode-time quality/runtime tradeoffs"
    if "long context" in text or "long-context" in text or "longrope" in text:
        return "long-context inference, positional extrapolation, and benchmark/generalization limits"
    if "grouped-query attention" in text or "grouped query attention" in text or "multi-query attention" in text:
        return "attention-head sharing, checkpoint conversion, and inference-memory tradeoffs"
    if "human preference" in text or "human feedback" in text or "reward model" in text or "reward predictor" in text:
        return "preference learning, reward modeling, and policy optimization evidence"
    if _has_ppo(text) or "proximal policy optimization" in text or "policy gradient" in text:
        return "policy optimization, reward design, and rollout/evaluation stability"
    if "self-attention" in text or "attention is all you need" in text or "relative position" in text:
        return "attention mechanisms, positional representations, and sequence-modeling ablations"
    if "universal transformer" in text or "adaptive computation time" in text:
        return "recurrent transformer computation, adaptive depth, and sequence-modeling tradeoffs"
    if "neural ordinary differential" in text or "neural ode" in text or "ordinary differential equation" in text:
        return "continuous-depth models, ODE solver assumptions, and memory/accuracy tradeoffs"
    if "physics-informed neural network" in text or "physics informed neural network" in text or "partial differential equation" in text:
        return "physics-informed neural networks, PDE constraints, and forward/inverse problem evaluation"
    if "autonomous agent" in text or "generative agent" in text or "agent planning" in text:
        return "agent planning, environment interaction, and evaluation protocol limitations"
    if "survey" in text or "technical report" in text:
        return "survey taxonomy, evidence gaps, and pointers to primary methods"
    if "k-means" in text and ("pca" in text or "principal component" in text):
        return "clustering theory, PCA relationships, and objective/assumption boundaries"
    if "mixture-of-experts" in text or "moe" in text:
        if "calibration" in text or "expert" in names:
            return "MoE quantization, expert-routing calibration, and low-bit deployment tradeoffs"
        return "MoE systems and model-quality tradeoffs"
    if "quantization error propagation" in text or "layer-wise" in text:
        return "layer-wise PTQ, quantization error accumulation, and reconstruction-objective design"
    if any(marker in text for marker in ("rotation", "hadamard", "orthogonal")):
        return "rotation-based PTQ, equivalent transforms, and activation/weight outlier control"
    if any(marker in text for marker in ("non-uniform", "centroid", "clustering", "sparse")):
        return "non-uniform weight quantization, outlier retention, and memory/accuracy tradeoffs"
    if "massive activation" in text:
        return "LLM activation outliers and mechanistic intervention evidence"
    if "quantization" in text:
        return "post-training quantization, calibration assumptions, and benchmark evidence"
    return "the method family, experimental setting, and limitations named in its retrieval anchors"


def _problem_focus(lowered_text: str) -> str:
    if "source_text_insufficient" in lowered_text:
        return "This source is a source-quality hold, not a paper understanding page."
    if "survey" in lowered_text and ("autonomous agent" in lowered_text or "llm-based autonomous agent" in lowered_text or "large language model based autonomous agent" in lowered_text):
        return "This is a survey of LLM-based autonomous agents; use it as a taxonomy and gap map, not as a primary method paper."
    if "speculative actions" in lowered_text or "agentic systems" in lowered_text:
        return "This is an agent workflow acceleration paper about speculating future actions, executing them tentatively, and preserving correctness through a slower ground-truth executor or verifier."
    if "flashattention" in lowered_text or ("hopper" in lowered_text and "attention" in lowered_text):
        return "This is an attention-kernel systems paper about using hardware asynchrony, memory movement, and low-precision attention computation to improve throughput while preserving numerical accuracy."
    if "qwen-audio" in lowered_text or "audio-language" in lowered_text or "audio understanding" in lowered_text:
        return "This is an audio-language model paper about connecting audio representations to language-model behavior across multiple audio understanding tasks."
    if "v-jepa" in lowered_text or "jepa" in lowered_text and "video" in lowered_text:
        return "This is a video representation learning paper about predicting in latent space so learned representations support understanding, prediction, and planning."
    if "speculative decoding" in lowered_text or "draft model" in lowered_text or "draft tree" in lowered_text:
        return "This is an inference-acceleration paper about generating draft tokens and verifying them without changing the target model distribution."
    if "conditional diffusion" in lowered_text or "denoising diffusion" in lowered_text or "ddpm" in lowered_text:
        return "This is a conditional diffusion paper; the core problem is generating samples that follow a conditioning signal while remaining useful under downstream evaluation."
    if "vl-jepa" in lowered_text or "joint embedding predictive" in lowered_text:
        return "This is a vision-language representation paper about learning aligned image/text embeddings and then adapting them to downstream VQA or classification."
    if "q-vlm" in lowered_text or "large vision-language model" in lowered_text and "quantization" in lowered_text:
        return "This is a vision-language PTQ paper about keeping multimodal reasoning accurate while quantizing LVLM weights and activations."
    if "semantic 3d brain mri" in lowered_text or "3d brain mri synthesis" in lowered_text:
        return "This is a 3D medical image synthesis paper about conditioning a generative model on semantic brain anatomy."
    if _is_kv_cache_efficiency_text(lowered_text):
        return "This is a KV-cache efficiency paper about retaining the information needed for decode quality while reducing memory or latency."
    if "long context" in lowered_text or "long-context" in lowered_text or "longrope" in lowered_text:
        return "This is a long-context inference paper about extending or exploiting context length without losing quality."
    if "grouped-query attention" in lowered_text or "grouped query attention" in lowered_text or "multi-query attention" in lowered_text:
        return "This is an attention-architecture paper about reducing inference memory/bandwidth by sharing key-value heads."
    if "k-means" in lowered_text and ("pca" in lowered_text or "principal component" in lowered_text):
        return "This is a clustering-theory paper about when K-means relates to PCA and what assumptions support that relationship."
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
    if "human preference" in lowered_text or "human feedback" in lowered_text or "reward model" in lowered_text or "reward predictor" in lowered_text:
        return "This is a preference-learning paper: it turns human comparisons or judgments into a reward/evaluation signal that can improve model or policy behavior."
    if _has_ppo(lowered_text) or "proximal policy optimization" in lowered_text:
        return "This is a policy-optimization paper about improving a policy under clipped or constrained reinforcement-learning updates."
    if "self-attention" in lowered_text or "attention is all you need" in lowered_text or "relative position" in lowered_text:
        return "This is an attention/Transformer architecture paper about how sequence representations are computed and what positional or attention structure matters."
    if "universal transformer" in lowered_text:
        return "This is a recurrent Transformer architecture paper about reusing computation across depth and optionally adapting the number of computation steps."
    if "neural ordinary differential" in lowered_text or "neural ode" in lowered_text:
        return "This is a continuous-depth modeling paper about replacing discrete layers with ODE dynamics and solver-based training/inference."
    if (
        "physics-informed neural network" in lowered_text
        or "physics informed neural network" in lowered_text
        or "partial differential equation" in lowered_text
        or "nonlinear pde" in lowered_text
    ):
        return "This is a physics-informed neural network paper: the core problem is solving or identifying PDE systems by training neural networks against data plus differential-equation residual constraints."
    if "autonomous agent" in lowered_text or "generative agent" in lowered_text or "agent planning" in lowered_text:
        return "This is an agent paper about planning, acting, or simulating behavior in an environment; evidence depends heavily on the evaluation setup."
    return "This paper proposes a method for the problem stated in its title and abstract."


def _compact_evidence_context(pages: list[PageExtraction], *, primary: str = "") -> str:
    text = _paper_body_text(pages)
    lowered = text.lower()
    quantization_primaries = {
        "llm.int8",
        "smoothquant",
        "quarot",
        "spinquant",
        "duquant",
        "squeezellm",
        "omniquant",
        "affinequant",
        "flatquant",
        "dfrot",
        "ostquant",
        "qep",
        "moequant",
        "codequant",
        "milo",
    }
    if primary in quantization_primaries:
        bits = []
        if re.search(r"\bA\d+W\d+\b|\bW\d+A\d+\b|\b\d+-bit\b|\blow-bit\b", text, flags=re.IGNORECASE):
            bits.append("bit-width settings")
        if any(term in text for term in KNOWN_DATASETS):
            bits.append("standard benchmark datasets")
        if re.search(r"\b(perplexity|accuracy|zero-shot|mmlu|hellaswag|piqa|winogrande)\b", text, flags=re.IGNORECASE):
            bits.append("quality metrics")
        if re.search(r"\b(speedup|latency|throughput|memory|kernel|prefill|decode)\b", text, flags=re.IGNORECASE):
            bits.append("systems/runtime evidence")
        if re.search(r"\b(ablation|sensitivity|alpha|rotation|permutation|transform|calibration)\b", text, flags=re.IGNORECASE):
            bits.append("mechanism ablations")
        if not bits:
            bits.append("matched-bit quantization evidence")
        return "Read the evidence around " + ", ".join(_dedupe(bits)) + ", not unrelated broad task claims."
    if (
        "physics-informed neural network" in lowered
        or "physics informed neural network" in lowered
        or "partial differential equation" in lowered
        or "nonlinear pde" in lowered
        or "pde residual" in lowered
    ):
        return (
            "Read the evidence around PDE residual loss, boundary/initial-condition constraints, "
            "collocation sampling, forward-solution accuracy, and inverse-parameter identification, not just the abstract claims."
        )
    if "survey" in lowered and ("autonomous agent" in lowered or "llm-based autonomous agent" in lowered):
        return (
            "Read the evidence as a survey taxonomy: architecture dimensions, cited primary papers, evaluation gaps, "
            "and limitations of the survey scope, not as primary experimental evidence."
        )
    if "speculative actions" in lowered or "agentic systems" in lowered:
        return (
            "Read the evidence around action-trace correctness, verifier or ground-truth executor behavior, rollback or commit logic, "
            "latency, and task-success preservation, not as token-level speculative decoding evidence."
        )
    if "flashattention" in lowered or ("hopper" in lowered and "attention" in lowered):
        return (
            "Read the evidence around kernel throughput, memory movement, precision/numerical error, GPU architecture, "
            "and exact-attention comparisons, not as generic model-compression evidence."
        )
    if "qwen-audio" in lowered or "audio-language" in lowered:
        return (
            "Read the evidence around audio task families, audio encoder alignment, instruction tuning, and task-specific metrics, "
            "not as generic sequence-modeling evidence."
        )
    if "kv cache" in lowered or "kv-cache" in lowered:
        return (
            "Read the evidence around retention ratio, cache budget, sequence length, memory footprint, latency, and long-context quality, "
            "not as generic context-extension evidence."
        )
    if "jepa" in lowered and "video" in lowered:
        return (
            "Read the evidence around latent video prediction, representation probes, downstream perception, and planning/control tasks, "
            "not as long-context or language-model evidence."
        )
    bits = []
    if re.search(r"\bA\d+W\d+\b|\b\d+-bit\b|\blow-bit\b", text, flags=re.IGNORECASE):
        bits.append("low-bit settings")
    if any(term in text for term in KNOWN_DATASETS):
        bits.append("standard benchmark datasets")
    if re.search(r"\b(speedup|latency|throughput|memory)\b", text, flags=re.IGNORECASE):
        bits.append("systems evidence")
    if re.search(r"\b(draft|acceptance|tokens/sec|speedup)\b", text, flags=re.IGNORECASE):
        bits.append("draft/verification speed evidence")
    if re.search(r"\b(dice|segmentation|fid|ssim|psnr|mri)\b", text, flags=re.IGNORECASE):
        bits.append("medical image quality and downstream metrics")
    if re.search(r"\b(context length|longbench|passkey|perplexity)\b", text, flags=re.IGNORECASE):
        bits.append("long-context quality evidence")
    if re.search(r"\b(human feedback|preference|reward model|labeler|rlhf)\b", text, flags=re.IGNORECASE):
        bits.append("preference/reward-model evidence")
    if re.search(r"\b(policy|rollout|environment)\b", text, flags=re.IGNORECASE) or _has_ppo(text):
        bits.append("policy rollout evidence")
    if re.search(r"\b(attention|transformer|position|bleu|translation)\b", text, flags=re.IGNORECASE):
        bits.append("sequence-modeling ablations")
    if re.search(r"\b(agent|planning|simulation|tool use|benchmark)\b", text, flags=re.IGNORECASE):
        bits.append("agent-environment evaluation")
    if not bits:
        return "The evidence needs to be read through experiments, ablations, and limitations rather than abstract prose."
    return "Read the evidence around " + ", ".join(bits) + ", not just the abstract claims."


def _candidate_claim_sentences(
    pages: list[PageExtraction],
    *,
    title: str,
    method_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    scored: list[tuple[int, dict[str, Any]]] = []
    own_terms = _own_claim_terms(title, method_records)
    for page in pages[:18]:
        for sentence in _sentences(page.text):
            score = _claim_sentence_score(sentence, page, own_terms)
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


def _own_claim_terms(title: str, method_records: list[dict[str, Any]]) -> list[str]:
    terms = [_method_name_from_title(title), title.split(":", 1)[0]]
    for record in method_records:
        for value in (record.get("short_name"), record.get("name")):
            if value:
                terms.append(str(value))
    cleaned = []
    for term in terms:
        term = str(term).strip()
        if len(term) >= 3 and term.lower() not in {"method", "model", "paper"}:
            cleaned.append(term)
    return _dedupe(cleaned)


def _claim_sentence_score(sentence: str, page: PageExtraction, own_terms: list[str]) -> int:
    lowered = sentence.lower()
    if _is_background_sentence(lowered) or _bad_claim_sentence(sentence):
        return -5
    score = 0
    mentions_own_work = any(term.lower() in lowered for term in own_terms)
    if mentions_own_work:
        score += 3
    if any(marker in lowered for marker in CLAIM_MARKERS):
        score += 2
    if _claim_has_evidence_anchor(sentence):
        score += 2
    elif _is_broad_result_claim(sentence):
        score -= 5
    for marker in ("table", "figure", "ablation", "outperform", "achieve", "speedup", "latency", "perplexity", "accuracy"):
        if marker in lowered:
            score += 2
    if re.search(r"\b\d+(?:\.\d+)?\s*(?:x|×|%|gb|s)\b", lowered):
        score += 3
    if "codequant" in lowered:
        score += 1
    if not mentions_own_work and not any(marker in lowered for marker in ("our method", "our approach", "we propose", "we introduce", "we show", "we demonstrate")):
        score -= 3
    if page.page_number <= 2 and score < 4:
        score -= 2
    if "introduction" == (page.section_hint or "").lower():
        score -= 1
    return score


def _claim_has_evidence_anchor(sentence: str) -> bool:
    lowered = sentence.lower()
    if re.search(r"\b\d+(?:\.\d+)?\s*(?:x|×|%|gb|mb|ms|s|tokens/sec|bit|bits)\b", lowered):
        return True
    if re.search(r"\bsection\s+\d+(?:\.\d+)*\b", lowered):
        return True
    if any(term.lower() in lowered for term in KNOWN_DATASETS + KNOWN_METRICS):
        return True
    evidence_markers = (
        "table",
        "figure",
        "ablation",
        "baseline",
        "baselines",
        "gptq",
        "awq",
        "ppo",
        "sft baseline",
        "benchmark",
        "experiment",
        "evaluation",
        "perplexity",
        "accuracy",
        "latency",
        "throughput",
        "speedup",
        "memory",
        "human evaluation",
        "held-out",
        "zero-shot",
    )
    return any(marker in lowered for marker in evidence_markers)


def _is_broad_result_claim(sentence: str) -> bool:
    lowered = sentence.lower()
    result_markers = (
        "outperform",
        "improve",
        "achieve",
        "state-of-the-art",
        "competitive",
        "superior",
        "significant",
    )
    if not any(marker in lowered for marker in result_markers):
        return False
    return not _claim_has_evidence_anchor(sentence)


def _is_background_sentence(lowered: str) -> bool:
    background_markers = (
        "ablation study in this section",
        "in this section, we provide",
        "has emerged",
        "have emerged",
        "large language models (llms) have achieved",
        "large language models have achieved",
        "this specialization enables",
        "by representing weights and activations",
        "recent hardware innovations",
        "consequently",
        "to address these costs",
        "to achieve accurate quantization",
        "notable examples include",
        "among these methods",
    )
    return any(marker in lowered for marker in background_markers)


def _bad_claim_sentence(sentence: str) -> bool:
    lowered = sentence.lower()
    if re.search(r"[a-z]-\s+[a-z]", lowered):
        return True
    if _looks_like_table_sentence(sentence):
        return True
    if "figure " in lowered and not any(marker in lowered for marker in CLAIM_MARKERS):
        return True
    if any(marker in lowered for marker in ("model decoder speed", "memory use (gb)", "tokens/sec", "fp quantized speed up")):
        return True
    if _is_broad_result_claim(sentence):
        return True
    digit_ratio = sum(character.isdigit() for character in sentence) / max(len(sentence), 1)
    return digit_ratio > 0.22


def _key_contributions(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    contributions: list[dict[str, Any]] = []
    for candidate in candidates:
        sentence = _clean_claim_sentence(str(candidate["sentence"]))
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


def _clean_claim_sentence(sentence: str) -> str:
    sentence = re.sub(r"([A-Za-z])-\s+([A-Za-z])", r"\1\2", sentence)
    sentence = re.sub(r"^\d+\s+Introduction\s+", "", sentence, flags=re.IGNORECASE)
    sentence = re.sub(
        r"^([A-Z][A-Za-z0-9.]+)\s+In this paper,\s+we present\s+\1,",
        r"The paper presents \1,",
        sentence,
    )
    sentence = re.sub(r"^demonstrate that\s+", "The paper demonstrates that ", sentence, flags=re.IGNORECASE)
    sentence = _strip_table_prefix_before_claim(sentence)
    return _normalize(sentence)


def _strip_table_prefix_before_claim(sentence: str) -> str:
    markers = ("MoEQuant", "CodeQuant", "QEP", "SmoothQuant", "QuaRot", "DuQuant", "SpinQuant", "SqueezeLLM", "OmniQuant", "AffineQuant", "FlatQuant", "DFRot", "OSTQuant", "LLM.int8")
    lowered = sentence.lower()
    if not any(marker in lowered for marker in ("tokens/sec", "memory use", "speed up", "fp quantized")):
        return sentence
    positions = [sentence.find(marker) for marker in markers if sentence.find(marker) > 0]
    if positions:
        return sentence[min(positions):]
    return sentence


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
    contract_summary = _fallback_contract_summary(method_text)
    if contract_summary:
        return contract_summary

    candidate_text = " ".join(page.text for page in pages[:3]) + " " + method_text
    scored: list[tuple[int, int, str]] = []
    for index, sentence in enumerate(_sentences(candidate_text)):
        if _bad_method_summary_sentence(sentence):
            continue
        lowered = sentence.lower()
        score = 0
        quant_focus = _is_quantization_research_context(method_text, pages)
        base_markers = (
            "we propose",
            "we introduce",
            "we present",
            "our method",
            "our approach",
            "framework",
            "activation",
            "weights",
            "attention",
            "agent",
            "audio",
            "diffusion",
            "clustering",
            "pde",
            "residual",
            "preference",
        )
        quant_markers = (
            "quantization",
            "rotat",
            "outlier",
            "non-uniform",
            "dense-and-sparse",
            "hadamard",
        )
        for marker in base_markers + (quant_markers if quant_focus else ()):
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


def _fallback_contract_summary(method_text: str) -> str:
    lowered = method_text.lower()
    if "kv cache" in lowered or "kv-cache" in lowered or "key-value cache" in lowered:
        return (
            "Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, "
            "then evaluates the quality, memory, and latency tradeoff at target context lengths."
        )
    if "flashattention" in lowered or ("hopper" in lowered and "attention" in lowered):
        return (
            "Schedules attention tiles, GPU memory movement, and low-precision compute so exact attention runs faster on the target hardware."
        )
    if "speculative actions" in lowered or "agentic systems" in lowered:
        return (
            "Speculates future agent actions with a fast path and uses a slower trusted executor or verifier to commit or roll back the action trace."
        )
    if "qwen-audio" in lowered or "audio-language" in lowered or "audio understanding" in lowered:
        return (
            "Connects audio encoder representations to language-model prompting and decoding so speech, music, sound, and audio-QA tasks can be handled through one audio-language interface."
        )
    if "jepa" in lowered and ("video" in lowered or "joint embedding" in lowered):
        return (
            "Learns video representations by predicting masked targets in latent space, then tests whether those representations transfer to perception or planning tasks."
        )
    if (
        "physics-informed neural network" in lowered
        or "physics informed neural network" in lowered
        or "partial differential equation" in lowered
        or "pde residual" in lowered
    ):
        return (
            "Trains a neural approximator with data loss plus PDE residual and boundary/initial-condition constraints for forward solution and inverse parameter tasks."
        )
    if "k-means" in lowered or "principal component analysis" in lowered or "pca" in lowered:
        return (
            "Analyzes when clustering assignments and centroids align with PCA-style structure and which objective assumptions make that connection valid."
        )
    if "survey" in lowered and ("autonomous agent" in lowered or "llm-based autonomous agent" in lowered):
        return (
            "Organizes LLM-agent papers into taxonomy dimensions such as memory, planning, action, tool use, and evaluation so later work can choose primary sources and comparison axes."
        )
    if "direct preference optimization" in lowered or "preference optimization" in lowered:
        return (
            "Turns preference pairs and a reference-policy constraint into a direct policy objective, avoiding a separate online reward-model optimization loop."
        )
    if "test-time reinforcement learning" in lowered or "ttrl" in lowered:
        return (
            "Applies reinforcement-learning style updates at test time, so evaluation must separate task reward, rollout/update behavior, and inference-time cost."
        )
    return ""


def _bad_visual_caption_sentence(sentence: str) -> bool:
    lowered = sentence.lower()
    if any(marker in lowered for marker in ("http", "github", "@", "references", "proceedings")):
        return True
    digit_ratio = sum(character.isdigit() for character in sentence) / max(len(sentence), 1)
    return digit_ratio > 0.32


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


def _domain_specific_contract(method_text: str) -> dict[str, list[str]] | None:
    lowered = method_text.lower()
    if "survey" in lowered and ("autonomous agent" in lowered or "llm-based autonomous agent" in lowered or "large language model based autonomous agent" in lowered):
        return {
            "inputs": ["surveyed primary papers", "agent architecture dimensions", "planning/memory/tool-use/evaluation taxonomy"],
            "outputs": ["literature map", "taxonomy of LLM-agent components", "research gaps and primary-paper followups"],
            "assumptions": [
                "survey claims summarize the cited literature and should be checked against primary papers before being treated as experimental evidence"
            ],
            "implementation_notes": [
                "Use the survey to route to primary agent papers by memory, planning, tool-use, and evaluation dimension.",
                "Do not implement a single algorithm from the survey; extract comparison axes and then inspect cited primary methods.",
            ],
        }
    if "flashattention" in lowered or ("hopper" in lowered and "attention" in lowered):
        return {
            "inputs": ["query/key/value tiles", "attention mask or sequence layout", "GPU memory hierarchy", "precision mode"],
            "outputs": ["attention outputs", "kernel throughput/latency measurements", "numerical-error profile"],
            "assumptions": [
                "the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on"
            ],
            "implementation_notes": [
                "Profile matmul, softmax, memory movement, and synchronization separately before trusting end-to-end throughput.",
                "Compare FP16/FP8 or low-precision modes against exact-attention outputs to separate numerical error from scheduling wins.",
            ],
        }
    if "speculative actions" in lowered or "agentic systems" in lowered:
        return {
            "inputs": ["agent state", "candidate future actions", "fast speculative model", "slow ground-truth executor or verifier"],
            "outputs": ["tentatively executed action trace", "verified committed actions", "latency or wall-clock speedup"],
            "assumptions": [
                "speculated actions can be checked or rolled back so faster execution remains lossless with respect to the ground-truth executor"
            ],
            "implementation_notes": [
                "Record action traces with speculation, verification, rollback, tool/environment state, and latency for each step.",
                "Test equivalence against sequential execution before reporting speedups or task-success gains.",
            ],
        }
    if "qwen-audio" in lowered or "audio-language" in lowered or "audio understanding" in lowered:
        return {
            "inputs": ["audio waveform or features", "audio encoder outputs", "text prompts or task tags", "language-model decoder"],
            "outputs": ["audio-language representations", "task-conditioned text responses", "audio understanding predictions"],
            "assumptions": [
                "task tags, audio preprocessing, and encoder-language alignment cover the audio task family being evaluated"
            ],
            "implementation_notes": [
                "Separate audio preprocessing, encoder alignment, decoder prompting, and task-head errors in logs.",
                "Evaluate speech, music, sound, and instruction-following tasks separately instead of mixing them into one score.",
            ],
        }
    if "jepa" in lowered and ("video" in lowered or "joint embedding predictive" in lowered):
        return {
            "inputs": ["video or image observations", "masked or target latent regions", "joint embedding predictor"],
            "outputs": ["latent predictive representations", "downstream perception or planning behavior"],
            "assumptions": [
                "predicting in representation space learns useful structure without requiring pixel reconstruction"
            ],
            "implementation_notes": [
                "Log representation probes, downstream task splits, masking strategy, and predictor-target alignment separately.",
                "Ablate latent prediction target, encoder freezing, and finetuning protocol before attributing downstream gains.",
            ],
        }
    if (
        "physics-informed neural network" in lowered
        or "physics informed neural network" in lowered
        or "partial differential equation" in lowered
        or "nonlinear pde" in lowered
        or "pde residual" in lowered
    ):
        return {
            "inputs": ["boundary/initial condition data", "collocation points", "PDE residual terms", "neural network approximator"],
            "outputs": ["solution field approximation", "identified PDE parameters", "residual-constrained predictions"],
            "assumptions": [
                "the PDE residual, boundary conditions, and sampled collocation points match the physical system being modeled"
            ],
            "implementation_notes": [
                "Unit test PDE residual computation, boundary/initial-condition losses, collocation sampling, and gradient/autodiff shapes on a toy PDE before scaling.",
                "Track data loss and physics residual loss separately so poor predictions can be attributed to data fit, residual weighting, or sampling.",
            ],
        }
    if "human preference" in lowered or "human feedback" in lowered or "reward model" in lowered or "reward predictor" in lowered:
        return {
            "inputs": ["trajectory or response pairs", "human preference labels", "policy rollouts"],
            "outputs": ["learned reward model", "policy optimized against predicted preference reward"],
            "assumptions": ["preference labels are consistent enough for a reward model to guide policy optimization"],
            "implementation_notes": [
                "Log preference-pair construction, labeler agreement, reward-model accuracy, policy reward, and held-out human evaluation separately."
            ],
        }
    if "reinforcement learning" in lowered or "policy optimization" in lowered or _has_ppo(lowered):
        return {
            "inputs": ["policy parameters", "reward signal", "rollout trajectories"],
            "outputs": ["updated policy", "measured return or task success"],
            "assumptions": ["rollout reward and evaluation environment match the behavior being optimized"],
            "implementation_notes": [
                "Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance."
            ],
        }
    if "neural ordinary" in lowered or "neural ode" in lowered:
        return {
            "inputs": ["hidden state", "time variable", "ODE solver configuration"],
            "outputs": ["continuous-depth hidden trajectory", "predictions from ODE solver integration"],
            "assumptions": ["continuous-time dynamics and solver tolerances are appropriate for the modeled transformation"],
            "implementation_notes": [
                "Log solver tolerance, number of function evaluations, adjoint gradients, and stability on controlled toy dynamics."
            ],
        }
    if "conditional diffusion" in lowered or "denoising diffusion" in lowered or "ddpm" in lowered:
        return {
            "inputs": ["noisy sample", "diffusion timestep", "conditioning signal"],
            "outputs": ["denoised or generated sample conditioned on the input signal"],
            "assumptions": ["the conditioning signal and noise schedule match the intended generation distribution"],
            "implementation_notes": ["Unit test timestep/noise schedule, conditioning-channel shapes, and sample evaluation metrics."],
        }
    if "speculative decoding" in lowered or "draft model" in lowered or "draft tree" in lowered:
        return {
            "inputs": ["draft model proposals", "target model verification logits", "acceptance or tree budget"],
            "outputs": ["verified accepted tokens", "inference speedup without target-distribution change"],
            "assumptions": ["target-model verification preserves the original decoding distribution"],
            "implementation_notes": ["Log draft acceptance length, rejected branches, verifier cost, and output-distribution equivalence."],
        }
    if "kv cache" in lowered or "kv-cache" in lowered:
        return {
            "inputs": ["KV-cache tensors", "retention or compression budget", "decode-time attention state", "sequence-length target"],
            "outputs": ["compressed or filtered KV-cache representation", "memory/latency profile", "long-context quality measurements"],
            "assumptions": ["retained cache entries preserve the information needed for downstream attention at the tested context length"],
            "implementation_notes": [
                "Measure retention ratio, decode latency, memory footprint, and quality under the same sequence lengths.",
                "Ablate scoring/selection policy, cache budget, and layer/head placement while checking tensor shapes after pruning.",
            ],
        }
    if "long context" in lowered or "long-context" in lowered:
        return {
            "inputs": ["long sequence tokens", "positional encoding or attention state"],
            "outputs": ["extended-context model behavior or evaluation results"],
            "assumptions": ["quality must be checked at the target context lengths, not inferred from short-context behavior"],
            "implementation_notes": ["Sweep context length and separate retrieval/position failures from model-capacity failures."],
        }
    if "grouped-query" in lowered or "multi-query" in lowered:
        return {
            "inputs": ["query heads", "shared key/value heads", "attention checkpoint"],
            "outputs": ["attention checkpoint with shared key/value heads"],
            "assumptions": ["shared key/value heads preserve enough attention capacity after adaptation"],
            "implementation_notes": ["Verify Q/K/V tensor grouping shapes and compare MHA/MQA/GQA at matched adaptation budgets."],
        }
    if "k-means" in lowered or "clustering" in lowered:
        return {
            "inputs": ["data vectors", "cluster count", "centroid initialization"],
            "outputs": ["cluster assignments", "centroids", "objective value"],
            "assumptions": ["the clustering objective and initialization assumptions match the claimed theory or algorithm"],
            "implementation_notes": ["Test centroid update monotonicity, initialization sensitivity, and the claimed PCA relationship."],
        }
    return None


def _generic_method_inputs(method_text: str) -> list[str]:
    contract = _domain_specific_contract(method_text)
    if contract is not None:
        return contract["inputs"]
    lowered = method_text.lower()
    inputs = []
    if "human preference" in lowered or "human feedback" in lowered or "reward model" in lowered or "reward predictor" in lowered:
        inputs.extend(["trajectory or response pairs", "human preference labels", "policy rollouts"])
    if "reinforcement learning" in lowered or "policy optimization" in lowered or _has_ppo(lowered):
        inputs.extend(["policy parameters", "reward signal", "rollout trajectories"])
    if "self-attention" in lowered or "transformer" in lowered or "relative position" in lowered:
        inputs.extend(["token embeddings", "query/key/value projections", "positional or attention bias terms"])
    if "neural ordinary" in lowered or "neural ode" in lowered or "differential equation" in lowered:
        inputs.extend(["hidden state", "time variable", "ODE solver configuration"])
    if "agent" in lowered or "planning" in lowered:
        inputs.extend(["task state", "agent policy or prompt", "environment feedback"])
    if "audio" in lowered and ("language" in lowered or "speech" in lowered):
        inputs.extend(["audio features", "text prompts or labels", "audio-language training data"])
    if "draft" in lowered or "speculative" in lowered:
        inputs.extend(["draft model proposals", "target model verification logits", "acceptance or tree budget"])
    if "diffusion" in lowered or "ddpm" in lowered:
        inputs.extend(["noisy sample", "diffusion timestep", "conditioning signal"])
    if "segmentation" in lowered and "mri" in lowered:
        inputs.append("semantic segmentation mask")
    if "long context" in lowered or "long-context" in lowered:
        inputs.extend(["long sequence tokens", "positional encoding or attention state"])
    if "kv cache" in lowered:
        inputs.append("KV-cache tensors")
    if "grouped-query" in lowered or "multi-query" in lowered:
        inputs.extend(["query heads", "shared key/value heads", "attention checkpoint"])
    if _is_clustering_research_context(lowered):
        inputs.extend(["data vectors", "cluster count", "centroid initialization"])
    if "activation" in lowered:
        inputs.append("calibration or runtime activations")
    if "weight" in lowered:
        inputs.append("model weights")
    if "kv cache" in lowered or "key" in lowered and "value" in lowered:
        inputs.append("KV-cache tensors")
    if "calibration" in lowered:
        inputs.append("calibration data")
    if not inputs:
        inputs.extend(["the source paper's target system or dataset", "method assumptions from the cited method pages"])
    return inputs


def _generic_method_outputs(method_text: str) -> list[str]:
    contract = _domain_specific_contract(method_text)
    if contract is not None:
        return contract["outputs"]
    lowered = method_text.lower()
    outputs = []
    if "human preference" in lowered or "human feedback" in lowered or "reward model" in lowered or "reward predictor" in lowered:
        outputs.extend(["learned reward model", "policy optimized against predicted preference reward"])
    if "reinforcement learning" in lowered or "policy optimization" in lowered or _has_ppo(lowered):
        outputs.extend(["updated policy", "measured return or task success"])
    if "self-attention" in lowered or "transformer" in lowered:
        outputs.extend(["contextual token representations", "sequence-model predictions"])
    if "relative position" in lowered:
        outputs.append("attention logits or values augmented with relative position information")
    if "neural ordinary" in lowered or "neural ode" in lowered or "differential equation" in lowered:
        outputs.extend(["continuous-depth hidden trajectory", "predictions from ODE solver integration"])
    if "agent" in lowered or "planning" in lowered:
        outputs.extend(["planned actions", "task outcomes", "interaction trace"])
    if "audio" in lowered and ("language" in lowered or "speech" in lowered):
        outputs.extend(["audio-language representations", "speech/audio understanding predictions"])
    if "draft" in lowered or "speculative" in lowered:
        outputs.extend(["verified accepted tokens", "inference speedup without target-distribution change"])
    if "diffusion" in lowered or "ddpm" in lowered:
        outputs.append("denoised or generated sample conditioned on the input signal")
    if "long context" in lowered or "long-context" in lowered:
        outputs.append("extended-context model behavior or evaluation results")
    if "kv cache" in lowered:
        outputs.append("compressed or filtered KV-cache representation")
    if "grouped-query" in lowered or "multi-query" in lowered:
        outputs.append("attention checkpoint with shared key/value heads")
    if _is_clustering_research_context(lowered):
        outputs.extend(["cluster assignments", "centroids", "objective value"])
    if "quantization" in lowered or "quantized" in lowered:
        outputs.append("low-bit quantized model representation")
    if "rotation" in lowered or "hadamard" in lowered:
        outputs.append("rotation-transformed equivalent model")
    if "speedup" in lowered or "latency" in lowered:
        outputs.append("latency or memory-efficiency measurements")
    if not outputs:
        outputs.extend(["the proposed analysis, method, or artifact", "evaluation results tied to the paper's stated problem"])
    return outputs


def _generic_method_assumptions(method_text: str) -> list[str]:
    contract = _domain_specific_contract(method_text)
    if contract is not None:
        return contract["assumptions"]
    lowered = method_text.lower()
    assumptions = []
    if "human preference" in lowered or "human feedback" in lowered or "reward model" in lowered or "reward predictor" in lowered:
        assumptions.append("preference labels are consistent enough for a reward model to guide policy optimization")
    if "reinforcement learning" in lowered or "policy optimization" in lowered or _has_ppo(lowered):
        assumptions.append("rollout reward and evaluation environment match the behavior being optimized")
    if "self-attention" in lowered or "transformer" in lowered:
        assumptions.append("attention computation and positional representation capture the dependencies required by the sequence task")
    if "relative position" in lowered:
        assumptions.append("relative distance information improves sequence modeling without breaking attention computation")
    if "neural ordinary" in lowered or "neural ode" in lowered or "differential equation" in lowered:
        assumptions.append("continuous-time dynamics and solver tolerances are appropriate for the modeled transformation")
    if "agent" in lowered or "planning" in lowered:
        assumptions.append("the environment, tools, and evaluation protocol expose the planning behavior the paper claims to study")
    if "survey" in lowered or "technical report" in lowered:
        assumptions.append("the page is useful as a synthesis map; individual claims still require checking cited primary evidence")
    if "draft" in lowered or "speculative" in lowered:
        assumptions.append("target-model verification preserves the original decoding distribution")
    if "diffusion" in lowered or "ddpm" in lowered:
        assumptions.append("the conditioning signal and noise schedule match the intended generation distribution")
    if "segmentation" in lowered and "mri" in lowered:
        assumptions.append("segmentation masks are spatially aligned with the 3D MRI volumes")
    if "long context" in lowered or "long-context" in lowered:
        assumptions.append("quality must be checked at the target context lengths, not inferred from short-context behavior")
    if "kv cache" in lowered:
        assumptions.append("retained cache entries preserve the information needed for downstream attention")
    if "grouped-query" in lowered or "multi-query" in lowered:
        assumptions.append("shared key/value heads preserve enough attention capacity after adaptation")
    if _is_clustering_research_context(lowered):
        assumptions.append("the clustering objective and initialization assumptions match the claimed theory or algorithm")
    if "calibration" in lowered:
        assumptions.append("calibration data reflects the activation/weight behavior relevant to deployment")
    if "equivalent" in lowered or "invariance" in lowered:
        assumptions.append("the transformation preserves the full-precision computation before quantization")
    if "memory" in lowered and "bottleneck" in lowered:
        assumptions.append("inference is memory-bound enough that compression translates into speed or capacity gains")
    if not assumptions:
        assumptions.append("the paper's stated setting and evaluation protocol are the right scope for reusing the method")
    return assumptions


def _generic_method_implementation_notes(method_text: str) -> list[str]:
    contract = _domain_specific_contract(method_text)
    if contract is not None:
        return contract["implementation_notes"]
    lowered = method_text.lower()
    notes = []
    if "human preference" in lowered or "human feedback" in lowered or "reward model" in lowered or "reward predictor" in lowered:
        notes.append("Log preference-pair construction, labeler agreement, reward-model accuracy, policy reward, and held-out human evaluation separately.")
    if "reinforcement learning" in lowered or "policy optimization" in lowered or _has_ppo(lowered):
        notes.append("Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance.")
    if "self-attention" in lowered or "transformer" in lowered or "relative position" in lowered:
        notes.append("Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases.")
    if "neural ordinary" in lowered or "neural ode" in lowered or "differential equation" in lowered:
        notes.append("Log solver tolerance, number of function evaluations, adjoint gradients, and stability on controlled toy dynamics.")
    if "agent" in lowered or "planning" in lowered:
        notes.append("Record environment state, available tools/actions, planner outputs, execution traces, and success/failure buckets.")
    if "survey" in lowered or "technical report" in lowered:
        notes.append("Use the page as a routing map: extract taxonomy, representative methods, evidence gaps, and primary-paper followups.")
    if "audio" in lowered and ("language" in lowered or "speech" in lowered):
        notes.append("Separate audio encoder, language model, alignment layer, and task-head errors when probing failures.")
    if ("draft" in lowered or "speculative" in lowered) and "speculative actions" not in lowered and "agentic systems" not in lowered:
        notes.append("Log draft acceptance length, rejected branches, verifier cost, and output-distribution equivalence.")
    if "diffusion" in lowered or "ddpm" in lowered:
        notes.append("Unit test timestep/noise schedule, conditioning-channel shapes, and sample evaluation metrics.")
    if "long context" in lowered or "long-context" in lowered:
        notes.append("Sweep context length and separate retrieval/position failures from model-capacity failures.")
    if "kv cache" in lowered:
        notes.append("Measure retention ratio, decode latency, memory footprint, and quality under the same sequence lengths.")
    if "grouped-query" in lowered or "multi-query" in lowered:
        notes.append("Verify Q/K/V tensor grouping shapes and compare MHA/MQA/GQA at matched adaptation budgets.")
    if _is_clustering_research_context(lowered):
        notes.append("Test centroid update monotonicity, initialization sensitivity, and the claimed PCA relationship.")
    if ("rotation" in lowered or "hadamard" in lowered) and "quantization" in lowered:
        notes.append("Verify transformation equivalence before quantizing, then measure quantization error after rotation.")
    if "non-uniform" in lowered or ("k-means" in lowered and _is_clustering_research_context(lowered)):
        notes.append("Keep centroid construction inspectable; compare against uniform quantization as a control.")
    if "sparse" in lowered:
        notes.append("Track sparse retention percentage and runtime/storage overhead alongside accuracy.")
    if not notes:
        notes.extend(
            [
                "Implement the smallest reproducible version of the claimed method or analysis before scaling experiments.",
                "Log inputs, preprocessing choices, intermediate outputs, and final metrics so failures can be localized.",
                "Ablate the central assumption against a simple baseline and compare qualitative errors, not only aggregate scores.",
            ]
        )
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
        record = _component_record(name, acronym, pages)
        if record.get("inputs") or record.get("outputs"):
            candidates[acronym] = record

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
        components.append(
            _source_component(
                name="Quantization Space Utilization Rate",
                short_name="QSUR",
                summary=(
                    "Measures how well transformed values occupy the available quantization levels, giving "
                    "OSTQuant an explicit optimization signal instead of relying only on outlier magnitude."
                ),
                inputs=["transformed tensor values", "quantization levels", "value distribution"],
                outputs=["quantization-space utilization diagnostic", "optimization signal for transform search"],
                assumptions=[
                    "higher space utilization corresponds to lower quantization error",
                    "the metric is computed on calibration tensors representative of deployment inputs",
                ],
                implementation_notes=[
                    "Implement QSUR as a standalone diagnostic and compare it against raw max/min range statistics.",
                    "Log QSUR before and after each transform ablation to verify that the objective moves the intended distribution.",
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

    if primary == "milo":
        components.append(
            _source_component(
                name="Mixture of Low-Rank Compensators",
                short_name="MiLo",
                summary=(
                    "Adds a small mixture of low-rank residual compensators around quantized MoE weights, so "
                    "the quantized model can recover expert-specific error without restoring full-precision weights."
                ),
                inputs=["quantized MoE weights", "expert activations or calibration samples", "low-rank compensator rank/budget"],
                outputs=["quantized MoE model plus low-rank compensators", "expert-specific error compensation"],
                assumptions=[
                    "quantization residuals have enough low-rank structure to compensate cheaply",
                    "compensator routing or placement preserves MoE expert behavior",
                ],
                implementation_notes=[
                    "Ablate quantized weights alone, one shared low-rank adapter, and mixture-of-compensator variants.",
                    "Log per-expert reconstruction error and runtime/memory overhead, not only aggregate accuracy.",
                ],
            )
        )

    if primary == "eagle2":
        components.append(
            _source_component(
                name="Context-aware dynamic draft tree",
                short_name="EAGLE-2",
                summary=(
                    "Builds the speculative-decoding draft tree dynamically from draft-model confidence, so "
                    "verification compute is spent on branches likely to be accepted by the target model."
                ),
                inputs=["draft model hidden features or token probabilities", "target model verifier", "tree size/depth budget"],
                outputs=["context-specific draft tree", "accepted target-model tokens", "lossless inference speedup"],
                assumptions=[
                    "draft confidence is a useful proxy for target-model acceptance probability",
                    "target verification preserves the same output distribution as standard autoregressive decoding",
                ],
                implementation_notes=[
                    "Log draft confidence, accepted length, rejected branches, and target verification cost per example.",
                    "Ablate static tree, dynamic tree without confidence ranking, and full EAGLE-2 under the same target model.",
                ],
            )
        )

    if primary == "med-ddpm":
        components.append(
            _source_component(
                name="Segmentation-conditioned 3D DDPM",
                short_name="Med-DDPM",
                summary=(
                    "Conditions a 3D denoising diffusion model on semantic brain segmentation masks so synthetic "
                    "MRI volumes follow specified anatomy rather than only matching a marginal image distribution."
                ),
                inputs=["3D noisy MRI volume", "diffusion timestep", "semantic segmentation mask"],
                outputs=["synthetic 3D brain MRI", "augmentation or anonymized image samples tied to anatomy"],
                assumptions=[
                    "segmentation masks encode the anatomy that downstream users need to control",
                    "diffusion samples are judged by both image realism and downstream segmentation utility",
                ],
                implementation_notes=[
                    "Unit test channel concatenation and spatial alignment between noisy volume and segmentation mask.",
                    "Evaluate generated images with both visual/statistical metrics and downstream segmentation Dice.",
                ],
            )
        )

    if primary == "gqa":
        components.append(
            _source_component(
                name="Grouped-query attention checkpoint conversion",
                short_name="GQA",
                summary=(
                    "Converts multi-head attention checkpoints into grouped-query attention by sharing key/value "
                    "heads across groups, trading a small quality adaptation step for lower decode-time memory bandwidth."
                ),
                inputs=["multi-head attention checkpoint", "number of query groups", "uptraining data/budget"],
                outputs=["grouped-query attention checkpoint", "reduced KV-cache memory/bandwidth"],
                assumptions=[
                    "key/value head sharing preserves enough attention capacity after uptraining",
                    "decode speed or memory is bottlenecked by KV-cache bandwidth",
                ],
                implementation_notes=[
                    "Check tensor reshaping for Q heads versus grouped K/V heads before training.",
                    "Compare MHA, MQA, and multiple GQA group counts at the same uptraining budget.",
                ],
            )
        )

    if primary == "qil":
        components.append(
            _source_component(
                name="Quantization Interval Learning",
                short_name="QIL",
                summary=(
                    "Learns quantization interval parameters jointly with task loss so clipping/pruning and "
                    "bit assignment are optimized for network accuracy instead of fixed min-max ranges."
                ),
                inputs=["full-precision weights or activations", "learnable interval parameters", "task loss"],
                outputs=["quantized weights/activations", "learned quantization intervals", "low-bit network"],
                assumptions=[
                    "task-loss optimization can choose better quantization intervals than static calibration",
                    "progressive finetuning is needed for very low-bit settings",
                ],
                implementation_notes=[
                    "Implement interval parameters as trainable quantizer state and verify gradients flow through the quantizer surrogate.",
                    "Ablate learned intervals, fixed intervals, and progressive finetuning at 4/3/2-bit settings.",
                ],
            )
        )

    if primary == "lsqplus":
        components.append(
            _source_component(
                name="Learned step size with offset quantization",
                short_name="LSQ+",
                summary=(
                    "Extends learned step-size quantization by learning offsets and improving initialization, "
                    "so low-bit activation/weight quantizers fit asymmetric tensor distributions better."
                ),
                inputs=["weights or activations", "learnable scale", "learnable offset", "initialization statistics"],
                outputs=["quantized tensor", "learned scale/offset parameters"],
                assumptions=[
                    "asymmetric offsets reduce low-bit error for activation distributions",
                    "initialization strongly affects quantizer training stability",
                ],
                implementation_notes=[
                    "Unit test scale and offset gradients separately from the straight-through estimator.",
                    "Compare symmetric LSQ, LSQ+ offset, and initialization variants at matched bit widths.",
                ],
            )
        )

    if primary == "qvlm":
        components.append(
            _source_component(
                name="Block-wise rounding search for LVLM PTQ",
                short_name="Q-VLM",
                summary=(
                    "Searches quantized rounding functions block by block for large vision-language models, using "
                    "output quantization error to keep multimodal reasoning accurate under low-bit weights/activations."
                ),
                inputs=["LVLM blocks", "calibration multimodal samples", "candidate rounding functions"],
                outputs=["low-bit LVLM", "selected rounding functions", "memory/speed reduction"],
                assumptions=[
                    "block output error is a useful proxy for downstream multimodal reasoning quality",
                    "the calibration set covers vision-language activation behavior",
                ],
                implementation_notes=[
                    "Keep text tower, vision tower, and projector quantization errors separately inspectable.",
                    "Ablate candidate rounding-function search depth and joint-layer constraints against VQA accuracy and memory.",
                ],
            )
        )

    if primary == "vjepa":
        components.append(
            _source_component(
                name="Latent video joint embedding predictive learning",
                short_name="V-JEPA",
                summary=(
                    "Learns video representations by predicting masked or future latent embeddings rather than reconstructing pixels, "
                    "then uses those representations for downstream understanding, prediction, or planning."
                ),
                inputs=["video frames or clips", "masked latent targets", "joint embedding predictor", "downstream task data"],
                outputs=["latent video representations", "perception or planning task predictions"],
                assumptions=[
                    "latent-space prediction captures useful world structure without requiring pixel-level generation",
                    "downstream gains should be separated by pretraining, probing, and finetuning stage",
                ],
                implementation_notes=[
                    "Track masking strategy, latent prediction loss, probe accuracy, and downstream finetuning metrics separately.",
                    "Ablate representation pretraining, predictor depth, and action-conditioning before attributing planning gains.",
                ],
            )
        )

    if primary == "vljepa":
        components.append(
            _source_component(
                name="Vision-language joint embedding predictive architecture",
                short_name="VL-JEPA",
                summary=(
                    "Trains a vision-language model in embedding space rather than token reconstruction: caption "
                    "pretraining aligns image/text embeddings, then supervised finetuning adds VQA and classification behavior."
                ),
                inputs=["image embeddings", "text/caption embeddings", "query-conditioned prediction target", "SFT data"],
                outputs=["aligned vision-language embedding model", "VQA-capable finetuned model"],
                assumptions=[
                    "embedding prediction is sufficient for useful vision-language alignment",
                    "query-conditioned SFT transfers the pretrained representation to downstream tasks",
                ],
                implementation_notes=[
                    "Separate pretraining alignment loss from SFT VQA loss in logs and ablations.",
                    "Evaluate retrieval/classification and VQA separately because they probe different stages.",
                ],
            )
        )

    if primary == "longrope":
        components.append(
            _source_component(
                name="LongRoPE context-window extension",
                short_name="LongRoPE",
                summary=(
                    "Searches and progressively extends RoPE scaling factors so an LLM can move from its original "
                    "context window to very long contexts while preserving short-context quality."
                ),
                inputs=["RoPE dimensions", "target context length", "extension/search schedule", "long-context calibration/evaluation data"],
                outputs=["extended-context LLM", "RoPE scaling configuration"],
                assumptions=[
                    "positional interpolation/extrapolation quality can be preserved by staged scaling",
                    "short-context regression and long-context retrieval must both be evaluated",
                ],
                implementation_notes=[
                    "Log short-context perplexity and long-context passkey/retrieval scores for every scaling stage.",
                    "Ablate search budget, progressive extension stages, and retained dimensions.",
                ],
            )
        )

    if primary == "kangaroo":
        components.append(
            _source_component(
                name="Double early-exit self-speculative decoding",
                short_name="Kangaroo",
                summary=(
                    "Uses early-exit branches inside the same model to draft tokens, then verifies them with deeper layers, "
                    "reducing latency without requiring a separate draft model."
                ),
                inputs=["intermediate hidden states", "early-exit draft heads", "final-layer verifier"],
                outputs=["draft tokens", "verified accepted tokens", "lossless self-speculative speedup"],
                assumptions=[
                    "early exits are aligned enough with the final model to achieve useful acceptance rates",
                    "verification preserves the final model distribution",
                ],
                implementation_notes=[
                    "Log acceptance rate by exit depth and prompt type.",
                    "Compare single early exit, double early exit, and full decoding under identical sampling settings.",
                ],
            )
        )

    if primary == "mixtral":
        components.append(
            _source_component(
                name="Sparse mixture-of-experts decoder",
                short_name="Mixtral",
                summary=(
                    "Uses sparse top-k expert routing in each feed-forward block so inference activates only a subset "
                    "of experts per token while keeping a larger total parameter budget."
                ),
                inputs=["token hidden states", "router logits", "expert FFN weights", "top-k routing rule"],
                outputs=["expert-weighted FFN output", "sparse activated parameter path"],
                assumptions=[
                    "router load and expert specialization preserve quality without dense FFN cost",
                    "serving stack can handle expert dispatch efficiently",
                ],
                implementation_notes=[
                    "Log expert utilization, routing entropy, and per-token top-k assignments.",
                    "Separate model-quality comparisons from serving throughput and memory placement constraints.",
                ],
            )
        )

    if primary == "curve-skeleton":
        components.append(
            _source_component(
                name="Curve skeleton from incomplete point clouds",
                short_name="CurveSkeleton",
                summary=(
                    "Extracts a curve skeleton from incomplete point-cloud geometry by recovering a medial structure "
                    "that preserves topology despite missing surface observations."
                ),
                inputs=["incomplete point cloud", "local geometry neighborhoods", "skeleton regularization parameters"],
                outputs=["curve skeleton graph", "topology-preserving shape abstraction"],
                assumptions=[
                    "local point geometry is sufficient to infer the underlying medial structure",
                    "regularization can bridge missing observations without inventing wrong topology",
                ],
                implementation_notes=[
                    "Test on synthetic missing-surface cases with known skeleton topology.",
                    "Track connectivity, branch pruning, and sensitivity to point density separately.",
                ],
            )
        )

    if primary == "film":
        components.append(
            _source_component(
                name="Feature-wise Linear Modulation",
                short_name="FiLM",
                summary=(
                    "Predicts per-feature affine modulation parameters from a conditioning input, then applies them "
                    "inside a visual reasoning network so language can steer visual feature processing."
                ),
                inputs=["visual feature maps", "question or conditioning embedding", "per-channel gamma and beta"],
                outputs=["modulated visual features", "conditioned reasoning behavior"],
                assumptions=[
                    "feature-wise affine modulation is expressive enough to inject question semantics",
                    "conditioning quality determines which visual features are emphasized or suppressed",
                ],
                implementation_notes=[
                    "Log gamma/beta distributions by layer and question type.",
                    "Ablate modulation placement, gamma-only, beta-only, and no-conditioning baselines.",
                ],
            )
        )

    if primary == "eagle":
        components.append(
            _source_component(
                name="Feature-level speculative draft model",
                short_name="EAGLE",
                summary=(
                    "Drafts future tokens from feature-level uncertainty rather than only token logits, then verifies "
                    "with the target model to preserve speculative sampling correctness."
                ),
                inputs=["target-model hidden features", "draft head/model", "verification step"],
                outputs=["draft tokens", "accepted verified tokens", "speculative speedup"],
                assumptions=[
                    "feature uncertainty predicts useful draft candidates",
                    "target verification preserves the original sampling distribution",
                ],
                implementation_notes=[
                    "Log feature uncertainty, acceptance rate, and rejection reasons per decoding step.",
                    "Compare token-level and feature-level draft strategies under identical target-model verification.",
                ],
            )
        )

    return components


def _primary_paper_key(pages: list[PageExtraction]) -> str:
    if not pages:
        return ""
    header = _normalize(" ".join(page.text[:1200] for page in pages[:3])).lower()
    patterns = (
        ("codequant", ("codequant",)),
        ("moequant", ("moequant",)),
        ("duquant", ("duquant",)),
        ("flatquant", ("flatquant",)),
        ("affinequant", ("affinequant",)),
        ("quarot", ("quarot",)),
        ("spinquant", ("spinquant",)),
        ("dfrot", ("dfrot",)),
        ("ostquant", ("ostquant",)),
        ("qep", ("quantization error propagation",)),
        ("omniquant", ("omniquant",)),
        ("squeezellm", ("squeezellm",)),
        ("smoothquant", ("smoothquant",)),
        ("llm.int8", ("llm.int8", "8-bit matrix multiplication")),
        ("massive-activations", ("massive activations in large language models",)),
        ("milo", ("milo", "mixture of low-rank")),
        ("eagle2", ("eagle-2", "dynamic draft")),
        ("med-ddpm", ("conditional diffusion", "semantic 3d brain mri")),
        ("gqa", ("gqa", "grouped-query attention")),
        ("qil", ("quantization interval", "qil")),
        ("lsqplus", ("lsq+", "learnable offsets")),
        ("qvlm", ("q-vlm", "vision-language")),
        ("vjepa", ("v-jepa", "video")),
        ("vljepa", ("vl-jepa", "joint embedding predictive")),
        ("longrope", ("longrope",)),
        ("kangaroo", ("kangaroo", "self-speculative")),
        ("mixtral", ("mixtral of experts",)),
        ("curve-skeleton", ("curve skeleton extraction", "incomplete point cloud")),
        ("film", ("film", "feature-wise linear modulation")),
        ("eagle", ("eagle", "feature uncertainty")),
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
    if re.fullmatch(r"R\d+", acronym):
        return False
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
            "speculative",
            "draft",
            "verification",
            "diffusion",
            "denoising",
            "conditioning",
            "attention",
            "kv cache",
            "long context",
            "k-means",
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
        domain_narrative = _single_method_domain_narrative(method_name, first)
        if domain_narrative:
            return domain_narrative
        summary = str(first.get("summary") or "").rstrip(".")
        inputs = ", ".join(first.get("inputs") or [])
        outputs = ", ".join(first.get("outputs") or [])
        io = ""
        if inputs or outputs:
            io = f" It operates on {inputs or 'the paper inputs'} and produces {outputs or 'the reported outputs'}."
        return f"{method_name}: {summary}.{io}"

    return f"{method_name}: method structure was not extracted deeply enough yet."


def _single_method_domain_narrative(method_name: str, record: dict[str, Any]) -> str:
    inputs = [str(item) for item in record.get("inputs") or []]
    outputs = [str(item) for item in record.get("outputs") or []]
    assumptions = [str(item) for item in record.get("assumptions") or []]
    input_text = " ".join(inputs).lower()
    output_text = " ".join(outputs).lower()
    assumption_text = " ".join(assumptions).lower()
    if "kv-cache tensors" in input_text or "kv-cache" in output_text:
        return (
            f"{method_name} is a KV-cache compression method: it decides which cached key/value entries to retain "
            "under a memory or cache-budget constraint, then checks whether the retained cache still preserves "
            "long-context attention behavior. Its reusable contract is cache selection policy -> compressed KV cache "
            "-> quality/runtime tradeoff, with retention ratio, tensor-shape correctness, sequence length, memory, "
            "latency, and task quality logged together."
        )
    if "query/key/value tiles" in input_text or "kernel throughput" in output_text:
        return (
            f"{method_name} is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU "
            "memory and compute units so attention runs faster without changing the attention result. Treat the "
            "core contract as schedule/precision/memory movement -> attention output -> throughput plus numerical-error checks."
        )
    if "agent state" in input_text and "verified committed actions" in output_text:
        return (
            f"{method_name} accelerates agent workflows by speculating future actions with a faster model, executing "
            "or preparing them tentatively, and then using a slower executor or verifier to commit or roll back the trace. "
            "The important checks are equivalence to sequential execution, rollback behavior, environment/tool state, latency, and task success."
        )
    if "audio" in input_text and "language" in output_text:
        return (
            f"{method_name} connects audio representations to language-model behavior. Read it as an audio encoder/alignment/"
            "decoder contract, where task tags and audio preprocessing determine whether speech, music, sound, and audio-QA evidence transfer."
        )
    if "video" in input_text and "latent predictive representations" in output_text:
        return (
            f"{method_name} learns video representations by predicting masked targets in latent space rather than reconstructing pixels. "
            "The reusable question is whether latent prediction, masking, encoder freezing, and finetuning protocol produce representations "
            "that help downstream perception or planning."
        )
    if "pde residual" in input_text:
        return (
            f"{method_name} constrains a neural approximator with PDE residuals and boundary/initial conditions. "
            "Judge it by whether residual computation, collocation sampling, data loss, physics loss, and inverse-parameter recovery are separately inspectable."
        )
    if "cluster count" in input_text and "centroids" in output_text:
        return (
            f"{method_name} is a clustering method/theory paper: it studies how data vectors are assigned to centroids "
            "and which objective or initialization assumptions make the PCA or representation-learning connection valid."
        )
    if "surveyed primary papers" in input_text:
        return (
            f"{method_name} is a literature-map page, not a primary algorithm: it organizes primary papers by taxonomy dimensions "
            "and should be used to choose follow-up sources, comparison axes, and evidence gaps."
        )
    if "preference labels" in input_text or "reference-policy" in assumption_text:
        return (
            f"{method_name} turns preference data into a policy-optimization objective. The reusable contract is preference pairs "
            "and a reference policy -> loss/reward signal -> aligned policy behavior, with KL/reference-model assumptions kept explicit."
        )
    return ""


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
                    "SmoothQuant uses the equivalent scaling transform "
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
    if primary == "milo":
        facts.append(
            _mechanism_fact(
                fact_type="representation",
                component="MiLo",
                summary=(
                    "MiLo should be read as quantized MoE weights plus low-rank residual compensation; the important question is "
                    "whether the compensator budget captures expert-specific quantization error cheaply enough."
                ),
                page=_find_page(pages, "Mixture of Low-Rank", "low-rank compensator", "MiLo"),
            )
        )
    if primary == "eagle2":
        facts.append(
            _mechanism_fact(
                fact_type="algorithm",
                component="EAGLE-2 dynamic draft tree",
                summary=(
                    "EAGLE-2 spends speculative-decoding branches according to context-dependent draft confidence rather than a fixed tree, "
                    "then relies on target-model verification to preserve lossless decoding."
                ),
                page=_find_page(pages, "dynamic draft tree", "context-aware", "acceptance rate"),
            )
        )
    if primary == "med-ddpm":
        facts.append(
            _mechanism_fact(
                fact_type="conditioning",
                component="Med-DDPM",
                summary=(
                    "Med-DDPM conditions a 3D DDPM with semantic masks: segmentation masks steer generated MRI anatomy while the "
                    "denoising model handles image synthesis."
                ),
                page=_find_page(pages, "semantic 3D", "segmentation", "conditional diffusion"),
            )
        )
    if primary == "gqa":
        facts.append(
            _mechanism_fact(
                fact_type="architecture_conversion",
                component="Grouped-query attention",
                summary=(
                    "GQA converts attention checkpoints by sharing key/value heads across query groups, sitting between MHA quality and MQA speed/memory."
                ),
                page=_find_page(pages, "grouped-query attention", "multi-query", "checkpoint"),
            )
        )
    if primary == "qil":
        facts.append(_mechanism_fact("quantizer_objective", "QIL", "QIL's key object is a learnable quantization interval optimized with task loss, so implementation should treat interval parameters as trainable quantizer state rather than fixed clipping thresholds.", _find_page(pages, "quantization interval", "task loss", "QIL")))
    if primary == "lsqplus":
        facts.append(_mechanism_fact("quantizer_parameterization", "LSQ+", "LSQ+ extends learned step-size quantization with learnable offsets and initialization choices; scale and offset behavior should be checked separately.", _find_page(pages, "learnable offsets", "LSQ+", "initialization")))
    if primary == "qvlm":
        facts.append(_mechanism_fact("objective", "Q-VLM", "Q-VLM searches rounding functions for LVLM blocks using output quantization error, so method evidence should be tied to block output reconstruction and downstream multimodal accuracy.", _find_page(pages, "rounding function", "output quantization errors", "Q-VLM")))
    if primary == "vljepa":
        facts.append(_mechanism_fact("training_stage", "VL-JEPA", "VL-JEPA separates caption-based vision-language alignment from supervised finetuning; retrieval should keep pretraining representation claims separate from VQA/classification SFT claims.", _find_page(pages, "pretraining stage", "supervised finetuning", "VL-JEPA")))
    if primary == "longrope":
        facts.append(_mechanism_fact("position_scaling", "LongRoPE", "LongRoPE is about searching/staging RoPE scaling for extreme context extension; evaluate both long-context retrieval and short-context regression.", _find_page(pages, "LongRoPE", "context window", "RoPE")))
    if primary == "kangaroo":
        facts.append(_mechanism_fact("self_speculative_decoding", "Kangaroo", "Kangaroo drafts from early exits inside the same model and verifies with deeper layers, so acceptance rate by exit depth is the central mechanism metric.", _find_page(pages, "early exiting", "self-speculative", "Kangaroo")))
    if primary == "mixtral":
        facts.append(_mechanism_fact("expert_routing", "Mixtral", "Mixtral's mechanism is sparse top-k expert routing inside decoder FFNs; understanding should focus on router decisions, expert utilization, and sparse serving cost.", _find_page(pages, "router", "experts", "Mixtral")))
    if primary == "curve-skeleton":
        facts.append(_mechanism_fact("geometry_abstraction", "Curve skeleton", "The geometry method should be judged by whether it preserves skeleton topology from incomplete point observations, not by generic reconstruction accuracy.", _find_page(pages, "curve skeleton", "incomplete point cloud", "topology")))
    if primary == "film":
        facts.append(_mechanism_fact("conditioning_layer", "FiLM", "FiLM applies feature-wise affine modulation conditioned on language; the implementation-critical object is gamma/beta parameters per feature channel.", _find_page(pages, "Feature-wise Linear Modulation", "gamma", "beta")))
    if primary == "eagle":
        facts.append(_mechanism_fact("drafting_signal", "EAGLE", "EAGLE-style speculative sampling should be judged by how feature uncertainty creates draft candidates and how target verification preserves correctness.", _find_page(pages, "feature uncertainty", "speculative sampling", "EAGLE")))

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
                    "CodeQuant A4W4 is a weight-activation MoE quantization setting rather than ordinary 4-bit weight-only quantization: "
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
    facts.extend(_visual_mechanism_facts(pages, existing_pages={_fact_page(fact) for fact in facts}))
    return facts


def _visual_mechanism_facts(pages: list[PageExtraction], *, existing_pages: set[int | None]) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []
    for page in pages:
        if page.page_number in existing_pages:
            continue
        snippet = _visual_caption_snippet(page.text)
        if not snippet:
            continue
        fact_type = _visual_fact_type(snippet)
        component = _visual_fact_component(snippet)
        facts.append(_mechanism_fact(fact_type, component, snippet, page))
        if len(facts) >= 4:
            break
    return facts


def _fact_page(fact: dict[str, Any]) -> int | None:
    provenance = fact.get("provenance") or []
    if not provenance:
        return None
    page = provenance[0].get("page")
    return int(page) if isinstance(page, int) else None


def _visual_caption_snippet(text: str) -> str:
    candidates: list[str] = []
    for sentence in _sentences(text):
        lowered = sentence.lower()
        if not any(marker in lowered for marker in ("figure ", "fig. ", "table ", "algorithm ", "equation ", "eq. ", "theorem ")):
            continue
        if _bad_visual_caption_sentence(sentence):
            continue
        candidates.append(_clip_sentence(sentence, 240))
    if candidates:
        return candidates[0]
    return ""


def _visual_fact_type(snippet: str) -> str:
    lowered = snippet.lower()
    if "algorithm" in lowered:
        return "algorithm"
    if "equation" in lowered or "eq. " in lowered or "theorem" in lowered:
        return "equation_or_theorem"
    if "table" in lowered and any(marker in lowered for marker in ("result", "benchmark", "accuracy", "latency", "throughput", "memory", "score")):
        return "result_table"
    if "table" in lowered:
        return "table"
    if any(marker in lowered for marker in ("ablation", "effect of", "component")):
        return "ablation_figure"
    if any(marker in lowered for marker in ("architecture", "framework", "pipeline", "overview", "workflow")):
        return "mechanism_figure"
    return "figure"


def _visual_fact_component(snippet: str) -> str:
    lowered = snippet.lower()
    if "algorithm" in lowered:
        return "Algorithm detail"
    if "equation" in lowered or "eq. " in lowered:
        return "Equation detail"
    if "theorem" in lowered:
        return "Theorem detail"
    if "table" in lowered:
        return "Result table" if _visual_fact_type(snippet) == "result_table" else "Table detail"
    if "figure" in lowered or "fig. " in lowered:
        return "Mechanism figure" if _visual_fact_type(snippet) == "mechanism_figure" else "Figure detail"
    return "Visual evidence"


def _clip_sentence(sentence: str, limit: int) -> str:
    cleaned = _normalize(sentence)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."


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
    notes.extend(_primary_implementation_notes(pages))
    notes.extend(_domain_implementation_backfill(method_records, pages))
    if "Equation" in text or re.search(r"\(\d+\)", text):
        notes.append("Equation-bearing sections exist; turn each extracted objective or transform into a shape/value unit test before trusting results.")
    if "Algorithm" in text:
        notes.append("Algorithm boxes are present; preserve their inputs/outputs as implementation tests.")
    notes.extend(_research_workflow_fallback_notes(method_records, pages, current_count=len(notes)))
    return _dedupe(notes)[:10]


def _research_workflow_fallback_notes(
    method_records: list[dict[str, Any]],
    pages: list[PageExtraction],
    *,
    current_count: int,
) -> list[str]:
    if current_count >= 5:
        return []
    method_label = _human_list(
        [
            str(record.get("short_name") or record.get("name"))
            for record in method_records[:2]
            if record.get("short_name") or record.get("name")
        ],
        "the core method",
    )
    text = _normalize(" ".join(page.text for page in pages[:8]) + " " + _method_record_text(method_records)).lower()
    notes = [
        f"Trace one small example through {method_label}: record inputs, intermediate states, outputs, and the exact metric or qualitative behavior it changes.",
        f"Compare {method_label} against the simplest credible baseline under the same data split, seed, configuration, and evaluation script.",
        f"Ablate the strongest assumption behind {method_label} and label which claim the ablation would support, weaken, or falsify.",
        "Store command, config, commit hash, seed, source page, and representative failure cases so later wiki retrieval can connect code results back to paper evidence.",
    ]
    if "table" in text or "figure" in text:
        notes.append("Recreate the most decision-relevant table or figure from logs before treating the implementation as faithful.")
    if "dataset" in text or any(dataset.lower() in text for dataset in KNOWN_DATASETS):
        notes.append("Validate dataset preprocessing, split boundaries, label mapping, and metric definitions before comparing against reported results.")
    return notes


def _domain_implementation_backfill(method_records: list[dict[str, Any]], pages: list[PageExtraction]) -> list[str]:
    text = _normalize(" ".join(page.text for page in pages[:8]) + " " + _method_record_text(method_records)).lower()
    notes: list[str] = []
    if _is_quantization_research_context(text, pages):
        notes.extend(
            [
                "Quantization: Log pre/post-quantization error by layer and separate weight, activation, and cache paths when applicable.",
                "Quantization: Compare the claimed method against a fixed-rounding or min-max baseline at matched bit width and calibration data.",
                "Quantization: Test tensor scale, zero-point, clipping, and dequantization shapes before running full experiments.",
            ]
        )
    if "flashattention" in text or ("hopper" in text and "attention" in text):
        notes.extend(
            [
                "Attention kernel: Profile memory movement, matmul, softmax, synchronization, and end-to-end throughput separately.",
                "Attention kernel: Compare low-precision outputs against exact attention to isolate numerical error from scheduling changes.",
            ]
        )
    if "speculative actions" in text or "agentic systems" in text:
        notes.extend(
            [
                "Agent workflow: Record speculative action traces, verifier decisions, rollback/replay events, and environment/tool state.",
                "Agent workflow: Compare against sequential ground-truth execution before treating speedup as lossless.",
            ]
        )
    if "qwen-audio" in text or "audio-language" in text or "audio understanding" in text:
        notes.extend(
            [
                "Audio-language: Separate audio preprocessing, encoder alignment, decoder prompting, and task-specific evaluation errors.",
                "Audio-language: Evaluate speech, music, sound-event, and audio-QA tasks separately before aggregating results.",
            ]
        )
    if "jepa" in text and ("video" in text or "joint embedding" in text):
        notes.extend(
            [
                "Representation learning: Log masked-target construction, latent prediction loss, representation probes, and downstream task splits.",
                "Representation learning: Ablate encoder freezing, predictor depth, and finetuning protocol before attributing planning or perception gains.",
            ]
        )
    if _is_kv_cache_efficiency_text(text):
        notes.extend(
            [
                "KV-cache: Verify K/V tensor shapes, position indices, attention masks, and cache updates after compression.",
                "KV-cache: Sweep retention ratio, cache budget, and sequence length while logging memory, latency, and task quality.",
            ]
        )
    if "vision-language" in text or "vlm" in text or "multimodal" in text:
        notes.extend(
            [
                "Vision-language: Evaluate text-only, image-only, and multimodal examples separately to localize modality-specific failures.",
                "Vision-language: Log calibration or training examples by task type so VQA, retrieval, and classification evidence are not mixed.",
            ]
        )
    if ("speculative" in text or "draft" in text) and "speculative actions" not in text and "agentic systems" not in text:
        notes.extend(
            [
                "Speculative decoding: Measure acceptance rate, verifier calls, accepted-token length, and latency under the same sampling settings.",
                "Speculative decoding: Test output equivalence against ordinary decoding before trusting speed numbers.",
            ]
        )
    if (
        "long-context" in text
        or "longrope" in text
        or "context window" in text
        or ("long context" in text and ("language model" in text or "llm" in text or "sequence length" in text))
        or re.search(r"\brope\b", text)
    ) and not ("survey" in text and "autonomous agent" in text):
        notes.extend(
            [
                "Long context: Sweep sequence length and record both long-context task success and short-context regression.",
                "Long context: Keep positional-scaling settings in config so failures can be attributed to context extension rather than model logic.",
            ]
        )
    if "skeleton" in text or "point cloud" in text or "mesh" in text:
        notes.extend(
            [
                "3D geometry: Test controlled synthetic shapes with known topology before using real incomplete scans.",
                "3D geometry: Log connectivity, branch count, pruning thresholds, and sensitivity to point density.",
            ]
        )
    if "conditional diffusion" in text or "denoising diffusion" in text or "ddpm" in text or ("mri" in text and "segmentation" in text):
        notes.extend(
            [
                "Diffusion: Test noise schedule, timestep embedding, and conditioning tensor alignment with small synthetic batches.",
                "Diffusion: Evaluate generated samples with both realism and downstream task metrics.",
            ]
        )
    return notes


def _primary_implementation_notes(pages: list[PageExtraction]) -> list[str]:
    primary = _primary_paper_key(pages)
    if primary == "llm.int8":
        return [
            "LLM.int8: Track the outlier threshold sweep separately from int8 kernel speed because accuracy and runtime move through different mechanisms.",
            "LLM.int8: Test dense-path and outlier-path matmul outputs before summing them.",
        ]
    if primary == "smoothquant":
        return [
            "SmoothQuant: Sweep alpha and record activation range, weight range, perplexity, and latency for each O1/O2/O3 setting.",
            "SmoothQuant: Verify the equivalent transform in full precision before quantizing either side.",
        ]
    if primary == "quarot":
        return [
            "QuaRot: Test every inserted rotation pair for full-precision output invariance before INT4 quantization.",
            "QuaRot: Profile KV-cache quantization separately from weight/activation matmul because it affects memory and decoding paths differently.",
        ]
    if primary == "spinquant":
        return [
            "SpinQuant: Compare learned rotations against multiple random rotation seeds under the same W/A/KV bit setting.",
            "SpinQuant: Log orthogonality error after Cayley updates so rotation learning does not silently break invariance.",
        ]
    if primary == "duquant":
        return [
            "DuQuant: Measure massive-outlier and normal-outlier dispersion before and after block rotation plus zigzag permutation.",
            "DuQuant: Ablate first rotation, permutation, and second rotation independently under W4A4 and W6A6.",
        ]
    if primary == "flatquant":
        return [
            "FlatQuant: Log distribution flatness before and after each affine transform and tie it to quantization error.",
            "FlatQuant: Profile decomposed transform overhead separately from quantized matmul speedup.",
        ]
    if primary == "dfrot":
        return [
            "DFRot: Inspect hard-token weights in the long-tail loss and verify they align with massive activation positions.",
            "DFRot: Compare refined rotation against randomized Hadamard and SpinQuant-style learned rotations under the same W4A4 protocol.",
        ]
    if primary == "ostquant":
        return [
            "OSTQuant: Treat QSUR as a first-class metric; log it before/after orthogonal and scaling transforms.",
            "OSTQuant: Separate orthogonal-only, scaling-only, and combined transform ablations before reporting final PTQ gains.",
        ]
    if primary == "qep":
        return [
            "QEP: Store previous-layer quantization error tensors and verify the next-layer objective actually consumes them.",
            "QEP: Sweep propagation strength and compare layer reconstruction error against end-task metrics.",
        ]
    if primary == "moequant":
        return [
            "MoEQuant: Track expert usage entropy before and after EBSS to confirm calibration is expert-balanced.",
            "MoEQuant: Ablate EBSS and AGQ separately because one changes sample selection and the other changes expert weighting.",
        ]
    if primary == "massive-activations":
        return [
            "Massive activations: Record layer, feature dimension, token type, and intervention value for every localization claim.",
            "Massive activations: Separate descriptive plots from causal interventions when deciding whether the activation is functional.",
        ]
    if primary == "squeezellm":
        return [
            "SqueezeLLM: Compare dense non-uniform quantization against dense+sparse retention at the same memory budget.",
            "SqueezeLLM: Track sparse index overhead separately from centroid/codebook storage.",
        ]
    if primary == "omniquant":
        return [
            "OmniQuant: Log block reconstruction loss for learnable clipping and equivalent-transform parameters separately.",
            "OmniQuant: Compare weight-only and weight-activation settings with the same calibration samples.",
        ]
    if primary == "affinequant":
        return [
            "AffineQuant: Log transform condition number and diagonal dominance during gradual mask optimization.",
            "AffineQuant: Compare scaling-only, translation-only, and full affine transforms under the same W/A bit-width.",
        ]
    if primary == "milo":
        return [
            "MiLo: Compare quantized MoE without compensation, a shared low-rank compensator, and mixture-specific compensators at the same memory budget.",
            "MiLo: Log per-expert quantization residuals and compensator rank so aggregate accuracy does not hide expert failure modes.",
        ]
    if primary == "eagle2":
        return [
            "EAGLE-2: Log draft confidence, accepted tokens, rejected branches, and verifier calls for every dynamic tree decision.",
            "EAGLE-2: Compare fixed draft trees and context-aware dynamic trees under the same target model and decoding settings.",
        ]
    if primary == "med-ddpm":
        return [
            "Med-DDPM: Unit test 3D tensor alignment between noisy MRI volumes, timesteps, and segmentation masks.",
            "Med-DDPM: Judge synthetic images by downstream segmentation utility and realism metrics rather than visual examples alone.",
        ]
    if primary == "gqa":
        return [
            "GQA: Verify attention tensor shapes after converting multi-head checkpoints into grouped key/value heads.",
            "GQA: Sweep group count and uptraining budget while recording memory bandwidth, speed, and quality.",
        ]
    return []


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
    if primary == "llm.int8":
        takeaways.append("LLM.int8 evidence should separate scale-quality claims from mixed-precision outlier handling and from kernel/runtime gains.")
    if primary == "omniquant":
        takeaways.append("OmniQuant evidence should be read as block-wise PTQ calibration evidence; compare weight-only and weight-activation settings without treating it as full QAT.")
    if primary == "affinequant":
        takeaways.append("AffineQuant evidence should tie gains to the larger affine transform search space, especially very low-bit W4A4 settings against OmniQuant/AWQ-style baselines.")
    if primary == "flatquant":
        takeaways.append("FlatQuant evidence should keep flatness/quantization-error reductions separate from transform-overhead and speed claims.")
    if primary == "dfrot":
        takeaways.append("DFRot evidence should focus on whether refined weighted rotation improves massive-activation-heavy tokens beyond randomized rotation baselines.")
    if primary == "ostquant":
        takeaways.append("OSTQuant evidence should verify that QSUR improvement correlates with downstream PTQ accuracy rather than only better-looking distributions.")
    if primary == "qep":
        takeaways.append("QEP evidence should compare layer-wise reconstruction with and without propagated previous-layer error, then check whether that reduces end-task degradation.")
    if primary == "moequant":
        takeaways.append("MoEQuant evidence should separate EBSS calibration coverage, AGQ expert weighting, and final task/runtime gains for MoE models.")
    if primary == "massive-activations":
        takeaways.append("Massive-activation evidence should separate localization plots from causal interventions such as fixing or removing activation values.")
    if primary == "milo":
        takeaways.append("MiLo evidence should separate MoE quantization quality from compensator overhead; per-expert error and memory budget matter as much as aggregate scores.")
    if primary == "eagle2":
        takeaways.append("EAGLE-2 evidence should separate lossless decoding correctness, acceptance-rate behavior, and wall-clock speedup under the same target/draft model pair.")
    if primary == "med-ddpm":
        takeaways.append("Med-DDPM evidence should connect generated MRI realism to semantic-control and downstream segmentation metrics; visual examples alone are not sufficient.")
    if primary == "gqa":
        takeaways.append("GQA evidence should compare MHA, MQA, and GQA under matched checkpoint/uptraining conditions while separating quality from memory-bandwidth gains.")
    if primary == "qil":
        takeaways.append("QIL evidence should separate learned interval quality, progressive finetuning effects, and bit-width-specific ImageNet accuracy.")
    if primary == "lsqplus":
        takeaways.append("LSQ+ evidence should isolate offset learning and initialization effects from the base learned step-size quantizer.")
    if primary == "qvlm":
        takeaways.append("Q-VLM evidence should connect block rounding-search objectives to multimodal VQA accuracy, memory compression, and generation speed separately.")
    if primary == "vjepa":
        takeaways.append("V-JEPA evidence should separate latent video pretraining, representation probes, downstream perception, and planning/control evaluations.")
    if primary == "vljepa":
        takeaways.append("VL-JEPA evidence should keep representation pretraining, retrieval/classification, and SFT VQA results as separate evidence tracks.")
    if primary == "longrope":
        takeaways.append("LongRoPE evidence should pair long-context success with short-context regression checks under each RoPE scaling stage.")
    if primary == "kangaroo":
        takeaways.append("Kangaroo evidence should report acceptance rate, verified output equivalence, and latency by early-exit setting.")
    if primary == "mixtral":
        takeaways.append("Mixtral evidence should separate sparse MoE model quality from expert routing/utilization and serving throughput constraints.")
    if primary == "curve-skeleton":
        takeaways.append("Curve-skeleton evidence should judge topology preservation and robustness to missing point-cloud regions, not only visual smoothness.")
    if primary == "film":
        takeaways.append("FiLM evidence should connect modulation placement and gamma/beta behavior to visual reasoning accuracy, not only final CLEVR-style scores.")
    if primary == "eagle":
        takeaways.append("EAGLE evidence should separate draft feature uncertainty, acceptance rate, verifier correctness, and latency speedup.")
    if "Table 10" in text and "POG" in text:
        takeaways.append("POG has a specific ablation signal; treat it as conditional evidence for block-wise clustering rather than a universal gain.")
    if "Table 11" in text and "KL" in text:
        takeaways.append("Router KL evidence should be tracked separately from accuracy because it measures token-expert assignment stability.")
    if re.search(r"4\.15\s*(?:×|x)", text, flags=re.IGNORECASE):
        takeaways.append("The headline 4.15x speedup is a systems claim and should be separated from algorithmic accuracy claims.")
    if "Accel-Sim" in text:
        takeaways.append("GPU speed evidence uses simulation; keep it distinct from CPU measurements and accuracy tables.")
    if takeaways:
        return takeaways
    generic_markers = []
    if re.search(r"\b(table|figure|ablation|baseline)\b", text, flags=re.IGNORECASE):
        generic_markers.append("reported tables/figures/ablations")
    if re.search(r"\b(speedup|latency|throughput|memory|tokens/sec)\b", text, flags=re.IGNORECASE):
        generic_markers.append("runtime or memory measurements")
    if re.search(r"\b(accuracy|perplexity|loss|f1|dice|ssim|psnr)\b", text, flags=re.IGNORECASE):
        generic_markers.append("quality metrics")
    if generic_markers:
        return [
            "Evidence should be read through "
            + ", ".join(generic_markers)
            + "; keep mechanism support, quality metrics, and systems/runtime claims separate."
        ]
    return ["Evidence is sparse in extracted text; inspect source pages and page images before promoting claims."]


def _limitations(pages: list[PageExtraction]) -> list[str]:
    text = _paper_body_text(pages)
    limitations = []
    lowered = text.lower()
    primary = _primary_paper_key(pages)
    if primary in {"llm.int8", "smoothquant", "squeezellm", "omniquant", "affinequant", "flatquant", "ostquant", "qep", "moequant"}:
        limitations.append("Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution.")
        limitations.append("Reported gains should be rechecked under the exact bit-width, model family, and evaluation protocol because PTQ results often change sharply across these settings.")
    if primary in {"quarot", "spinquant", "duquant", "dfrot"}:
        limitations.append("Rotation or transform equivalence must be verified before quantization; otherwise accuracy changes may come from the transform implementation rather than quantization quality.")
        limitations.append("Rotation results should be compared under identical W/A/KV bit settings because weight-only, activation, and KV-cache quantization stress different failure modes.")
    if primary in {"quarot", "duquant", "flatquant", "ostquant"}:
        limitations.append("Online transform or decomposition overhead should be accounted for separately from quantized matmul speedups.")
    if primary == "squeezellm":
        limitations.append("Sparse retention changes runtime/storage accounting; accuracy gains should be judged against sparse-index and kernel overhead.")
    if primary == "moequant":
        limitations.append("MoE gains depend on expert-routing coverage in calibration; transfer dense-LLM PTQ conclusions only after checking expert imbalance.")
        limitations.append("Expert-specific improvements can be hidden by aggregate accuracy; inspect expert usage variance and per-task results before generalizing.")
    if primary == "massive-activations":
        limitations.append("This is primarily a mechanistic analysis paper; use localization findings as compression evidence only after separate intervention tests.")
        limitations.append("Claims about functional importance depend on intervention design; descriptive magnitude plots alone are not causal evidence.")
        limitations.append("Model-family coverage matters because fixed feature dimensions and token positions may not transfer across architectures.")
    if primary == "qep":
        limitations.append("Layer-wise error propagation can overfit the reconstruction objective; end-task metrics are needed to validate propagation strength.")
        limitations.append("Propagation changes the independence assumption in layer-wise PTQ, so compare against the same base quantizer with and without propagated error.")
    if primary == "llm.int8":
        limitations.append("The mixed-precision outlier path is only cheap if outlier dimensions remain sparse under the chosen threshold.")
        limitations.append("Hardware benefit depends on the int8 kernel and on whether outlier routing overhead is amortized at the target batch/sequence length.")
    if primary == "smoothquant":
        limitations.append("The smoothing alpha trades activation difficulty against weight difficulty; a setting that preserves one model may not transfer unchanged.")
    if primary == "omniquant":
        limitations.append("Block reconstruction is a proxy objective; verify that lower block error translates to downstream perplexity or task accuracy.")
    if primary == "affinequant":
        limitations.append("Affine transforms must remain well-conditioned; otherwise equivalence before quantization can still produce unstable quantized behavior.")
    if primary == "flatquant":
        limitations.append("Flattened distributions are useful only if the transform cost and quantized-kernel speed still improve end-to-end inference.")
    if primary == "ostquant":
        limitations.append("QSUR is a diagnostic proxy; verify that higher utilization actually predicts lower downstream quantization error.")
    if primary == "milo":
        limitations.append("Low-rank compensation is only useful if residual error is structured enough; compare against the same memory budget and expert-routing behavior.")
        limitations.append("MoE aggregate metrics can hide per-expert failures, so inspect expert-level residuals and routing stability.")
    if primary == "eagle2":
        limitations.append("Speculative decoding speedups depend on draft-target alignment, acceptance rate, decoding settings, and verifier overhead.")
        limitations.append("Lossless speedup claims require target-model verification; any implementation shortcut should be checked for output-distribution drift.")
    if primary == "med-ddpm":
        limitations.append("Semantic 3D MRI synthesis depends on mask quality and dataset distribution; downstream utility does not automatically prove clinical realism.")
        limitations.append("Privacy/anonymization claims require separate evidence beyond good-looking generated volumes.")
    if primary == "gqa":
        limitations.append("GQA conversion quality depends on group count and uptraining budget; MHA/MQA/GQA comparisons should hold adaptation data and compute fixed.")
        limitations.append("Memory-bandwidth gains only matter if decode is KV-cache/bandwidth bound at the target batch and sequence length.")
    if primary == "qil":
        limitations.append("Learned quantization intervals require task-loss finetuning; do not compare them as calibration-only PTQ.")
        limitations.append("Very low-bit gains depend on progressive finetuning and architecture/dataset choice.")
    if primary == "lsqplus":
        limitations.append("Scale/offset learning can be sensitive to initialization and optimizer settings, so report quantizer state and bit width together.")
    if primary == "qvlm":
        limitations.append("LVLM PTQ depends on multimodal calibration coverage; transfer text-only calibration conclusions only after multimodal checks.")
        limitations.append("Memory and speed claims should be separated from VQA/reasoning accuracy because they stress different parts of the pipeline.")
    if primary == "vljepa":
        limitations.append("Embedding-space alignment and SFT solve different problems; attribute downstream VQA gains with ablations that separate pretraining from SFT.")
        limitations.append("Classification/retrieval improvements may not imply robust multimodal reasoning without targeted evaluation.")
    if primary == "longrope":
        limitations.append("Long-context extension can preserve passkey-style tasks while still harming ordinary short-context behavior; both must be checked.")
        limitations.append("RoPE scaling recipes may be model-family and context-length specific.")
    if primary == "kangaroo":
        limitations.append("Self-speculative speedups depend on early-exit acceptance rates and verifier overhead.")
        limitations.append("Lossless claims require final-layer verification under the same decoding settings.")
    if primary == "mixtral":
        limitations.append("MoE quality and throughput depend on router load balance, expert specialization, and serving infrastructure.")
        limitations.append("Parameter count comparisons are misleading unless active parameters and routing cost are separated.")
    if primary == "curve-skeleton":
        limitations.append("Topology recovery from incomplete point clouds depends on sampling density, missing-region pattern, and regularization strength.")
        limitations.append("Visual skeleton quality should be backed by graph/topology metrics or controlled synthetic cases.")
    if primary == "film":
        limitations.append("FiLM gains depend on the conditioning representation and modulation placement; final accuracy alone does not explain which visual features were controlled.")
    if primary == "eagle":
        limitations.append("Feature-level speculative sampling speedups depend on acceptance rates and verifier overhead; correctness still depends on target verification.")
    if "speculative actions" in lowered or "agentic systems" in lowered:
        limitations.append("Action-level speculation is only safe if verifier, rollback, and environment/tool-state semantics preserve the sequential execution outcome.")
        limitations.append("Latency gains should be reported together with task success, rollback frequency, verifier lag, and cases where speculative branches become wasted work.")
    if "simulator" in lowered or "Accel-Sim" in text:
        limitations.append("Some hardware evidence depends on simulation or specific CPU/kernel settings.")
    if "block-wise" in lowered and "embedding-wise" in lowered:
        limitations.append("Some components are setting-dependent; treat POG as a block-wise clustering mechanism until other settings have direct ablations.")
    if limitations:
        return limitations
    if (
        "physics-informed neural network" in lowered
        or "physics informed neural network" in lowered
        or "partial differential equation" in lowered
        or "nonlinear pde" in lowered
    ):
        return [
            "PINN quality depends on how data loss and physics residual loss are balanced; aggregate accuracy can hide residual or boundary-condition failure.",
            "Forward and inverse PDE settings should be evaluated separately because parameter identification and solution approximation stress different assumptions.",
        ]
    if "human preference" in lowered or "human feedback" in lowered or "reward model" in lowered or "reward predictor" in lowered:
        return [
            "Preference-learning results depend on labeler consistency, comparison design, and whether the learned reward transfers beyond the sampled trajectories or responses.",
            "Reward-model optimization can create reward hacking or distribution shift, so policy results need held-out human or task evaluation.",
        ]
    if _has_ppo(lowered) or "proximal policy optimization" in lowered or "policy gradient" in lowered:
        return [
            "Policy-optimization behavior is sensitive to reward normalization, clipping/KL settings, rollout length, and seed variance.",
            "Reported gains should be separated from environment-specific exploration and baseline tuning.",
        ]
    if "self-attention" in lowered or "transformer" in lowered or "relative position" in lowered:
        return [
            "Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute.",
            "Quality improvements should be checked against ablations that isolate architecture from data scale and optimization changes.",
        ]
    if "neural ordinary differential" in lowered or "neural ode" in lowered or "ordinary differential equation" in lowered:
        return [
            "Continuous-depth model behavior depends on solver tolerance, number of function evaluations, and gradient/adjoint assumptions.",
            "Memory savings or accuracy gains should be separated from solver instability and runtime cost.",
        ]
    if "autonomous agent" in lowered or "generative agent" in lowered or "agent planning" in lowered:
        return [
            "Agent results depend heavily on environment fidelity, tool/action availability, prompt policy, and evaluation leakage.",
            "Behavioral claims should be tied to trace-level evidence rather than only aggregate benchmark scores.",
        ]
    if "survey" in lowered or "technical report" in lowered:
        return [
            "Survey pages are useful routing maps, but individual empirical claims should be checked against primary papers before promotion.",
            "Taxonomy boundaries may reflect the authors' framing; compare against other surveys or primary evidence before using it as canonical structure.",
        ]
    if "speculative decoding" in lowered or "draft model" in lowered:
        return [
            "Speculative decoding gains depend on acceptance rates and verifier overhead.",
            "Correctness claims should be tied to target-model verification and decoding settings.",
        ]
    if "conditional diffusion" in lowered or "denoising diffusion" in lowered or "ddpm" in lowered:
        return [
            "Diffusion sample quality depends on the training distribution, conditioning signal quality, and evaluation metric.",
            "Generated examples should be separated from downstream task evidence.",
        ]
    if "long context" in lowered or "long-context" in lowered or "kv cache" in lowered:
        return [
            "Long-context or KV-cache gains should be checked at the target sequence lengths and tasks.",
            "Runtime/memory improvements can trade off against quality in ways hidden by short-context metrics.",
        ]
    if "k-means" in lowered or "clustering" in lowered:
        return [
            "Clustering conclusions can depend on initialization, objective assumptions, and data distribution.",
            "Theoretical equivalence claims should be separated from algorithmic performance claims.",
        ]
    return ["Limitations were not explicit in extracted text; promote this page only after checking assumptions, evaluation scope, and failure cases."]


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


def _method_families(
    title: str,
    pages: list[PageExtraction],
    method_records: list[dict[str, Any]],
    settings: list[str],
) -> list[str]:
    primary = _primary_paper_key(pages)
    text = _method_family_text(title, method_records, settings).lower()
    focus = _focus_text(title, pages)
    families: list[str] = []

    if _is_long_form_reference(title, pages):
        return ["reference synthesis", "performance evaluation"]
    if _is_non_llm_clustering_text(focus):
        return ["clustering algorithm"]

    if "survey" in focus and ("autonomous agent" in focus or "llm-based autonomous agent" in focus or "large language model based autonomous agent" in focus):
        return ["survey synthesis", "agent workflow modeling", "LLM-agent taxonomy"]
    if "flashattention" in focus or ("hopper" in focus and "attention" in focus):
        return ["attention kernel optimization", "IO-aware attention", "hardware-aware attention"]
    if "speculative actions" in focus or "agentic systems" in focus:
        return ["agent workflow acceleration", "speculative action execution"]
    if "qwen-audio" in focus or "audio-language" in focus or "audio understanding" in focus:
        return ["audio-language modeling", "multimodal instruction tuning"]
    if "jepa" in focus and ("video" in focus or "joint embedding" in focus):
        return ["video representation learning", "joint embedding predictive learning"]

    if primary == "massive-activations":
        return ["mechanistic activation analysis"]
    if primary == "milo":
        return ["MoE quantization", "low-rank compensation", "post-training quantization"]
    if primary == "eagle2":
        return ["speculative decoding", "dynamic draft tree"]
    if primary == "med-ddpm":
        return ["conditional diffusion", "semantic image synthesis"]
    if primary == "gqa":
        return ["grouped-query attention", "attention checkpoint conversion"]
    if primary == "qil":
        return ["quantization-aware training", "learned quantization intervals"]
    if primary == "lsqplus":
        return ["quantization-aware training", "learned step-size quantization"]
    if primary == "qvlm":
        return ["vision-language model quantization", "post-training quantization"]
    if primary == "vjepa":
        return ["video representation learning", "joint embedding predictive learning"]
    if primary == "vljepa":
        return ["vision-language representation learning", "joint embedding predictive learning"]
    if primary == "longrope":
        return ["long-context inference", "RoPE scaling"]
    if primary == "kangaroo":
        return ["speculative decoding", "self-speculative decoding"]
    if primary == "mixtral":
        return ["sparse mixture-of-experts", "expert routing"]
    if primary == "curve-skeleton":
        return ["curve skeleton extraction", "point-cloud geometry"]
    if primary == "film":
        return ["feature-wise modulation", "visual reasoning"]
    if primary == "eagle":
        return ["speculative decoding", "feature-level drafting"]
    if (
        "physics-informed neural network" in focus
        or "physics informed neural network" in focus
        or "partial differential equation" in focus
        or "nonlinear pde" in focus
    ):
        return ["physics-informed neural networks", "PDE-constrained learning"]

    if "flashattention" in text or ("hopper" in text and "attention" in text):
        families.extend(["attention kernel optimization", "IO-aware attention", "hardware-aware attention"])
    if "speculative actions" in text or "agentic systems" in text:
        families.extend(["agent workflow acceleration", "speculative action execution"])
    if "qwen-audio" in text or "audio-language" in text or "audio understanding" in text:
        families.extend(["audio-language modeling", "multimodal instruction tuning"])
    if "jepa" in text and ("video" in text or "joint embedding" in text):
        families.extend(["video representation learning", "joint embedding predictive learning"])
    if "speculative decoding" in text or "draft model" in text or "draft tree" in text:
        families.append("speculative decoding")
    if "dynamic draft" in text:
        families.append("dynamic draft tree")
    if "conditional diffusion" in text or "denoising diffusion" in text or "ddpm" in text:
        families.append("conditional diffusion")
    if "semantic" in text and ("image synthesis" in text or "mri synthesis" in text):
        families.append("semantic image synthesis")
    if "long context" in text or "long-context" in text or "longrope" in text:
        families.append("long-context inference")
    if _is_kv_cache_efficiency_text(text):
        families.append("KV-cache compression")
    if "grouped-query" in text or "grouped query" in text:
        families.append("grouped-query attention")
    if _is_clustering_research_context(text):
        families.append("clustering algorithm")
    if "human preference" in text or "human feedback" in text or "reward model" in text or "reward predictor" in text:
        families.extend(["preference-based reinforcement learning", "reward modeling"])
    if "rlhf" in text or "reinforcement learning from human feedback" in text:
        families.append("RLHF")
    if "self-reward" in text or "meta-reward" in text or "llm-as-a-judge" in text or "meta-judge" in text:
        families.extend(["self-rewarding model training", "LLM-as-judge reward modeling"])
    if _has_ppo(text) or "proximal policy optimization" in text or "policy gradient" in text:
        families.append("policy optimization")
    if "test-time reinforcement learning" in text or "ttrl" in text:
        families.append("test-time reinforcement learning")
    if "self-instruct" in text or "instruction tuning" in text or "self-generated instructions" in text:
        families.append("instruction tuning")
    if "self-attention" in text or "attention is all you need" in text or "transformer" in text:
        families.append("transformer architecture")
    if "relative position" in text or "relative positional" in text:
        families.append("relative position encoding")
    if "universal transformer" in text or "adaptive computation time" in text:
        families.append("recurrent transformer")
    if "neural ordinary differential" in text or "neural ode" in text or "ordinary differential equation" in text:
        families.append("continuous-depth neural network")
    if "autonomous agent" in text or "generative agent" in text or "agent planning" in text or "agent-based" in text:
        families.append("agent workflow modeling")
    if "survey" in focus or "technical report" in focus:
        families.append("survey synthesis")

    quantization_cues = _is_quantization_research_context(text, pages)
    if quantization_cues:
        families.append("post-training quantization")
    if quantization_cues and (primary == "qep" or "layer-wise" in text or "layerwise" in text):
        families.append("layer-wise PTQ")
    if quantization_cues and (primary in {"moequant", "codequant"} or "mixture-of-experts" in text or "moe" in text):
        families.append("MoE quantization")
    if quantization_cues and ("outlier" in text or "massive activation" in text):
        families.append("outlier-aware quantization")
    if quantization_cues and ("calibration" in text or "self-sampling" in text):
        families.append("calibration-aware PTQ")
    if quantization_cues and any(marker in text for marker in ("rotation", "hadamard", "orthogonal")):
        families.append("rotation-based quantization")
    if quantization_cues and any(marker in text for marker in ("affine transform", "equivalent transformation", "invariant transform", "computationally invariant")):
        families.append("equivalent-transform PTQ")
    if quantization_cues and any(marker in text for marker in ("non-uniform", "centroid", "clustering", "k-means", "codebook")):
        families.append("non-uniform weight quantization")
    if quantization_cues and any(marker in text for marker in ("expert", "router", "routing")) and "moe" in text:
        families.append("expert-aware quantization")
    if quantization_cues and any(marker in text for marker in ("kernel", "lut", "lookup table", "latency", "throughput", "speedup")):
        families.append("hardware-aware quantization")
    if quantization_cues and "sparse" in text and "outlier" in text:
        families.append("sparse outlier retention")
    return _dedupe(families)[:8] or ["paper-specific research method"]


def _settings(pages: list[PageExtraction]) -> list[str]:
    full_text = " ".join(page.text for page in pages)
    lowered = f" {_normalize(full_text).lower()} "
    focus_lowered = f" {_normalize(' '.join(page.text for page in pages[:5])).lower()} "
    quant_focus = _is_quantization_research_context(focus_lowered, pages)
    primary = _primary_paper_key(pages)
    settings: list[str] = []

    if _is_long_form_reference("", pages):
        return ["long-form reference setting"]
    if _is_clustering_research_context(focus_lowered):
        return ["clustering theory setting"]
    if "survey" in focus_lowered and ("autonomous agent" in focus_lowered or "llm-based autonomous agent" in focus_lowered):
        return ["agent survey/synthesis setting", "survey/synthesis setting"]
    if "flashattention" in focus_lowered or ("hopper" in focus_lowered and "attention" in focus_lowered):
        return ["GPU attention-kernel setting", "low-precision attention setting"]
    if "speculative actions" in focus_lowered or "agentic systems" in focus_lowered:
        return ["agent workflow setting", "speculative action execution setting"]
    if "qwen-audio" in focus_lowered or "audio-language" in focus_lowered or "audio understanding" in focus_lowered:
        return ["audio-language setting", "multimodal instruction setting"]
    if "jepa" in focus_lowered and ("video" in focus_lowered or "joint embedding" in focus_lowered):
        return ["video representation learning setting"]

    primary_settings = {
        "llm.int8": ["weight-activation quantization"],
        "smoothquant": ["weight-activation quantization"],
        "quarot": ["weight-activation quantization", "KV-cache quantization"],
        "spinquant": ["weight-activation quantization", "KV-cache quantization"],
        "duquant": ["weight-activation quantization"],
        "squeezellm": ["weight-only quantization"],
        "omniquant": ["weight-only quantization", "weight-activation quantization"],
        "affinequant": ["weight-activation quantization"],
        "flatquant": ["weight-activation quantization"],
        "dfrot": ["weight-activation quantization"],
        "ostquant": ["weight-activation quantization"],
        "qep": ["weight-only quantization"],
        "moequant": ["weight-only quantization", "MoE setting"],
        "codequant": ["weight-activation quantization", "MoE setting", "LUT/kernel setting"],
        "massive-activations": ["mechanistic activation analysis setting"],
        "milo": ["weight-only quantization", "MoE setting"],
        "eagle2": ["speculative decoding setting"],
        "med-ddpm": ["3D medical imaging setting"],
        "gqa": ["decoder attention setting"],
        "qil": ["quantization-aware training setting", "weight-activation quantization"],
        "lsqplus": ["quantization-aware training setting", "weight-activation quantization"],
        "qvlm": ["vision-language setting", "weight-activation quantization"],
        "vjepa": ["video representation learning setting"],
        "vljepa": ["vision-language setting"],
        "longrope": ["long-context inference setting"],
        "kangaroo": ["speculative decoding setting"],
        "mixtral": ["MoE setting", "decoder inference setting"],
        "curve-skeleton": ["3D geometry setting"],
        "film": ["visual reasoning setting"],
        "eagle": ["speculative decoding setting"],
    }
    if primary in primary_settings:
        return primary_settings[primary]

    if quant_focus and (
        "weight-only" in lowered
        or "weight only" in lowered
        or re.search(r"\bw[2348]a16\b", lowered)
        or primary in {"moequant", "qep", "squeezellm"}
    ):
        settings.append("weight-only quantization")
    if quant_focus and (
        "weight-activation" in lowered
        or "weight activation" in lowered
        or "weights and activations" in lowered
        or "activation quantization" in lowered
        or re.search(r"\b(?:w[2468]a[2468]|a[2468]w[2468])\b", lowered)
        or primary in {"codequant", "smoothquant", "quarot", "duquant", "spinquant", "omniquant", "affinequant", "flatquant", "dfrot", "ostquant"}
    ):
        settings.append("weight-activation quantization")
    if quant_focus and ("kv cache" in lowered or "kv-cache" in lowered):
        settings.append("KV-cache quantization")
    if "moe" in focus_lowered or "mixture-of-experts" in focus_lowered:
        settings.append("MoE setting")
    if quant_focus and ("lut" in lowered or "lookup table" in lowered or "lookup-table" in lowered):
        settings.append("LUT/kernel setting")
    if "speculative decoding" in focus_lowered or "draft model" in focus_lowered or "draft tree" in focus_lowered:
        settings.append("speculative decoding setting")
    if _is_kv_cache_efficiency_text(focus_lowered):
        settings.append("KV-cache compression setting")
    if "long context" in focus_lowered or "long-context" in focus_lowered or "longrope" in focus_lowered:
        settings.append("long-context inference setting")
    if "3d brain mri" in focus_lowered or "medical image" in focus_lowered or ("mri" in focus_lowered and "segmentation" in focus_lowered):
        settings.append("3D medical imaging setting")
    if "grouped-query attention" in focus_lowered or "multi-query attention" in focus_lowered:
        settings.append("decoder attention setting")
    if "vision-language" in focus_lowered or "large vision-language" in focus_lowered or "vlm" in focus_lowered:
        settings.append("vision-language setting")
    if "audio-language" in focus_lowered or "audio understanding" in focus_lowered or "speech" in focus_lowered:
        settings.append("audio-language setting")
    if "point cloud" in focus_lowered or "curve skeleton" in focus_lowered or "mesh" in focus_lowered:
        settings.append("3D geometry setting")
    if "quantization-aware" in focus_lowered or "task loss" in focus_lowered and "quantization" in focus_lowered:
        settings.append("quantization-aware training setting")
    if "k-means" in focus_lowered and ("pca" in focus_lowered or "principal component" in focus_lowered or "matrix factorization" in focus_lowered):
        settings.append("clustering theory setting")
    if "human feedback" in focus_lowered or "human preference" in focus_lowered or "reward model" in focus_lowered or "preference optimization" in focus_lowered:
        settings.append("preference-learning setting")
    if _has_ppo(focus_lowered) or "proximal policy optimization" in focus_lowered or "policy gradient" in focus_lowered:
        settings.append("reinforcement-learning setting")
    if "self-attention" in focus_lowered or "transformer" in focus_lowered or "relative position" in focus_lowered:
        settings.append("transformer sequence-modeling setting")
    if "survey" in focus_lowered and ("autonomous agent" in focus_lowered or "llm-based autonomous agent" in focus_lowered):
        settings.append("agent survey/synthesis setting")
    elif "autonomous agent" in focus_lowered or "generative agent" in focus_lowered or "agent planning" in focus_lowered or "agent-based" in focus_lowered:
        settings.append("agent evaluation setting")
    if "neural ordinary differential" in focus_lowered or "neural ode" in focus_lowered or "ordinary differential equation" in focus_lowered:
        settings.append("continuous-depth modeling setting")
    if (
        "physics-informed neural network" in focus_lowered
        or "physics informed neural network" in focus_lowered
        or "partial differential equation" in focus_lowered
        or "nonlinear pde" in focus_lowered
    ):
        settings.append("physics-informed PDE setting")
    if "survey" in focus_lowered or "technical report" in focus_lowered:
        settings.append("survey/synthesis setting")

    if not settings:
        settings.extend(_fallback_settings(focus_lowered))

    return _dedupe(settings)


def _fallback_settings(focus_lowered: str) -> list[str]:
    settings = []
    if "lora" in focus_lowered or "low-rank adaptation" in focus_lowered or "fine-tuning" in focus_lowered:
        settings.append("parameter-efficient adaptation setting")
    if "chain-of-thought" in focus_lowered or "chain of thought" in focus_lowered or "reasoning" in focus_lowered:
        settings.append("reasoning evaluation setting")
    if "react" in focus_lowered or "reasoning and acting" in focus_lowered or "tool" in focus_lowered and "language model" in focus_lowered:
        settings.append("agent/tool-use setting")
    if "root system" in focus_lowered or "root image" in focus_lowered or "root architecture" in focus_lowered:
        settings.append("root-system analysis setting")
    if "diffusion model" in focus_lowered or "diffusion modeling" in focus_lowered or "classifier-free diffusion" in focus_lowered:
        settings.append("diffusion modeling setting")
    if "3d reconstruction" in focus_lowered or "single-view 3d" in focus_lowered or "single view 3d" in focus_lowered:
        settings.append("3D reconstruction setting")
    if _is_clustering_research_context(focus_lowered):
        settings.append("clustering analysis setting")
    if "computer architecture" in focus_lowered or "quantitative approach" in focus_lowered:
        settings.append("computer architecture reference setting")
    if "atmospheric downscaling" in focus_lowered or "weather" in focus_lowered or "climate" in focus_lowered:
        settings.append("scientific ML setting")
    if "hierarchical" in focus_lowered or "gaussian process" in focus_lowered:
        settings.append("hierarchical modeling setting")
    if "autonomous machine intelligence" in focus_lowered or "world model" in focus_lowered:
        settings.append("world-modeling setting")
    if "test-time reinforcement learning" in focus_lowered or "test time reinforcement learning" in focus_lowered or "ttrl" in focus_lowered:
        settings.append("test-time RL setting")
    if "distributional shift" in focus_lowered or "rlvr" in focus_lowered:
        settings.append("RL fine-tuning analysis setting")
    if "prompt engineering" in focus_lowered or "in-context learning" in focus_lowered:
        settings.append("prompting/in-context learning setting")
    return settings or ["general research evaluation setting"]


def _topics(
    title: str,
    abstract: str,
    candidates: list[dict[str, Any]],
    pages: list[PageExtraction],
    method_records: list[dict[str, Any]],
    settings: list[str],
) -> list[str]:
    if _is_long_form_reference(title, pages):
        if "computer architecture" in title.lower():
            return ["computer architecture", "performance evaluation", "hardware systems"]
        return ["reference synthesis", "survey synthesis"]
    text = _topic_text(title, abstract, candidates, method_records, settings)
    if _is_clustering_research_context(text):
        return ["clustering theory"]
    controlled = _controlled_topics(text, settings)
    if not _is_quantization_research_context(text, pages):
        controlled = [
            topic
            for topic in controlled
            if "quantization" not in topic.lower()
            and "ptq" not in topic.lower()
            and topic not in {"activation outliers", "LLM outliers", "quantization error", "hardware-aware quantization"}
        ]
    if "survey" in text.lower() and ("autonomous agent" in text.lower() or "llm-based autonomous agent" in text.lower()):
        controlled = [
            topic
            for topic in controlled
            if topic not in {"human preference feedback", "reward modeling", "policy optimization"}
        ]
    if "speculative actions" in text.lower() or "agentic systems" in text.lower():
        controlled = [
            topic
            for topic in controlled
            if topic not in {"speculative decoding", "computer architecture"}
        ]
    phrase_topics = _phrase_topics(text, title, method_records)
    topics = _dedupe(controlled + phrase_topics)
    if not topics:
        topics.extend(_fallback_topics(title, abstract, settings))
    return _dedupe(topics)[:10]


def _is_long_form_reference(title: str, pages: list[PageExtraction]) -> bool:
    if len(pages) < 300:
        return False
    title_lower = title.lower()
    first_pages = _normalize(" ".join(page.text for page in pages[:3])).lower()
    return (
        "computer architecture" in title_lower
        or "textbook" in first_pages
        or "contents" in first_pages and ("chapter" in first_pages or "appendix" in first_pages)
    )


def _method_family_text(title: str, method_records: list[dict[str, Any]], settings: list[str]) -> str:
    return _normalize(f"{title} {' '.join(settings)} " + _method_record_text(method_records))


def _fallback_topics(title: str, abstract: str, settings: list[str]) -> list[str]:
    text = _normalize(f"{title} {abstract} {' '.join(settings)}").lower()
    topics = []
    if "autonomous machine intelligence" in text or "world model" in text:
        topics.extend(["world model learning", "autonomous machine intelligence"])
    if "single-view 3d" in text or "single view 3d" in text or "3d reconstruction" in text:
        topics.append("single-view 3D reconstruction")
    if "root" in text and ("system" in text or "image" in text):
        topics.append("root system analysis")
    if "lora" in text or "low-rank adaptation" in text:
        topics.append("parameter-efficient adaptation")
    if "reasoning" in text or "chain-of-thought" in text or "chain of thought" in text:
        topics.append("chain-of-thought reasoning")
    if "diffusion" in text:
        topics.append("diffusion modeling")
    if _is_clustering_research_context(text):
        topics.append("clustering analysis")
    return topics


def _is_non_llm_clustering_text(text: str) -> bool:
    lowered = _normalize(text).lower()
    has_clustering = "k-means" in lowered or "k means" in lowered or "deep clustering" in lowered or "clustering" in lowered
    if not has_clustering:
        return False
    llm_quantization_markers = (
        "large language model",
        "llm",
        "transformer language model",
        "weight-only",
        "weight activation",
        "weight-activation",
        "activation quantization",
        "low-bit",
        "4-bit",
        "2-bit",
        "int4",
        "w4a",
        "w8a",
        "kv cache",
        "llm inference",
    )
    return not any(marker in lowered for marker in llm_quantization_markers)


def _is_kv_cache_efficiency_text(text: str) -> bool:
    lowered = _normalize(text).lower()
    has_cache = (
        "kv cache" in lowered
        or "kv-cache" in lowered
        or "key-value cache" in lowered
        or "key value cache" in lowered
        or "kv caches" in lowered
        or "pyramidkv" in lowered
    )
    has_efficiency = any(
        marker in lowered
        for marker in (
            "compression",
            "compressing",
            "compress",
            "pruning",
            "prune",
            "retention",
            "retain",
            "cache budget",
            "memory",
            "decode",
            "longbench",
        )
    )
    return has_cache and has_efficiency


def _is_clustering_research_context(text: str) -> bool:
    lowered = _normalize(text).lower()
    if "k-means" not in lowered and "k means" not in lowered and "deep clustering" not in lowered and "clustering" not in lowered:
        return False
    if _is_kv_cache_efficiency_text(lowered):
        return False
    if "attention" in lowered and any(marker in lowered for marker in ("kv", "key-value", "cache", "long-context")):
        return False
    return _is_non_llm_clustering_text(lowered)


def _topic_text(
    title: str,
    abstract: str,
    candidates: list[dict[str, Any]],
    method_records: list[dict[str, Any]],
    settings: list[str],
) -> str:
    return _normalize(
        f"{title} {abstract} {' '.join(settings)} "
        + " ".join(str(item["sentence"]) for item in candidates)
        + " "
        + _method_record_text(method_records)
    )


def _method_record_text(method_records: list[dict[str, Any]]) -> str:
    return " ".join(
        " ".join(
            str(value)
            for value in (
                record.get("name"),
                record.get("short_name"),
                record.get("summary"),
                " ".join(record.get("inputs") or []),
                " ".join(record.get("outputs") or []),
                " ".join(record.get("assumptions") or []),
            )
            if value
        )
        for record in method_records
    )


def _controlled_topics(text: str, settings: list[str]) -> list[str]:
    lowered = f" {_normalize(text).lower()} "
    setting_topics = {"weight-only quantization", "weight-activation quantization", "KV-cache quantization"}
    setting_set = set(settings)
    topics = []
    for topic, needles in CONTROLLED_TOPIC_RULES:
        if topic in setting_topics or topic in setting_set:
            continue
        if topic in settings or any(_contains_phrase(lowered, needle) for needle in needles):
            topics.append(topic)
    return topics


def _phrase_topics(title_text: str, title: str, method_records: list[dict[str, Any]]) -> list[str]:
    lowered = _normalize(title_text).lower()
    method_terms = {
        str(value).lower()
        for record in method_records
        for value in (record.get("name"), record.get("short_name"))
        if value
    }
    title_terms = {term for term in re.findall(r"[a-z][a-z0-9-]{2,}", title.lower()) if term}
    phrase_rules = (
        ("quantization error", ("quantization error", "quantization errors")),
        ("LLM outliers", ("llm outlier", "llm outliers", "large language model outlier", "massive activations")),
        ("activation outliers", ("activation outlier", "activation outliers")),
        ("hardware co-design", ("hardware co-design", "kernel design", "dedicated kernel")),
        ("expert imbalance", ("expert imbalance", "expert-balanced", "expert usage")),
        ("router preservation", ("router logits", "router behavior", "router kl")),
        ("calibration representativeness", ("calibration representativeness", "calibration samples", "calibration set")),
        ("layer reconstruction", ("layer reconstruction", "block reconstruction", "reconstruction error")),
        ("draft acceptance", ("acceptance rate", "accepted tokens", "draft acceptance")),
        ("verification overhead", ("verification overhead", "verifier cost", "target verification")),
        ("semantic control", ("semantic control", "segmentation mask", "semantic conditioning")),
        ("MRI synthesis", ("mri synthesis", "brain mri", "synthetic mri")),
        ("context extrapolation", ("context extrapolation", "position interpolation", "context length")),
        ("KV-cache memory", ("kv cache memory", "kv-cache memory", "cache memory")),
        ("attention head sharing", ("head sharing", "key/value heads", "shared key")),
        ("PCA relationship", ("pca", "principal component analysis")),
    )
    phrases = []
    for phrase, needles in phrase_rules:
        if any(needle in lowered for needle in needles) and not _is_title_or_method_topic(phrase, title_terms, method_terms):
            phrases.append(phrase)
    return phrases


def _is_title_or_method_topic(topic: str, title_terms: set[str], method_terms: set[str]) -> bool:
    lowered = topic.lower()
    if lowered in method_terms:
        return True
    topic_terms = set(re.findall(r"[a-z][a-z0-9-]{2,}", lowered))
    return bool(topic_terms) and topic_terms <= title_terms


def _legacy_word_topics(title: str, abstract: str, candidates: list[dict[str, Any]]) -> list[str]:
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
        "large",
        "language",
        "models",
        "model",
        "methods",
        "method",
        "existing",
        "achieve",
        "achieves",
        "achieved",
        "performance",
        "results",
        "result",
        "llms",
        "using",
        "based",
        "approach",
        "approaches",
        "address",
        "when",
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
    if terms == KNOWN_METRICS:
        return _known_metric_terms(extraction)
    text = _paper_body_text(extraction.pages)
    found = []
    for term in terms:
        if re.search(rf"\b{re.escape(term)}\b", text, flags=re.IGNORECASE):
            found.append(term)
    return found


def _known_metric_terms(extraction: PdfExtraction) -> list[str]:
    text = _paper_body_text(extraction.pages)
    found: list[str] = []
    sentences = _sentences(text)
    for term in KNOWN_METRICS:
        if any(_sentence_uses_metric(sentence, term) for sentence in sentences):
            found.append(term)
    return found


def _sentence_uses_metric(sentence: str, term: str) -> bool:
    lowered = sentence.lower()
    term_lower = term.lower()
    if term_lower == "precision" and re.search(
        r"\b(?:low|mixed|half|single|double|fp4|fp8|fp16|bf16|machine|numerical)[ -]precision\b"
        r"|\bprecision\s+(?:computation|capabilities|gemm|attention|tensor|format|sensing)\b",
        lowered,
    ):
        return False
    if term_lower == "recall" and re.search(r"\b(?:we|to|can|will|should|let\s+us)\s+recall\b|\brecall\s+(?:the|equation)\b", lowered):
        return False
    if not re.search(rf"(?<!-)\b{re.escape(term_lower)}\b", lowered):
        return False
    evidence_context = (
        "metric",
        "score",
        "result",
        "report",
        "evaluate",
        "evaluation",
        "benchmark",
        "dataset",
        "table",
        "figure",
        "baseline",
        "outperform",
        "achieve",
        "improve",
        "degrade",
        "compare",
        "%",
        "x",
    )
    if any(marker in lowered for marker in evidence_context):
        return True
    if term_lower in {"latency", "throughput", "speedup", "memory", "perplexity", "f1", "auc"}:
        return True
    if term_lower == "loss" and any(marker in lowered for marker in ("objective", "training", "validation", "test")):
        return True
    return False


def _paper_body_text(pages: list[PageExtraction]) -> str:
    body_pages = []
    for page in pages:
        lowered = page.text.lower()
        if re.search(r"^\s*(references|bibliography)\b", lowered, flags=re.MULTILINE):
            break
        body_pages.append(page.text)
    if not body_pages:
        body_pages = [page.text for page in pages[: min(len(pages), 20)]]
    return "\n".join(body_pages)


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


def _human_list(items: list[str], fallback: str) -> str:
    cleaned = [str(item).strip().rstrip(".") for item in items if str(item).strip()]
    if not cleaned:
        return fallback
    if len(cleaned) == 1:
        return cleaned[0]
    if len(cleaned) == 2:
        return f"{cleaned[0]} and {cleaned[1]}"
    return f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"


def _clean_sentence(sentence: str) -> str:
    cleaned = sentence.strip()
    cleaned = re.sub(r"^Published as a conference paper at ICLR 2026\s+", "", cleaned)
    return cleaned.strip()


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()
