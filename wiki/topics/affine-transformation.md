---
type: "topic"
title: "affine transformation"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
source_papers:
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
related_papers:
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
related_methods:
  - "post-training quantization"
  - "equivalent-transform PTQ"
  - "calibration-aware PTQ"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-d144282c4c"
---
# affine transformation

## Scope

This topic page compiles canonical paper pages around `affine transformation`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models]]
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization]]

## Method Families

- [[methods/post-training-quantization|post-training quantization]]
- [[methods/equivalent-transform-PTQ|equivalent-transform PTQ]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]

## Claims

- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models|Ma et al. - 2024 - AffineQuant Affine Transformation Quantization for Large Language Models]]: Ma et al. - 2024 - AffineQuant Affine Transformation Quantization for Large Language Models: Optimizes invertible affine transformations around linear layers so transformed weights and activations are easier to quantize...
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization|Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization]]: Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization: Learns affine transformations that flatten weight and activation distributions before quantization, using decomposed transforms to balance quantization...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `affine transformation`.
## Key Concepts

- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[concepts/Activation-outliers|Activation outliers]]
- [[concepts/Per-channel-scaling|Per-channel scaling]]
