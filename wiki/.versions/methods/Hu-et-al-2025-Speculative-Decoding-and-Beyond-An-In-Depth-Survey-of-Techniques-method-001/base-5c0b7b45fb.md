---
type: "method"
title: "Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques"
status: "draft"
sources:
  - "[[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques

- Source paper: [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: draft model proposals, target model verification logits, acceptance or tree budget
- Outputs: verified accepted tokens, inference speedup without target-distribution change
- Assumptions: target-model verification preserves the original decoding distribution
- Provenance: p. 6; p. 4; p. 9
