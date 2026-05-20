---
type: "method-family"
title: "Post-Training Quantization Method Family Synthesis"
status: "draft"
created: "2026-05-20"
updated: "2026-05-20"
proposal_id: "Post-Training-Quantization-Method-Family-Synthesis"
query: "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
source_papers:
  - "methods/vision-language-model-quantization"
  - "topics/post-training-quantization"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
  - "methods/post-training-quantization"
  - "methods/layer-wise-PTQ"
  - "methods/equivalent-transform-PTQ"
source_sections:
  - "methods/vision-language-model-quantization#Mechanism"
  - "methods/vision-language-model-quantization#Implementation Hooks"
  - "methods/vision-language-model-quantization#Used By Papers"
  - "methods/vision-language-model-quantization#What It Is"
  - "methods/vision-language-model-quantization#Failure Modes"
  - "methods/vision-language-model-quantization#Open Questions"
  - "topics/post-training-quantization#Scope"
  - "topics/post-training-quantization#Retrieval Hooks"
  - "topics/post-training-quantization#Claims"
  - "topics/post-training-quantization#Method Families"
  - "topics/post-training-quantization#Key Papers"
  - "methods/post-training-quantization#What It Is"
  - "methods/post-training-quantization#Implementation Hooks"
  - "methods/post-training-quantization#Used By Papers"
  - "methods/post-training-quantization#Mechanism"
  - "methods/post-training-quantization#Failure Modes"
  - "methods/post-training-quantization#Open Questions"
  - "methods/layer-wise-PTQ#Mechanism"
  - "methods/layer-wise-PTQ#Implementation Hooks"
  - "methods/layer-wise-PTQ#Used By Papers"
  - "methods/layer-wise-PTQ#Failure Modes"
  - "methods/layer-wise-PTQ#What It Is"
  - "methods/layer-wise-PTQ#Open Questions"
  - "methods/equivalent-transform-PTQ#Used By Papers"
  - "methods/equivalent-transform-PTQ#Mechanism"
  - "methods/equivalent-transform-PTQ#Implementation Hooks"
  - "methods/equivalent-transform-PTQ#Failure Modes"
  - "methods/equivalent-transform-PTQ#What It Is"
  - "methods/equivalent-transform-PTQ#Open Questions"
source_context: ".drafts/proposals/final-synthesis-growth-r1/Post-Training-Quantization-Method-Family-Synthesis/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/method-family"
aliases:
  - "Post-Training Quantization Method Family Synthesis"
  - "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
topics:
methods:
related:
  - "methods/vision-language-model-quantization"
  - "topics/post-training-quantization"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
  - "methods/post-training-quantization"
  - "methods/layer-wise-PTQ"
  - "methods/equivalent-transform-PTQ"
related_papers:
  - "methods/vision-language-model-quantization"
  - "topics/post-training-quantization"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
  - "methods/post-training-quantization"
  - "methods/layer-wise-PTQ"
  - "methods/equivalent-transform-PTQ"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Post-Training-Quantization-Method-Family-Synthesis"
---
# Post-Training Quantization Method Family Synthesis

## What This Page Is For

- Proposal type: `method-family`.
- Original research query: I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Publish target after review: `syntheses/Post-Training-Quantization-Method-Family-Synthesis.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[methods/vision-language-model-quantization|vision-language model quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Mechanism`: - [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al.
  - `Implementation Hooks`: - [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al.
  - `Used By Papers`: - [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models]]
  - `What It Is`: This is a compiled method-family page for `vision-language model quantization`.
  - `Failure Modes`: - [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[topics/post-training-quantization|post-training quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `post-training quantization`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `post-training quantization`.
  - `Claims`: - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: Arai and Ichikawa - 2025 - Quantizat...
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/hardware-aware-quantization|hardware-aware quantization]]...
  - `Key Papers`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]] - [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers...
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: retrieved source page; extract only directly supported facts with page/section provenance.
- [[methods/post-training-quantization|post-training quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `post-training quantization`.
  - `Implementation Hooks`: - Quantization: Log pre/post-qu...
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar...
  - `Mechanism`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Failure Modes`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[methods/layer-wise-PTQ|layer-wise PTQ]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Mechanism`: - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: ### Quantization Error Propagation -...
  - `Implementation Hooks`: - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: - Quantization Error Propagation: Te...
  - `Used By Papers`: - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]]
  - `Failure Modes`: - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: - Calibration-set representativeness...
  - `What It Is`: This is a compiled method-family page for `layer-wise PTQ`.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[methods/equivalent-transform-PTQ|equivalent-transform PTQ]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Used By Papers`: - [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]] - [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference]] - [[papers/Ashkboos-et-al-2024-QuaRot-Ou...
  - `Mechanism`: - [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al.
  - `Implementation Hooks`: - [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al.
  - `Failure Modes`: - [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al.
  - `What It Is`: This is a compiled method-family page for `equivalent-transform PTQ`.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.

## Evidence Map

- [[methods/vision-language-model-quantization|vision-language model quantization]]: candidate evidence sections: Mechanism, Implementation Hooks, Used By Papers, What It Is, Failure Modes, Open Questions.
- [[topics/post-training-quantization|post-training quantization]]: candidate evidence sections: Scope, Retrieval Hooks, Claims, Method Families, Key Papers.
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: candidate evidence sections: needs manual section selection.
- [[methods/post-training-quantization|post-training quantization]]: candidate evidence sections: What It Is, Implementation Hooks, Used By Papers, Mechanism, Failure Modes, Open Questions.
- [[methods/layer-wise-PTQ|layer-wise PTQ]]: candidate evidence sections: Mechanism, Implementation Hooks, Used By Papers, Failure Modes, What It Is, Open Questions.
- [[methods/equivalent-transform-PTQ|equivalent-transform PTQ]]: candidate evidence sections: Used By Papers, Mechanism, Implementation Hooks, Failure Modes, What It Is, Open Questions.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
  Use because: It is the original research intent that produced `Post-Training Quantization Method Family Synthesis`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[methods/vision-language-model-quantization|vision-language model quantization]]
- [[topics/post-training-quantization|post-training quantization]]
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/layer-wise-PTQ|layer-wise PTQ]]
- [[methods/equivalent-transform-PTQ|equivalent-transform PTQ]]
