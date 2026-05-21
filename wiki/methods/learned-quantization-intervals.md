---
type: "method"
title: "learned quantization intervals"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/1808-05779v3.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
source_papers:
  - "papers/1808-05779v3.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
related_papers:
  - "papers/1808-05779v3.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
related_methods:
related_topics:
  - "low-bit quantization"
  - "quantization error"
  - "learned quantization intervals"
  - "transformer architecture"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-0e053af4b7"
---
# learned quantization intervals

## What It Is

This is a compiled method-family page for `learned quantization intervals`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/1808-05779v3|1808.05779v3]]: ### Quantization Interval Learning - Purpose: Learns quantization interval parameters jointly with task loss so clipping/pruning and bit assignment are optimized for network accuracy instead of fixed min-max ranges. - Operates on: full-prec...
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss|Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss]]: ### Quantization Interval Learning - Purpose: Learns quantization interval parameters jointly with task loss so clipping/pruning and bit assignment are optimized for network accuracy instead of fixed min-max ranges. - Operates on: full-prec...

## Used By Papers

- [[papers/1808-05779v3]]
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss]]

## Implementation Hooks

- [[papers/1808-05779v3|1808.05779v3]]: - Quantization Interval Learning: Implement interval parameters as trainable quantizer state and verify gradients flow through the quantizer surrogate. - Quantization Interval Learning: Ablate learned intervals, fixed in...
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss|Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss]]: - Quantization Interval Learning: Implement interval parameters as trainable quantizer state and verify gradients flow through the quantizer surrogate. - Quantization Interval Learning: Ablate learned intervals, fixed in...

## Failure Modes

- [[papers/1808-05779v3|1808.05779v3]]: - Learned quantization intervals require task-loss finetuning; do not compare them as calibration-only PTQ. - Very low-bit gains depend on progressive finetuning and architecture/dataset choice. Open questions: - Do key...
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss|Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss]]: - Learned quantization intervals require task-loss finetuning; do not compare them as calibration-only PTQ. - Very low-bit gains depend on progressive finetuning and architecture/dataset choice. Open questions: - Do key...

## Evidence

- [[papers/1808-05779v3|1808.05779v3]]: Evidence takeaways: - QIL evidence should separate learned interval quality, progressive finetuning effects, and bit-width-specific ImageNet accuracy. Claim candidates: - `claim-001`: Bit-width (A/W) Method Accuracy (%)...
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss|Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss]]: Evidence takeaways: - QIL evidence should separate learned interval quality, progressive finetuning effects, and bit-width-specific ImageNet accuracy. Claim candidates: - `claim-001`: Bit-width (A/W) Method Accuracy (%)...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Lookup-table-inference|Lookup-table inference]]
