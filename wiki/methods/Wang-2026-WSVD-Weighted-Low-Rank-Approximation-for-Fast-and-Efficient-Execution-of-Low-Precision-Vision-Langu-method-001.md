---
type: "method"
title: "Wang 等 - 2026 - WSVD Weighted Low-Rank Approximation for Fast and Efficient Execution of Low-Precision Vision-Langu"
status: "draft"
sources:
  - "[[papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu|Wang 等 - 2026 - WSVD Weighted Low-Rank Approximation for Fast and Efficient Execution of Low-Precision Vision-Langu]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu.md"
related_papers:
  - "papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-869c9a5185"
consolidation_target: "methods/IO-aware-attention"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Wang 等 - 2026 - WSVD Weighted Low-Rank Approximation for Fast and Efficient Execution of Low-Precision Vision-Langu

- Source paper: [[papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu|Wang 等 - 2026 - WSVD Weighted Low-Rank Approximation for Fast and Efficient Execution of Low-Precision Vision-Langu]]
- Summary: Furthermore, recognizing that weight elements differ in their relative importance, we adap- tively allocate relative importance to each element during SVD process to better preserve accuracy, then extend this framework with quantization applied to both weights and activations, resulting in a highly efficient VLM. We further finetune the rotational matrices S2 together with Ah, Bh to minimize the change on the low-rank weights caused by quantization, with the objective as follows: min S2,Ah,Bh (F ′ h)1/2 ⊙  S1Wh −Q(S1AhS⊤ 2 ) Q(S2Bh)  2 (11) where F ′ h ≈Ex∼D[(S1g(x)) ⊙(S1g(x))]. • WSVD applies quantization alongside SVD decomposition to both the weights and activa- tions of the VLM.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights, KV-cache tensors, calibration data
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation, rotation-transformed equivalent model, latency or memory-efficiency measurements
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, calibration data reflects the activation/weight behavior relevant to deployment, inference is memory-bound enough that compression translates into speed or capacity gains
- Provenance: p. 6; p. 1; p. 2
