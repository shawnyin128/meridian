---
type: "method"
title: "feature-level drafting"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
source_papers:
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
related_papers:
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
related_methods:
related_topics:
  - "calibration data selection"
  - "speculative decoding"
  - "feature uncertainty"
  - "verification overhead"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-7b09574809"
---
# feature-level drafting

## What It Is

This is a compiled method-family page for `feature-level drafting`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty|Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty]]: ### Feature-level speculative draft model - Purpose: Drafts future tokens from feature-level uncertainty rather than only token logits, then verifies with the target model to preserve speculative sampling correctness. - Operates on: target-...

## Used By Papers

- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty]]

## Implementation Hooks

- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty|Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty]]: - Feature-level speculative draft model: Log feature uncertainty, acceptance rate, and rejection reasons per decoding step. - Feature-level speculative draft model: Compare token-level and feature-level draft strategies...

## Failure Modes

- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty|Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty]]: - Feature-level speculative sampling speedups depend on acceptance rates and verifier overhead; correctness still depends on target verification. Open questions: - Do key figures, tables, or equations change the interpre...

## Evidence

- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty|Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty]]: Evidence takeaways: - EAGLE evidence should separate draft feature uncertainty, acceptance rate, verifier correctness, and latency speedup. Claim candidates: - `claim-001`: Compared to recently introduced speculative sam...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
