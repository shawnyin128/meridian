---
type: "method"
title: "Double early-exit self-speculative decoding"
status: "draft"
sources:
  - "[[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting|Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
related_papers:
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-d441fb47ad"
consolidation_target: "methods/self-speculative-decoding"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Double early-exit self-speculative decoding

- Source paper: [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting|Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting]]
- Summary: Uses early-exit branches inside the same model to draft tokens, then verifies them with deeper layers, reducing latency without requiring a separate draft model.
- Inputs: intermediate hidden states, early-exit draft heads, final-layer verifier
- Outputs: draft tokens, verified accepted tokens, lossless self-speculative speedup
- Assumptions: early exits are aligned enough with the final model to achieve useful acceptance rates, verification preserves the final model distribution
- Provenance: p. 1; p. 2; p. 3; p. 4
