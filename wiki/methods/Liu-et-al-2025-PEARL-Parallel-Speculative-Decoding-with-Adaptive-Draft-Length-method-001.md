---
type: "method"
title: "Liu et al. - 2025 - PEARL Parallel Speculative Decoding with Adaptive Draft Length"
status: "draft"
sources:
  - "[[papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length|Liu et al. - 2025 - PEARL Parallel Speculative Decoding with Adaptive Draft Length]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length.md"
related_papers:
  - "papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-930a2f6c11"
consolidation_target: "methods/speculative-decoding"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Liu et al. - 2025 - PEARL Parallel Speculative Decoding with Adaptive Draft Length

- Source paper: [[papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length|Liu et al. - 2025 - PEARL Parallel Speculative Decoding with Adaptive Draft Length]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: draft model proposals, target model verification logits, acceptance or tree budget
- Outputs: verified accepted tokens, inference speedup without target-distribution change
- Assumptions: target-model verification preserves the original decoding distribution
- Provenance: p. 1; p. 2; p. 10
