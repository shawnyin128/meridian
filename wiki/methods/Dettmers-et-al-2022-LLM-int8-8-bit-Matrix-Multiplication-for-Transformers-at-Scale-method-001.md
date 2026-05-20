---
type: "method"
title: "Vector-wise int8 quantization"
status: "draft"
sources:
  - "[[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale|Dettmers et al. - 2022 - LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale.md"
related_papers:
  - "papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-de8323e90e"
---
# Vector-wise int8 quantization

- Source paper: [[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale|Dettmers et al. - 2022 - LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale]]
- Summary: Uses row-wise activation scales and column-wise weight scales for int8 matrix multiplication so transformer linear layers can run in 8-bit with limited error.
- Inputs: activation matrix, weight matrix, row/column absmax scales
- Outputs: int8 operands, int32 matmul result, dequantized output
- Assumptions: vector-wise scaling is enough for non-outlier dimensions, hardware kernels can exploit int8 matrix multiplication efficiently
- Provenance: p. 7; p. 1; p. 2
