---
type: "method"
title: "self-speculative decoding"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
source_papers:
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
related_papers:
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
related_methods:
related_topics:
  - "calibration data selection"
  - "speculative decoding"
  - "dynamic draft tree"
  - "self-speculative decoding"
  - "transformer architecture"
  - "draft acceptance"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-2dba1ab920"
---
# self-speculative decoding

## What It Is

This is a compiled method-family page for `self-speculative decoding`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting|Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting]]: ### Double early-exit self-speculative decoding - Purpose: Uses early-exit branches inside the same model to draft tokens, then verifies them with deeper layers, reducing latency without requiring a separate draft model. - Operates on: inte...

## Used By Papers

- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting]]

## Implementation Hooks

- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting|Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting]]: - Double early-exit self-speculative decoding: Log acceptance rate by exit depth and prompt type. - Double early-exit self-speculative decoding: Compare single early exit, double early exit, and full decoding under ident...

## Failure Modes

- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting|Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting]]: - Self-speculative speedups depend on early-exit acceptance rates and verifier overhead. - Lossless claims require final-layer verification under the same decoding settings. Open questions: - Do key figures, tables, or e...

## Evidence

- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting|Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting]]: Evidence takeaways: - Kangaroo evidence should report acceptance rate, verified output equivalence, and latency by early-exit setting. Claim candidates: - `claim-001`: Under single-sequence verification, Kangaroo achieve...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Verification-cost-model|Verification cost model]]
- [[concepts/Dynamic-draft-tree|Dynamic draft tree]]
