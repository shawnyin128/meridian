---
type: "method"
title: "LUT-based system implementation"
status: "draft"
sources:
  - "[[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
related_papers:
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-c4983dcca1"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# LUT-based system implementation

- Source paper: [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]
- Summary: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inference.
- Inputs: cluster assignments, centroids, quantized activations, target GPU or CPU kernel path
- Outputs: LUT-backed low-bit inference path, latency and memory measurements
- Assumptions: target hardware can exploit lookup-table execution efficiently, reported speedups depend on kernel/simulator/CPU setup
- Provenance: p. 1; p. 2; p. 3; p. 4
