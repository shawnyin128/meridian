---
type: "method"
title: "13979_STAR_Speculative_Decodin"
status: "draft"
sources:
  - "[[papers/13979-STAR-Speculative-Decodin|13979_STAR_Speculative_Decodin]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/13979-STAR-Speculative-Decodin.md"
related_papers:
  - "papers/13979-STAR-Speculative-Decodin.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-ceb0ad8620"
---
# 13979_STAR_Speculative_Decodin

- Source paper: [[papers/13979-STAR-Speculative-Decodin|13979_STAR_Speculative_Decodin]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: draft model proposals, target model verification logits, acceptance or tree budget
- Outputs: verified accepted tokens, inference speedup without target-distribution change
- Assumptions: target-model verification preserves the original decoding distribution
- Provenance: p. 1; p. 2; p. 3
