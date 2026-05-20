---
type: "topic"
title: "feature uncertainty"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
source_papers:
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
related_papers:
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
related_methods:
  - "speculative decoding"
  - "KV-cache compression"
  - "transformer architecture"
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
revision_id: "knowledge-2661ab1b0b"
---
# feature uncertainty

## Scope

This topic page compiles canonical paper pages around `feature uncertainty`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test]]
- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees]]
- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty]]

## Method Families

- [[methods/speculative-decoding|speculative decoding]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/dynamic-draft-tree|dynamic draft tree]]
- [[methods/feature-level-drafting|feature-level drafting]]

## Claims

- [[papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test|Li et al. - 2025 - EAGLE-3 Scaling up Inference Acceleration of Large Language Models via Training-Time Test]]: Li et al. - 2025 - EAGLE-3 Scaling up Inference Acceleration of Large Language Models via Training-Time Test: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget...
- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]: Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees: Builds the speculative-decoding draft tree dynamically from draft-model confidence, so verification compute is spent on branches li...
- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty|Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty]]: Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty: Drafts future tokens from feature-level uncertainty rather than only token logits, then verifies with the target model to preserve sp...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `feature uncertainty`.
