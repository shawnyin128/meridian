---
type: "method"
title: "Sadhukhan et al. - 2025 - MagicDec Breaking the Latency-Throughput Tradeoff for Long Context Generation with Speculative Deco"
status: "draft"
sources:
  - "[[papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco|Sadhukhan et al. - 2025 - MagicDec Breaking the Latency-Throughput Tradeoff for Long Context Generation with Speculative Deco]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Sadhukhan et al. - 2025 - MagicDec Breaking the Latency-Throughput Tradeoff for Long Context Generation with Speculative Deco

- Source paper: [[papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco|Sadhukhan et al. - 2025 - MagicDec Breaking the Latency-Throughput Tradeoff for Long Context Generation with Speculative Deco]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: draft model proposals, target model verification logits, acceptance or tree budget
- Outputs: verified accepted tokens, inference speedup without target-distribution change
- Assumptions: target-model verification preserves the original decoding distribution
- Provenance: p. 3; p. 8; p. 1
