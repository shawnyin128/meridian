---
type: "method"
title: "LUT-based system implementation"
status: "draft"
sources:
  - "[[papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs|Guo 等 - 2025 - Fast Matrix Multiplications for Lookup Table-Quantized LLMs]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs.md"
related_papers:
  - "papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-13c059a20c"
consolidation_target: "methods/hardware-aware-quantization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# LUT-based system implementation

- Source paper: [[papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs|Guo 等 - 2025 - Fast Matrix Multiplications for Lookup Table-Quantized LLMs]]
- Summary: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inference.
- Inputs: cluster assignments, centroids, quantized activations, target GPU or CPU kernel path
- Outputs: LUT-backed low-bit inference path, latency and memory measurements
- Assumptions: target hardware can exploit lookup-table execution efficiently, reported speedups depend on kernel/simulator/CPU setup
- Provenance: p. 1; p. 2; p. 3; p. 4
