---
type: "method"
title: "learned step-size quantization"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
source_papers:
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
related_papers:
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
related_methods:
related_topics:
  - "low-bit quantization"
  - "learned quantizer scale"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-9aa1a05441"
---
# learned step-size quantization

## What It Is

This is a compiled method-family page for `learned step-size quantization`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]: ### Learned step size with offset quantization - Purpose: Extends learned step-size quantization by learning offsets and improving initialization, so low-bit activation/weight quantizers fit asymmetric tensor distributions better. - Operate...

## Used By Papers

- [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization]]

## Implementation Hooks

- [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]: - Learned step size with offset quantization: Unit test scale and offset gradients separately from the straight-through estimator. - Learned step size with offset quantization: Compare symmetric LSQ, LSQ+ offset, and ini...

## Failure Modes

- [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]: - Scale/offset learning can be sensitive to initialization and optimizer settings, so report quantizer state and bit width together. Open questions: - Do key figures, tables, or equations change the interpretation of the...

## Evidence

- [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]: Evidence takeaways: - LSQ+ evidence should isolate offset learning and initialization effects from the base learned step-size quantizer. Claim candidates: - `claim-001`: To solve this problem, we propose LSQ+, a natural...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
