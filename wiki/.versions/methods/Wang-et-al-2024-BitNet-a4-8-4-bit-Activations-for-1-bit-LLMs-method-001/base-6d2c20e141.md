---
type: "method"
title: "Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs"
status: "draft"
sources:
  - "[[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs

- Source paper: [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 2; p. 1; p. 9
