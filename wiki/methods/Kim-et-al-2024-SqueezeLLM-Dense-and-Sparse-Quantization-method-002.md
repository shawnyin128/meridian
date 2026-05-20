---
type: "method"
title: "Dense-and-sparse decomposition"
status: "draft"
sources:
  - "[[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-002"
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
revision_id: "knowledge-5a9771a91a"
---
# Dense-and-sparse decomposition

- Source paper: [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]
- Summary: Splits the weight matrix into a dense quantized part plus a tiny FP16 sparse part containing outlier or highly sensitive values, reducing dense quantization range while keeping overhead low.
- Inputs: weight matrix, outlier thresholds, sensitivity mask, sparse storage format
- Outputs: dense quantized matrix, FP16 sparse matrix, overlappable dense+sparse inference path
- Assumptions: the sparse retained values are few enough to store and multiply cheaply, dense and sparse kernels can be overlapped or scheduled without erasing memory savings
- Provenance: p. 2; p. 3; p. 5; p. 6
