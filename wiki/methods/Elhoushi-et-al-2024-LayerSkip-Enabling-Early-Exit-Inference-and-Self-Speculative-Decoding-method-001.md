---
type: "method"
title: "Elhoushi et al. - 2024 - LayerSkip Enabling Early Exit Inference and Self-Speculative Decoding"
status: "draft"
sources:
  - "[[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding|Elhoushi et al. - 2024 - LayerSkip Enabling Early Exit Inference and Self-Speculative Decoding]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
related_papers:
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-71eb1c0fc4"
consolidation_target: "methods/speculative-decoding"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Elhoushi et al. - 2024 - LayerSkip Enabling Early Exit Inference and Self-Speculative Decoding

- Source paper: [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding|Elhoushi et al. - 2024 - LayerSkip Enabling Early Exit Inference and Self-Speculative Decoding]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: draft model proposals, target model verification logits, acceptance or tree budget
- Outputs: verified accepted tokens, inference speedup without target-distribution change
- Assumptions: target-model verification preserves the original decoding distribution
- Provenance: p. 7; p. 5; p. 8
