---
type: "method"
title: "Equivalent affine transformation quantization"
status: "draft"
sources:
  - "[[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models|Ma et al. - 2024 - AffineQuant Affine Transformation Quantization for Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
related_papers:
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-cd95ad8a4d"
consolidation_target: "methods/equivalent-transform-PTQ"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Equivalent affine transformation quantization

- Source paper: [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models|Ma et al. - 2024 - AffineQuant Affine Transformation Quantization for Large Language Models]]
- Summary: Optimizes invertible affine transformations around linear layers so transformed weights and activations are easier to quantize while preserving the original matrix product before quantization.
- Inputs: activation matrix, weight matrix, invertible affine transform
- Outputs: transformed activation/weight pair, lower-error PTQ result
- Assumptions: the affine transform remains invertible and numerically stable, equivalence before quantization carries over to lower quantization error after quantization
- Provenance: p. 1; p. 3; p. 4; p. 5
