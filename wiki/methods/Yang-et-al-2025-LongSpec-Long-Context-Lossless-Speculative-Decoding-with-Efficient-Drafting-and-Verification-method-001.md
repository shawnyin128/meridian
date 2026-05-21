---
type: "method"
title: "Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification"
status: "draft"
sources:
  - "[[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification|Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
related_papers:
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-b7fcae8b08"
consolidation_target: "methods/speculative-decoding"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification

- Source paper: [[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification|Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: draft model proposals, target model verification logits, acceptance or tree budget
- Outputs: verified accepted tokens, inference speedup without target-distribution change
- Assumptions: target-model verification preserves the original decoding distribution
- Provenance: p. 2; p. 4; p. 8
