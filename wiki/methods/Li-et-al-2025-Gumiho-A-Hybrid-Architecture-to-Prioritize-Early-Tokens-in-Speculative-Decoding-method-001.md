---
type: "method"
title: "Li et al. - 2025 - Gumiho A Hybrid Architecture to Prioritize Early Tokens in Speculative Decoding"
status: "draft"
sources:
  - "[[papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding|Li et al. - 2025 - Gumiho A Hybrid Architecture to Prioritize Early Tokens in Speculative Decoding]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
related_papers:
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e1c9b8005c"
consolidation_target: "methods/speculative-decoding"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Li et al. - 2025 - Gumiho A Hybrid Architecture to Prioritize Early Tokens in Speculative Decoding

- Source paper: [[papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding|Li et al. - 2025 - Gumiho A Hybrid Architecture to Prioritize Early Tokens in Speculative Decoding]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: draft model proposals, target model verification logits, acceptance or tree budget
- Outputs: verified accepted tokens, inference speedup without target-distribution change
- Assumptions: target-model verification preserves the original decoding distribution
- Provenance: p. 5; p. 2; p. 6
