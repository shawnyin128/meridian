---
type: "method"
title: "Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration"
status: "draft"
sources:
  - "[[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration|Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
related_papers:
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e7de8f8228"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration

- Source paper: [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration|Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 1; p. 6; p. 2
