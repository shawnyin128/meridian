---
type: "synthesis"
title: "Hardware-Aware Quantization Topic Overview"
status: "draft"
created: "2026-05-20"
updated: "2026-05-20"
proposal_id: "Hardware-Aware-Quantization-Topic-Overview"
query: "I need a topic overview for hardware-aware quantization that connects key papers, method families, claims, evidence, and open questions."
source_papers:
  - "methods/hardware-aware-quantization"
  - "topics/hardware-aware-quantization"
  - "claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004"
  - "methods/non-uniform-weight-quantization"
  - "methods/outlier-aware-quantization"
  - "methods/quantization-aware-training"
source_sections:
  - "methods/hardware-aware-quantization#What It Is"
  - "methods/hardware-aware-quantization#Mechanism"
  - "methods/hardware-aware-quantization#Failure Modes"
  - "methods/hardware-aware-quantization#Implementation Hooks"
  - "methods/hardware-aware-quantization#Used By Papers"
  - "methods/hardware-aware-quantization#Open Questions"
  - "topics/hardware-aware-quantization#Scope"
  - "topics/hardware-aware-quantization#Retrieval Hooks"
  - "topics/hardware-aware-quantization#Claims"
  - "topics/hardware-aware-quantization#Key Papers"
  - "topics/hardware-aware-quantization#Method Families"
  - "methods/non-uniform-weight-quantization#What It Is"
  - "methods/non-uniform-weight-quantization#Failure Modes"
  - "methods/non-uniform-weight-quantization#Implementation Hooks"
  - "methods/non-uniform-weight-quantization#Mechanism"
  - "methods/non-uniform-weight-quantization#Used By Papers"
  - "methods/non-uniform-weight-quantization#Open Questions"
  - "methods/outlier-aware-quantization#What It Is"
  - "methods/outlier-aware-quantization#Failure Modes"
  - "methods/outlier-aware-quantization#Mechanism"
  - "methods/outlier-aware-quantization#Implementation Hooks"
  - "methods/outlier-aware-quantization#Used By Papers"
  - "methods/outlier-aware-quantization#Open Questions"
  - "methods/quantization-aware-training#What It Is"
  - "methods/quantization-aware-training#Failure Modes"
  - "methods/quantization-aware-training#Mechanism"
  - "methods/quantization-aware-training#Implementation Hooks"
  - "methods/quantization-aware-training#Used By Papers"
  - "methods/quantization-aware-training#Open Questions"
source_context: ".drafts/proposals/final-synthesis-growth-r1/Hardware-Aware-Quantization-Topic-Overview/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/synthesis"
aliases:
  - "Hardware-Aware Quantization Topic Overview"
  - "I need a topic overview for hardware-aware quantization that connects key papers, method families, claims, evidence, and open questions."
topics:
methods:
related:
  - "methods/hardware-aware-quantization"
  - "topics/hardware-aware-quantization"
  - "claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004"
  - "methods/non-uniform-weight-quantization"
  - "methods/outlier-aware-quantization"
  - "methods/quantization-aware-training"
related_papers:
  - "methods/hardware-aware-quantization"
  - "topics/hardware-aware-quantization"
  - "claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004"
  - "methods/non-uniform-weight-quantization"
  - "methods/outlier-aware-quantization"
  - "methods/quantization-aware-training"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Hardware-Aware-Quantization-Topic-Overview"
---
# Hardware-Aware Quantization Topic Overview

## What This Page Is For

- Proposal type: `synthesis`.
- Original research query: I need a topic overview for hardware-aware quantization that connects key papers, method families, claims, evidence, and open questions.
- Publish target after review: `syntheses/Hardware-Aware-Quantization-Topic-Overview.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[methods/hardware-aware-quantization|hardware-aware quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `hardware-aware quantization`.
  - `Mechanism`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Failure Modes`: - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute.
  - `Implementation Hooks`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[topics/hardware-aware-quantization|hardware-aware quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `hardware-aware quantization`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `hardware-aware quantization`.
  - `Claims`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Key Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar...
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/MoE-quantization|MoE quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/rotation-b...
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]: retrieved source page; extract only directly supported facts with page/section provenance.
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.
  - `Failure Modes`: Open questions: - Do key figu...
  - `Implementation Hooks`: - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: - LUT-based system implementation: Separate algorithmic accuracy claims from GPU simulation and CPU kernel speed claims.
  - `Mechanism`: - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runt...
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]] - [[papers/1909-13144v2]] - [[papers/Li-et-al-2020-Additive-Powers-of...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[methods/outlier-aware-quantization|outlier-aware quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `outlier-aware quantization`.
  - `Failure Modes`: Open questions: - Do key f...
  - `Mechanism`: - [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: ### Activation-to-weight smoothing - Purpose: Migrat...
  - `Implementation Hooks`: - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference: Use the page as a routing map: extract taxonomy, representative methods, evidence gaps, and primary-paper followups....
  - `Used By Papers`: - [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]] - [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for]] - [[papers/2511-10645v1]]...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[methods/quantization-aware-training|quantization-aware training]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `quantization-aware training`.
  - `Failure Modes`: Open questions: - Do key...
  - `Mechanism`: - [[papers/1808-05779v3|1808.05779v3]]: ### Quantization Interval Learning - Purpose: Learns quantization interval parameters jointly with task loss so clipping/pruning and bit assignment are optimized for network accuracy instead of fixed min-max ranges.
  - `Implementation Hooks`: - [[papers/1808-05779v3|1808.05779v3]]: - Quantization Interval Learning: Implement interval parameters as trainable quantizer state and verify gradients flow through the quantizer surrogate.
  - `Used By Papers`: - [[papers/1808-05779v3]] - [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss]] - [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization]]
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a topic overview for hardware-aware quantization that connects key papers, method families, claims, evidence, and open questions.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.

## Evidence Map

- [[methods/hardware-aware-quantization|hardware-aware quantization]]: candidate evidence sections: What It Is, Mechanism, Failure Modes, Implementation Hooks, Used By Papers, Open Questions.
- [[topics/hardware-aware-quantization|hardware-aware quantization]]: candidate evidence sections: Scope, Retrieval Hooks, Claims, Key Papers, Method Families.
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]: candidate evidence sections: needs manual section selection.
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]: candidate evidence sections: What It Is, Failure Modes, Implementation Hooks, Mechanism, Used By Papers, Open Questions.
- [[methods/outlier-aware-quantization|outlier-aware quantization]]: candidate evidence sections: What It Is, Failure Modes, Mechanism, Implementation Hooks, Used By Papers, Open Questions.
- [[methods/quantization-aware-training|quantization-aware training]]: candidate evidence sections: What It Is, Failure Modes, Mechanism, Implementation Hooks, Used By Papers, Open Questions.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a topic overview for hardware-aware quantization that connects key papers, method families, claims, evidence, and open questions."
  Use because: It is the original research intent that produced `Hardware-Aware Quantization Topic Overview`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[topics/hardware-aware-quantization|hardware-aware quantization]]
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/quantization-aware-training|quantization-aware training]]
