---
type: "method-family"
title: "Moe Quantization Method Family Synthesis"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Moe-Quantization-Method-Family-Synthesis"
query: "I need a cross-paper method-family synthesis for MoE quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
sources:
  - "concepts/Lookup-table-inference.md"
  - "methods/MoE-quantization.md"
  - "evidence/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo-evidence-p0001.md"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis.md"
  - "topics/MoE-quantization.md"
  - "claims/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models-claim-002.md"
  - "papers/2511-10645v1.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP....md"
  - "concepts/Per-channel-scaling.md"
  - "concepts/Quantization-error-propagation.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Ran....md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "methods/outlier-aware-quantization.md"
  - "methods/transformer-architecture.md"
  - "methods/post-training-quantization.md"
  - "methods/calibration-aware-PTQ.md"
  - "methods/rotation-b....md"
  - "concepts/K-means-objective-landscape.md"
  - "concepts/Activation-outliers.md"
source_papers:
  - "papers/2511-10645v1.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP....md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Ran....md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
source_sections:
  - "concepts/Lookup-table-inference#What It Is"
  - "concepts/Lookup-table-inference#Evidence / Provenance"
  - "concepts/Lookup-table-inference#Common Failure Modes"
  - "concepts/Lookup-table-inference#Retrieval Hooks"
  - "concepts/Lookup-table-inference#Implementation Implications"
  - "concepts/Lookup-table-inference#Where It Appears"
  - "concepts/Lookup-table-inference#Minimal Checks / Probes"
  - "concepts/Lookup-table-inference#Related Concepts"
  - "concepts/Lookup-table-inference#Why It Matters"
  - "concepts/Lookup-table-inference#Open Questions"
  - "methods/MoE-quantization#What It Is"
  - "methods/MoE-quantization#Implementation Hooks"
  - "methods/MoE-quantization#Used By Papers"
  - "methods/MoE-quantization#Mechanism"
  - "methods/MoE-quantization#Failure Modes"
  - "methods/MoE-quantization#Open Questions"
  - "evidence/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo-evidence-p0001#Evidence Item"
  - "evidence/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo-evidence-p0001#Source"
  - "evidence/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo-evidence-p0001#Supports"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Wiki Synthesis"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Retrieval Hooks"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Evidence Map"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#What This Page Is For"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Source Facts"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Open Questions"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#User Ideas / Decisions"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Publish / Review Notes"
  - "topics/MoE-quantization#Scope"
  - "topics/MoE-quantization#Retrieval Hooks"
  - "topics/MoE-quantization#Method Families"
  - "topics/MoE-quantization#Claims"
  - "topics/MoE-quantization#Key Papers"
  - "topics/MoE-quantization#Key Concepts"
  - "claims/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models-claim-002#Claim"
  - "claims/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models-claim-002#Supporting Evidence"
source_context: ".drafts/proposals/continuous-synthesis-r1/Moe-Quantization-Method-Family-Synthesis/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/method-family"
aliases:
  - "Moe Quantization Method Family Synthesis"
  - "I need a cross-paper method-family synthesis for MoE quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
topics:
methods:
related:
  - "concepts/Lookup-table-inference"
  - "methods/MoE-quantization"
  - "evidence/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo-evidence-p0001"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis"
  - "topics/MoE-quantization"
  - "claims/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models-claim-002"
related_papers:
  - "papers/2511-10645v1.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP....md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Ran....md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Moe-Quantization-Method-Family-Synthesis"
supports:
contradicts:
supersedes:
superseded_by:
---
# Moe Quantization Method Family Synthesis

## What This Page Is For

- Proposal type: `method-family`.
- Original research query: I need a cross-paper method-family synthesis for MoE quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Publish target after review: `syntheses/Moe-Quantization-Method-Family-Synthesis.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[concepts/Lookup-table-inference|Lookup-table inference]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: `Lookup-table inference` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Evidence / Provenance`: - [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey syn...
  - `Common Failure Modes`: - Offline quantization accuracy is measured on a representation that the kernel cannot serve efficiently.
  - `Retrieval Hooks`: - Use for hardware-aware quantization, LUT kernels, and non-uniform quantizer implementation checks.
  - `Implementation Implications`: - Count table reads, metadata movement, and packing layout alongside arithmetic savings. - Keep the quantizer code path and inference kernel assumptions in the same experiment config.
  - `Where It Appears`: - [[papers/1909-13144v2]] - [[papers/2511-10645v1]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati]] - [[papers/Chee-et-al-2024-QuIP...
  - `Minimal Checks / Probes`: - Compare kernel-level latency and memory traffic against a uniform quantization baseline.
  - `Related Concepts`: - [[concepts/Per-channel-scaling|Per-channel scaling]] - [[concepts/Quantization-error-propagation|Quantization error propagation]]
  - `Why It Matters`: - A quantization method that depends on lookup tables must align quantizer design with memory layout, table access cost, and kernel support; otherwise accuracy gains can disappear at deployment.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[methods/MoE-quantization|MoE quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `MoE quantization`.
  - `Implementation Hooks`: - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition: Keep centroid construction inspectable; compare against uniform quantization as a control.
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models]] - [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Ran...
  - `Mechanism`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al.
  - `Failure Modes`: - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]: - Limitations were not explicit in extracted text; promote this page only after checking assumptions, evaluation scope, and failure cases.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[evidence/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo-evidence-p0001|evidence-p0001]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence Item`: No summary.
  - `Source`: [[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo|Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo]]
  - `Supports`: claim-004, claim-005
- [[syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis|Outlier-Aware Quantization Method Family Synthesis]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Wiki Synthesis`: - Intended use: I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Outlier-Aware Quantization Metho...
  - `Evidence Map`: - [[methods/outlier-aware-quantization|outlier-aware quantization]]: candidate evidence sections: What It Is, Used By Papers, Mechanism, Implementation Hooks, Failure Modes, Open Questions.
  - `What This Page Is For`: - Original research query: I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Source Facts`: - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Hardware-A...
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis?
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.
  - `Publish / Review Notes`: - Keep source facts, wiki synthesis, and user ideas separated during review.
- [[topics/MoE-quantization|MoE quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `MoE quantization`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `MoE quantization`.
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/MoE-quantization|MoE quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/rotation-b...
  - `Claims`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al.
  - `Key Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models]] - [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Ran...
  - `Key Concepts`: - [[concepts/K-means-objective-landscape|K-means objective landscape]] - [[concepts/Quantization-error-propagation|Quantization error propagation]] - [[concepts/Activation-outliers|Activation outliers]] - [[concepts/Per-channel-scaling|Per-channel scaling]]
- [[claims/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models-claim-002|Empirically, MM1 [52] and MoE-LLaVA [68] find that MoE implementation achieves better performance than the dense counterpart on almost all the benchmarks.]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Claim`: Empirically, MM1 [52] and MoE-LLaVA [68] find that MoE implementation achieves better performance than the dense counterpart on almost all the benchmarks.
  - `Supporting Evidence`: evidence-p0003

## Wiki Synthesis

- Working synthesis target: This page should consolidate a method family across papers: what the mechanism actually changes, what implementation choices matter, which evidence is comparable, and where the family fails.
- Intended use: I need a cross-paper method-family synthesis for MoE quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Source-fact boundary: use the retrieved `Source Facts` section for directly supported statements; keep this section as compiled wiki interpretation.
- Review contract:
  - Identify the shared mechanism before listing paper-specific variants.
  - Preserve implementation hooks that affect ablations or probes.
  - Separate evidence that supports the mechanism from evidence that only supports one paper's setting.
- Retrieval contract: future queries should be able to decide whether to read a method/topic/concept page first, which source papers to inspect next, and which uncertainty blocks a research decision.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.

## Evidence Map

- [[concepts/Lookup-table-inference|Lookup-table inference]]: candidate evidence sections: What It Is, Evidence / Provenance, Common Failure Modes, Retrieval Hooks, Implementation Implications, Where It Appears, Minimal Checks / Probes, Related Concepts, Why It Matters, Open Questions.
- [[methods/MoE-quantization|MoE quantization]]: candidate evidence sections: What It Is, Implementation Hooks, Used By Papers, Mechanism, Failure Modes, Open Questions.
- [[evidence/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo-evidence-p0001|evidence-p0001]]: candidate evidence sections: Evidence Item, Source, Supports.
- [[syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis|Outlier-Aware Quantization Method Family Synthesis]]: candidate evidence sections: Wiki Synthesis, Retrieval Hooks, Evidence Map, What This Page Is For, Source Facts, Open Questions, User Ideas / Decisions, Publish / Review Notes.
- [[topics/MoE-quantization|MoE quantization]]: candidate evidence sections: Scope, Retrieval Hooks, Method Families, Claims, Key Papers, Key Concepts.
- [[claims/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models-claim-002|Empirically, MM1 [52] and MoE-LLaVA [68] find that MoE implementation achieves better performance than the dense counterpart on almost all the benchmarks.]]: candidate evidence sections: Claim, Supporting Evidence.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a cross-paper method-family synthesis for MoE quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
  Use because: It is the original research intent that produced `Moe Quantization Method Family Synthesis`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[concepts/Lookup-table-inference|Lookup-table inference]]
- [[methods/MoE-quantization|MoE quantization]]
- [[evidence/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo-evidence-p0001|evidence-p0001]]
- [[syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis|Outlier-Aware Quantization Method Family Synthesis]]
- [[topics/MoE-quantization|MoE quantization]]
- [[claims/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models-claim-002|Empirically, MM1 [52] and MoE-LLaVA [68] find that MoE implementation achieves better performance than the dense counterpart on almost all the benchmarks.]]
