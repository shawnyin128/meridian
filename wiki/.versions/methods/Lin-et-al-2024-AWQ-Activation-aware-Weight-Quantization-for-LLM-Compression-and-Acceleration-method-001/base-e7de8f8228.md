---
type: "method"
title: "Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration"
status: "draft"
sources:
  - "[[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration|Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration

- Source paper: [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration|Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 1; p. 6; p. 2
