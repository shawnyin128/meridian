---
type: "method-family"
title: "Hardware-Aware Quantization Method Family Synthesis"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Hardware-Aware-Quantization-Method-Family-Synthesis"
query: "I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
source_papers:
  - "concepts/Quantization-error-propagation"
  - "methods/hardware-aware-quantization"
  - "concepts/Activation-outliers"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis"
  - "topics/hardware-aware-quantization"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
source_sections:
  - "concepts/Quantization-error-propagation#What It Is"
  - "concepts/Quantization-error-propagation#Evidence / Provenance"
  - "concepts/Quantization-error-propagation#Implementation Implications"
  - "concepts/Quantization-error-propagation#Common Failure Modes"
  - "concepts/Quantization-error-propagation#Where It Appears"
  - "concepts/Quantization-error-propagation#Minimal Checks / Probes"
  - "concepts/Quantization-error-propagation#Related Concepts"
  - "concepts/Quantization-error-propagation#Why It Matters"
  - "concepts/Quantization-error-propagation#Open Questions"
  - "methods/hardware-aware-quantization#What It Is"
  - "methods/hardware-aware-quantization#Implementation Hooks"
  - "methods/hardware-aware-quantization#Mechanism"
  - "methods/hardware-aware-quantization#Used By Papers"
  - "methods/hardware-aware-quantization#Failure Modes"
  - "methods/hardware-aware-quantization#Open Questions"
  - "concepts/Activation-outliers#What It Is"
  - "concepts/Activation-outliers#Evidence / Provenance"
  - "concepts/Activation-outliers#Implementation Implications"
  - "concepts/Activation-outliers#Common Failure Modes"
  - "concepts/Activation-outliers#Retrieval Hooks"
  - "concepts/Activation-outliers#Where It Appears"
  - "concepts/Activation-outliers#Why It Matters"
  - "concepts/Activation-outliers#Minimal Checks / Probes"
  - "concepts/Activation-outliers#Related Concepts"
  - "concepts/Activation-outliers#Open Questions"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Retrieval Hooks"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Wiki Synthesis"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Evidence Map"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#What This Page Is For"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Source Facts"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Open Questions"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#User Ideas / Decisions"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Publish / Review Notes"
  - "topics/hardware-aware-quantization#Scope"
  - "topics/hardware-aware-quantization#Retrieval Hooks"
  - "topics/hardware-aware-quantization#Method Families"
  - "topics/hardware-aware-quantization#Claims"
  - "topics/hardware-aware-quantization#Key Papers"
source_context: ".drafts/proposals/product-maturity-synthesis-r1/Hardware-Aware-Quantization-Method-Family-Synthesis/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/method-family"
aliases:
  - "Hardware-Aware Quantization Method Family Synthesis"
  - "I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
topics:
methods:
related:
  - "concepts/Quantization-error-propagation"
  - "methods/hardware-aware-quantization"
  - "concepts/Activation-outliers"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis"
  - "topics/hardware-aware-quantization"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
related_papers:
  - "concepts/Quantization-error-propagation"
  - "methods/hardware-aware-quantization"
  - "concepts/Activation-outliers"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis"
  - "topics/hardware-aware-quantization"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Hardware-Aware-Quantization-Method-Family-Synthesis"
---
# Hardware-Aware Quantization Method Family Synthesis

## What This Page Is For

- Proposal type: `method-family`.
- Original research query: I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Publish target after review: `syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[concepts/Quantization-error-propagation|Quantization error propagation]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: `Quantization error propagation` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Evidence / Provenance`: - [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey syn...
  - `Implementation Implications`: - Measure local reconstruction error and downstream metric change separately. - When a layer looks harmless locally, probe whether later layers amplify the perturbation.
  - `Common Failure Modes`: - Optimizing one layer independently masks accumulated error. - Metrics degrade only after a later nonlinear or routing operation.
  - `Where It Appears`: - [[papers/1808-05779v3]] - [[papers/1909-13144v2]] - [[papers/2511-10645v1]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]] - [[papers/Ashkboos-et...
  - `Minimal Checks / Probes`: - Run layer-drop or layer-only quantization sweeps.
  - `Related Concepts`: - [[concepts/Activation-outliers|Activation outliers]] - [[concepts/Hessian-aware-reconstruction|Hessian-aware reconstruction]]
  - `Why It Matters`: - Quantization error is not only a local reconstruction problem; upstream activation or weight error can change downstream inputs, routing, and evaluation behavior.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[methods/hardware-aware-quantization|hardware-aware quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `hardware-aware quantization`.
  - `Implementation Hooks`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Mechanism`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar...
  - `Failure Modes`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Activation-outliers|Activation outliers]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: `Activation outliers` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Evidence / Provenance`: - 2024 - DuQuant Distributing Outliers via Dual Transformation Makes Stronger Quantized LLMs]]: lin et al 2024 duquant distributing outliers via dual transformation makes stronger quantized llms duquant dual transformation for massive and normal outliers low b...
  - `Implementation Implications`: - Inspect per-channel and per-token activation ranges before choosing scaling or clipping. - Keep calibration data and routing/expert paths aligned with the target deployment regime.
  - `Common Failure Modes`: - A global scale hides rare channels that drive most error. - An ablation looks stable on average metrics while failing on outlier-heavy layers.
  - `Retrieval Hooks`: - Use for PTQ, activation quantization, MoE quantization, and outlier smoothing ablations.
  - `Where It Appears`: - [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]] - [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition]] - [[papers/Lin-et-al-2024-DuQuant-Dis...
  - `Why It Matters`: - Outlier activations can dominate quantization scale choices and make low-bit activation or weight-activation quantization fail even when average error looks acceptable.
  - `Minimal Checks / Probes`: - Run an outlier-suppression ablation and check whether quantization error moves to another layer.
  - `Related Concepts`: - [[concepts/Quantization-error-propagation|Quantization error propagation]] - [[concepts/Per-channel-scaling|Per-channel scaling]]
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[syntheses/Post-Training-Quantization-Method-Family-Synthesis|Post-Training Quantization Method Family Synthesis]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Post-Training Quantization Metho...
  - `Wiki Synthesis`: - Intended use: I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Evidence Map`: - [[methods/vision-language-model-quantization|vision-language model quantization]]: candidate evidence sections: Mechanism, Implementation Hooks, Used By Papers, What It Is, Failure Modes, Open Questions.
  - `What This Page Is For`: - Original research query: I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Source Facts`: - `Failure Modes`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis?
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.
  - `Publish / Review Notes`: - Keep source facts, wiki synthesis, and user ideas separated during review.
- [[topics/hardware-aware-quantization|hardware-aware quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `hardware-aware quantization`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `hardware-aware quantization`.
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/MoE-quantization|MoE quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/rotation-b...
  - `Claims`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Key Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar...
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: retrieved source page; extract only directly supported facts with page/section provenance.

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.

## Evidence Map

- [[concepts/Quantization-error-propagation|Quantization error propagation]]: candidate evidence sections: What It Is, Evidence / Provenance, Implementation Implications, Common Failure Modes, Where It Appears, Minimal Checks / Probes, Related Concepts, Why It Matters, Open Questions.
- [[methods/hardware-aware-quantization|hardware-aware quantization]]: candidate evidence sections: What It Is, Implementation Hooks, Mechanism, Used By Papers, Failure Modes, Open Questions.
- [[concepts/Activation-outliers|Activation outliers]]: candidate evidence sections: What It Is, Evidence / Provenance, Implementation Implications, Common Failure Modes, Retrieval Hooks, Where It Appears, Why It Matters, Minimal Checks / Probes, Related Concepts, Open Questions.
- [[syntheses/Post-Training-Quantization-Method-Family-Synthesis|Post-Training Quantization Method Family Synthesis]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, Evidence Map, What This Page Is For, Source Facts, Open Questions, User Ideas / Decisions, Publish / Review Notes.
- [[topics/hardware-aware-quantization|hardware-aware quantization]]: candidate evidence sections: Scope, Retrieval Hooks, Method Families, Claims, Key Papers.
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: candidate evidence sections: needs manual section selection.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
  Use because: It is the original research intent that produced `Hardware-Aware Quantization Method Family Synthesis`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[concepts/Activation-outliers|Activation outliers]]
- [[syntheses/Post-Training-Quantization-Method-Family-Synthesis|Post-Training Quantization Method Family Synthesis]]
- [[topics/hardware-aware-quantization|hardware-aware quantization]]
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]
