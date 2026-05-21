---
type: "synthesis"
title: "Low-Bit Quantization Topic Overview"
status: "draft"
created: "2026-05-20"
updated: "2026-05-20"
proposal_id: "Low-Bit-Quantization-Topic-Overview"
query: "I need a topic overview for low-bit quantization that connects key papers, method families, claims, evidence, and open questions."
source_papers:
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Wang-....md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/1808-05779v3.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/1909-13144v2.md"
  - "papers/Li-et-al-2020-Additive-Powers-of....md"
source_sections:
  - "methods/learned-step-size-quantization#What It Is"
  - "methods/learned-step-size-quantization#Failure Modes"
  - "methods/learned-step-size-quantization#Mechanism"
  - "methods/learned-step-size-quantization#Implementation Hooks"
  - "methods/learned-step-size-quantization#Used By Papers"
  - "methods/learned-step-size-quantization#Open Questions"
  - "topics/low-bit-quantization#Scope"
  - "topics/low-bit-quantization#Key Papers"
  - "topics/low-bit-quantization#Retrieval Hooks"
  - "topics/low-bit-quantization#Claims"
  - "topics/low-bit-quantization#Method Families"
  - "methods/outlier-aware-quantization#What It Is"
  - "methods/outlier-aware-quantization#Mechanism"
  - "methods/outlier-aware-quantization#Failure Modes"
  - "methods/outlier-aware-quantization#Implementation Hooks"
  - "methods/outlier-aware-quantization#Used By Papers"
  - "methods/outlier-aware-quantization#Open Questions"
  - "methods/quantization-aware-training#What It Is"
  - "methods/quantization-aware-training#Failure Modes"
  - "methods/quantization-aware-training#Mechanism"
  - "methods/quantization-aware-training#Used By Papers"
  - "methods/quantization-aware-training#Implementation Hooks"
  - "methods/quantization-aware-training#Open Questions"
  - "methods/non-uniform-weight-quantization#What It Is"
  - "methods/non-uniform-weight-quantization#Failure Modes"
  - "methods/non-uniform-weight-quantization#Implementation Hooks"
  - "methods/non-uniform-weight-quantization#Mechanism"
  - "methods/non-uniform-weight-quantization#Used By Papers"
  - "methods/non-uniform-weight-quantization#Open Questions"
source_context: ".drafts/proposals/final-synthesis-growth-r1/Low-Bit-Quantization-Topic-Overview/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/synthesis"
aliases:
  - "Low-Bit Quantization Topic Overview"
  - "I need a topic overview for low-bit quantization that connects key papers, method families, claims, evidence, and open questions."
topics:
methods:
related:
  - "methods/learned-step-size-quantization"
  - "topics/low-bit-quantization"
  - "claims/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization-claim-003"
  - "methods/outlier-aware-quantization"
  - "methods/quantization-aware-training"
  - "methods/non-uniform-weight-quantization"
related_papers:
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Wang-....md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/1808-05779v3.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/1909-13144v2.md"
  - "papers/Li-et-al-2020-Additive-Powers-of....md"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Low-Bit-Quantization-Topic-Overview"
sources:
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Wang-....md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/1808-05779v3.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/1909-13144v2.md"
  - "papers/Li-et-al-2020-Additive-Powers-of....md"
  - "methods/learned-step-size-quantization.md"
  - "topics/low-bit-quantization.md"
  - "claims/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization-claim-003.md"
  - "methods/outlier-aware-quantization.md"
  - "methods/quantization-aware-training.md"
  - "methods/non-uniform-weight-quantization.md"
  - "methods/transformer-architecture.md"
  - "methods/post-training-quantization.md"
  - "methods/calibration-aware-PTQ.md"
  - "methods/hardware-aware-quantization.md"
supports:
contradicts:
supersedes:
superseded_by:
---
# Low-Bit Quantization Topic Overview

## What This Page Is For

- Proposal type: `synthesis`.
- Original research query: I need a topic overview for low-bit quantization that connects key papers, method families, claims, evidence, and open questions.
- Publish target after review: `syntheses/Low-Bit-Quantization-Topic-Overview.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[methods/learned-step-size-quantization|learned step-size quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.
  - `Failure Modes`: - [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al.
  - `Mechanism`: - [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al.
  - `Implementation Hooks`: - [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al.
  - `Used By Papers`: - [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization]]
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[topics/low-bit-quantization|low-bit quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `low-bit quantization`.
  - `Key Papers`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Wang-...
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `low-bit quantization`.
  - `Claims`: - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees|Chee et al.
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/hardware-aware-quantization|hardware-aware quantization]]...
- [[claims/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization-claim-003|Although these methods work well on typical 8-bit quantization, they were not able to achieve good accuracy on very low-bit (2, 3, 4-bit) quantization.]]: retrieved source page; extract only directly supported facts with page/section provenance.
- [[methods/outlier-aware-quantization|outlier-aware quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.
  - `Mechanism`: - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: ### Sensitivity-based non-uniform quantization - Purpose: Allocates non-uniform quantization centroids according to both weight distribution and sensitivity, so low-bit dense weights preserve model outputs b...
  - `Failure Modes`: Open questions: - Do key f...
  - `Implementation Hooks`: - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs: Verify transformation equivalence before quantizing, then measure quantization error after rotation.
  - `Used By Papers`: - [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]] - [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for]] - [[papers/2511-10645v1]]...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[methods/quantization-aware-training|quantization-aware training]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.
  - `Failure Modes`: Open questions: - Do key...
  - `Mechanism`: - [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al.
  - `Used By Papers`: - [[papers/1808-05779v3]] - [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss]] - [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization]]
  - `Implementation Hooks`: - [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.
  - `Failure Modes`: - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute.
  - `Implementation Hooks`: - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: - LUT-based system implementation: Separate algorithmic accuracy claims from GPU simulation and CPU kernel speed claims.
  - `Mechanism`: - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: ### Sensitivity-based non-uniform quantization - Purpose: Allocates non-uniform quantization centroids according to both weight distribution and sensitivity, so low-bit dense weights preserve model outputs b...
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]] - [[papers/1909-13144v2]] - [[papers/Li-et-al-2020-Additive-Powers-of...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a topic overview for low-bit quantization that connects key papers, method families, claims, evidence, and open questions.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.

## Evidence Map

- [[methods/learned-step-size-quantization|learned step-size quantization]]: candidate evidence sections: What It Is, Failure Modes, Mechanism, Implementation Hooks, Used By Papers, Open Questions.
- [[topics/low-bit-quantization|low-bit quantization]]: candidate evidence sections: Scope, Key Papers, Retrieval Hooks, Claims, Method Families.
- [[claims/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization-claim-003|Although these methods work well on typical 8-bit quantization, they were not able to achieve good accuracy on very low-bit (2, 3, 4-bit) quantization.]]: candidate evidence sections: needs manual section selection.
- [[methods/outlier-aware-quantization|outlier-aware quantization]]: candidate evidence sections: What It Is, Mechanism, Failure Modes, Implementation Hooks, Used By Papers, Open Questions.
- [[methods/quantization-aware-training|quantization-aware training]]: candidate evidence sections: What It Is, Failure Modes, Mechanism, Used By Papers, Implementation Hooks, Open Questions.
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]: candidate evidence sections: What It Is, Failure Modes, Implementation Hooks, Mechanism, Used By Papers, Open Questions.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a topic overview for low-bit quantization that connects key papers, method families, claims, evidence, and open questions."
  Use because: It is the original research intent that produced `Low-Bit Quantization Topic Overview`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[methods/learned-step-size-quantization|learned step-size quantization]]
- [[topics/low-bit-quantization|low-bit quantization]]
- [[claims/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization-claim-003|Although these methods work well on typical 8-bit quantization, they were not able to achieve good accuracy on very low-bit (2, 3, 4-bit) quantization.]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/quantization-aware-training|quantization-aware training]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
