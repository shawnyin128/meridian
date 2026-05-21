---
type: "method"
title: "Dual transformation for massive and normal outliers"
status: "draft"
sources:
  - "[[papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs|Lin et al. - 2024 - DuQuant Distributing Outliers via Dual Transformation Makes Stronger Quantized LLMs]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs.md"
related_papers:
  - "papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-51fb7f3717"
consolidation_target: "methods/outlier-aware-quantization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Dual transformation for massive and normal outliers

- Source paper: [[papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs|Lin et al. - 2024 - DuQuant Distributing Outliers via Dual Transformation Makes Stronger Quantized LLMs]]
- Summary: Combines block-wise rotation with zigzag permutation to distribute massive and normal activation outliers across blocks, then absorbs the inverse transform into weights before low-bit quantization.
- Inputs: activation matrix with massive/normal outliers, weight matrix, block rotation, zigzag permutation
- Outputs: transformed activations, inverse-transformed weights, lower-error W4A4/W6A6 quantization
- Assumptions: outliers can be reduced by distributing them across feature blocks, the invertible transform preserves the original linear output before quantization
- Provenance: p. 1; p. 2; p. 3; p. 4
