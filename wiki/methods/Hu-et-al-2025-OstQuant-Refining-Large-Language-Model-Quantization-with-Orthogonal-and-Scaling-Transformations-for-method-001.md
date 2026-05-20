---
type: "method"
title: "QSUR-guided orthogonal and scaling transformations"
status: "draft"
sources:
  - "[[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
related_papers:
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-fa3dd146da"
---
# QSUR-guided orthogonal and scaling transformations

- Source paper: [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]
- Summary: Introduces Quantization Space Utilization Rate as a quantizability metric, then learns orthogonal and scaling transformations to better fit weights/activations to the quantization space.
- Inputs: weight/activation distributions, QSUR metric, orthogonal matrix, scaling matrix
- Outputs: distribution-fitted transformed tensors, improved PTQ accuracy
- Assumptions: QSUR predicts quantization friendliness better than raw outlier magnitude alone, orthogonal plus scaling transforms can be optimized without breaking inference equivalence
- Provenance: p. 1; p. 2; p. 3; p. 4
