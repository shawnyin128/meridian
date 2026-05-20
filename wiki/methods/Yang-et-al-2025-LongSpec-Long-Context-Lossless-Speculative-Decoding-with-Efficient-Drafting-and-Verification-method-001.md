---
type: "method"
title: "Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification"
status: "draft"
sources:
  - "[[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification|Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification

- Source paper: [[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification|Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: draft model proposals, target model verification logits, acceptance or tree budget
- Outputs: verified accepted tokens, inference speedup without target-distribution change
- Assumptions: target-model verification preserves the original decoding distribution
- Provenance: p. 2; p. 4; p. 8
