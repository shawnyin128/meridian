---
type: "method"
title: "Feature-level speculative draft model"
status: "draft"
sources:
  - "[[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty|Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
related_papers:
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-1206a83ab2"
consolidation_target: "methods/feature-level-drafting"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Feature-level speculative draft model

- Source paper: [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty|Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty]]
- Summary: Drafts future tokens from feature-level uncertainty rather than only token logits, then verifies with the target model to preserve speculative sampling correctness.
- Inputs: target-model hidden features, draft head/model, verification step
- Outputs: draft tokens, accepted verified tokens, speculative speedup
- Assumptions: feature uncertainty predicts useful draft candidates, target verification preserves the original sampling distribution
- Provenance: p. 1; p. 2; p. 3; p. 4
