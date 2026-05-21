---
type: "method"
title: "Context-aware dynamic draft tree"
status: "draft"
sources:
  - "[[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
related_papers:
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e56b294f62"
consolidation_target: "methods/dynamic-draft-tree"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Context-aware dynamic draft tree

- Source paper: [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]
- Summary: Builds the speculative-decoding draft tree dynamically from draft-model confidence, so verification compute is spent on branches likely to be accepted by the target model.
- Inputs: draft model hidden features or token probabilities, target model verifier, tree size/depth budget
- Outputs: context-specific draft tree, accepted target-model tokens, lossless inference speedup
- Assumptions: draft confidence is a useful proxy for target-model acceptance probability, target verification preserves the same output distribution as standard autoregressive decoding
- Provenance: p. 1; p. 2; p. 3; p. 4
