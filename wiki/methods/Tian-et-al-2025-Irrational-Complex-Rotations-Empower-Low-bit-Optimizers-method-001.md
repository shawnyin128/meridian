---
type: "method"
title: "Tian et al. - 2025 - Irrational Complex Rotations Empower Low-bit Optimizers"
status: "draft"
sources:
  - "[[papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers|Tian et al. - 2025 - Irrational Complex Rotations Empower Low-bit Optimizers]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Tian et al. - 2025 - Irrational Complex Rotations Empower Low-bit Optimizers

- Source paper: [[papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers|Tian et al. - 2025 - Irrational Complex Rotations Empower Low-bit Optimizers]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 3; p. 2; p. 9
