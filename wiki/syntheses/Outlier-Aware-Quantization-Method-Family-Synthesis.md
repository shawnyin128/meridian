---
type: "method-family"
title: "Outlier-Aware Quantization Method Family Synthesis"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Outlier-Aware-Quantization-Method-Family-Synthesis"
query: "I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
source_papers:
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/Lin-et-al-2024-DuQuant-Dis....md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et....md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar....md"
source_sections:
  - "concepts/Activation-outliers#What It Is"
  - "concepts/Activation-outliers#Evidence / Provenance"
  - "concepts/Activation-outliers#Common Failure Modes"
  - "concepts/Activation-outliers#Retrieval Hooks"
  - "concepts/Activation-outliers#Why It Matters"
  - "concepts/Activation-outliers#Minimal Checks / Probes"
  - "concepts/Activation-outliers#Where It Appears"
  - "concepts/Activation-outliers#Implementation Implications"
  - "concepts/Activation-outliers#Related Concepts"
  - "concepts/Activation-outliers#Open Questions"
  - "methods/outlier-aware-quantization#What It Is"
  - "methods/outlier-aware-quantization#Used By Papers"
  - "methods/outlier-aware-quantization#Mechanism"
  - "methods/outlier-aware-quantization#Implementation Hooks"
  - "methods/outlier-aware-quantization#Failure Modes"
  - "methods/outlier-aware-quantization#Open Questions"
  - "concepts/Quantization-error-propagation#What It Is"
  - "concepts/Quantization-error-propagation#Evidence / Provenance"
  - "concepts/Quantization-error-propagation#Implementation Implications"
  - "concepts/Quantization-error-propagation#Where It Appears"
  - "concepts/Quantization-error-propagation#Common Failure Modes"
  - "concepts/Quantization-error-propagation#Minimal Checks / Probes"
  - "concepts/Quantization-error-propagation#Related Concepts"
  - "concepts/Quantization-error-propagation#Why It Matters"
  - "concepts/Quantization-error-propagation#Open Questions"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Retrieval Hooks"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Wiki Synthesis"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Evidence Map"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#What This Page Is For"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Source Facts"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Open Questions"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#User Ideas / Decisions"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Publish / Review Notes"
  - "topics/hardware-aware-quantization#Scope"
  - "topics/hardware-aware-quantization#Method Families"
  - "topics/hardware-aware-quantization#Retrieval Hooks"
  - "topics/hardware-aware-quantization#Claims"
  - "topics/hardware-aware-quantization#Key Papers"
source_context: ".drafts/proposals/product-maturity-synthesis-r2/Outlier-Aware-Quantization-Method-Family-Synthesis/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/method-family"
aliases:
  - "Outlier-Aware Quantization Method Family Synthesis"
  - "I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
topics:
methods:
related:
  - "concepts/Activation-outliers"
  - "methods/outlier-aware-quantization"
  - "concepts/Quantization-error-propagation"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis"
  - "topics/hardware-aware-quantization"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
related_papers:
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/Lin-et-al-2024-DuQuant-Dis....md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et....md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar....md"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Outlier-Aware-Quantization-Method-Family-Synthesis"
sources:
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/Lin-et-al-2024-DuQuant-Dis....md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et....md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar....md"
  - "concepts/Activation-outliers.md"
  - "methods/outlier-aware-quantization.md"
  - "concepts/Quantization-error-propagation.md"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis.md"
  - "topics/hardware-aware-quantization.md"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003.md"
  - "concepts/Per-channel-scaling.md"
  - "concepts/Hessian-aware-reconstruction.md"
  - "methods/hardware-aware-quantization.md"
  - "methods/transformer-architecture.md"
  - "methods/post-training-quantization.md"
  - "methods/MoE-quantization.md"
  - "methods/calibration-aware-PTQ.md"
  - "methods/rotation-b....md"
supports:
contradicts:
supersedes:
superseded_by:
---
# Outlier-Aware Quantization Method Family Synthesis

## What This Page Is For

- Proposal type: `method-family`.
- Original research query: I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Publish target after review: `syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[concepts/Activation-outliers|Activation outliers]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: `Activation outliers` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Evidence / Provenance`: - 2024 - DuQuant Distributing Outliers via Dual Transformation Makes Stronger Quantized LLMs]]: lin et al 2024 duquant distributing outliers via dual transformation makes stronger quantized llms duquant dual transformation for massive and normal outliers low b...
  - `Common Failure Modes`: - An ablation looks stable on average metrics while failing on outlier-heavy layers.
  - `Retrieval Hooks`: - Use for PTQ, activation quantization, MoE quantization, and outlier smoothing ablations.
  - `Why It Matters`: - Outlier activations can dominate quantization scale choices and make low-bit activation or weight-activation quantization fail even when average error looks acceptable.
  - `Minimal Checks / Probes`: - Run an outlier-suppression ablation and check whether quantization error moves to another layer.
  - `Where It Appears`: - [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]] - [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition]] - [[papers/Lin-et-al-2024-DuQuant-Dis...
  - `Implementation Implications`: - Inspect per-channel and per-token activation ranges before choosing scaling or clipping. - Keep calibration data and routing/expert paths aligned with the target deployment regime.
  - `Related Concepts`: - [[concepts/Quantization-error-propagation|Quantization error propagation]] - [[concepts/Per-channel-scaling|Per-channel scaling]]
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[methods/outlier-aware-quantization|outlier-aware quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `outlier-aware quantization`.
  - `Used By Papers`: - [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]] - [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for]] - [[papers/2511-10645v1]]...
  - `Mechanism`: - [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: ### Activation-to-weight smoothing - Purpose: Migrat...
  - `Implementation Hooks`: - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference: Use the page as a routing map: extract taxonomy, representative methods, evidence gaps, and primary-paper followups....
  - `Failure Modes`: - [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Quantization-error-propagation|Quantization error propagation]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: `Quantization error propagation` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Evidence / Provenance`: - [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey syn...
  - `Implementation Implications`: - Measure local reconstruction error and downstream metric change separately. - When a layer looks harmless locally, probe whether later layers amplify the perturbation.
  - `Where It Appears`: - [[papers/1808-05779v3]] - [[papers/1909-13144v2]] - [[papers/2511-10645v1]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]] - [[papers/Ashkboos-et...
  - `Common Failure Modes`: - Optimizing one layer independently masks accumulated error. - Metrics degrade only after a later nonlinear or routing operation.
  - `Minimal Checks / Probes`: - Run layer-drop or layer-only quantization sweeps.
  - `Related Concepts`: - [[concepts/Activation-outliers|Activation outliers]] - [[concepts/Hessian-aware-reconstruction|Hessian-aware reconstruction]]
  - `Why It Matters`: - Quantization error is not only a local reconstruction problem; upstream activation or weight error can change downstream inputs, routing, and evaluation behavior.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis|Hardware-Aware Quantization Method Family Synthesis]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Hardware-Aware Quantization Met...
  - `Wiki Synthesis`: - Intended use: I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Evidence Map`: - [[methods/hardware-aware-quantization|hardware-aware quantization]]: candidate evidence sections: What It Is, Implementation Hooks, Mechanism, Used By Papers, Failure Modes, Open Questions.
  - `What This Page Is For`: - Original research query: I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Source Facts`: - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Post-Traini...
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis?
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.
  - `Publish / Review Notes`: - Keep source facts, wiki synthesis, and user ideas separated during review.
- [[topics/hardware-aware-quantization|hardware-aware quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `hardware-aware quantization`.
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/MoE-quantization|MoE quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/rotation-b...
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `hardware-aware quantization`.
  - `Claims`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Key Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar...
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: retrieved source page; extract only directly supported facts with page/section provenance.

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.

## Evidence Map

- [[concepts/Activation-outliers|Activation outliers]]: candidate evidence sections: What It Is, Evidence / Provenance, Common Failure Modes, Retrieval Hooks, Why It Matters, Minimal Checks / Probes, Where It Appears, Implementation Implications, Related Concepts, Open Questions.
- [[methods/outlier-aware-quantization|outlier-aware quantization]]: candidate evidence sections: What It Is, Used By Papers, Mechanism, Implementation Hooks, Failure Modes, Open Questions.
- [[concepts/Quantization-error-propagation|Quantization error propagation]]: candidate evidence sections: What It Is, Evidence / Provenance, Implementation Implications, Where It Appears, Common Failure Modes, Minimal Checks / Probes, Related Concepts, Why It Matters, Open Questions.
- [[syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis|Hardware-Aware Quantization Method Family Synthesis]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, Evidence Map, What This Page Is For, Source Facts, Open Questions, User Ideas / Decisions, Publish / Review Notes.
- [[topics/hardware-aware-quantization|hardware-aware quantization]]: candidate evidence sections: Scope, Method Families, Retrieval Hooks, Claims, Key Papers.
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: candidate evidence sections: needs manual section selection.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
  Use because: It is the original research intent that produced `Outlier-Aware Quantization Method Family Synthesis`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[concepts/Activation-outliers|Activation outliers]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis|Hardware-Aware Quantization Method Family Synthesis]]
- [[topics/hardware-aware-quantization|hardware-aware quantization]]
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]
