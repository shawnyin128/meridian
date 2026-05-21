---
type: "method"
title: "Sensitivity-based non-uniform quantization"
status: "draft"
sources:
  - "[[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
related_papers:
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-224c060199"
consolidation_target: "methods/sparse-outlier-retention"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Sensitivity-based non-uniform quantization

- Source paper: [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]
- Summary: Allocates non-uniform quantization centroids according to both weight distribution and sensitivity, so low-bit dense weights preserve model outputs better than uniform bins.
- Inputs: weight values, sensitivity estimates such as Fisher information, target bit width
- Outputs: non-uniform centroids, dense low-bit weight representation
- Assumptions: sensitive weights deserve smaller quantization error than insensitive weights, centroid placement should follow the paper's weighted clustering objective
- Provenance: p. 2; p. 4; p. 15; p. 18
