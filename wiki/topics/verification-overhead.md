---
type: "topic"
title: "verification overhead"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
source_papers:
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
related_papers:
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
related_methods:
  - "speculative decoding"
  - "dynamic draft tree"
  - "feature-level drafting"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-31c346fc0b"
---
# verification overhead

## Scope

This topic page compiles canonical paper pages around `verification overhead`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees]]
- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty]]

## Method Families

- [[methods/speculative-decoding|speculative decoding]]
- [[methods/dynamic-draft-tree|dynamic draft tree]]
- [[methods/feature-level-drafting|feature-level drafting]]

## Claims

- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]: Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees: Builds the speculative-decoding draft tree dynamically from draft-model confidence, so verification compute is spent on branches li...
- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty|Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty]]: Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty: Drafts future tokens from feature-level uncertainty rather than only token logits, then verifies with the target model to preserve sp...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `verification overhead`.
