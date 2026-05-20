---
type: "method"
title: "dynamic draft tree"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
source_papers:
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
related_papers:
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
related_methods:
related_topics:
  - "calibration data selection"
  - "benchmark evaluation"
  - "speculative decoding"
  - "dynamic draft tree"
  - "feature uncertainty"
  - "draft acceptance"
  - "verification overhead"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-37e6951931"
---
# dynamic draft tree

## What It Is

This is a compiled method-family page for `dynamic draft tree`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]: ### Context-aware dynamic draft tree - Purpose: Builds the speculative-decoding draft tree dynamically from draft-model confidence, so verification compute is spent on branches likely to be accepted by the target model. - Operates on: draft...

## Used By Papers

- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees]]

## Implementation Hooks

- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]: - Context-aware dynamic draft tree: Log draft confidence, accepted length, rejected branches, and target verification cost per example. - Context-aware dynamic draft tree: Ablate static tree, dynamic tree without confide...

## Failure Modes

- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]: - Speculative decoding speedups depend on draft-target alignment, acceptance rate, decoding settings, and verifier overhead. - Lossless speedup claims require target-model verification; any implementation shortcut should...

## Evidence

- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]: Evidence takeaways: - EAGLE-2 evidence should separate lossless decoding correctness, acceptance-rate behavior, and wall-clock speedup under the same target/draft model pair. Claim candidates: - `claim-001`: In all our e...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
