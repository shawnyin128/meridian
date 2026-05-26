---
type: "method"
title: "vision-language model quantization"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
source_papers:
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
related_papers:
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
related_methods:
related_topics:
  - "post-training quantization"
  - "low-bit quantization"
  - "calibration data selection"
  - "quantization error"
  - "vision-language quantization"
  - "calibration representativeness"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-dac5a4d6a7"
---
# vision-language model quantization

## What It Is

This is a compiled method-family page for `vision-language model quantization`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models]]: ### Block-wise rounding search for LVLM PTQ - Purpose: Searches quantized rounding functions block by block for large vision-language models, using output quantization error to keep multimodal reasoning accurate under low-bit weights/activa...

## Used By Papers

- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models]]

## Implementation Hooks

- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models]]: - Block-wise rounding search for LVLM PTQ: Keep text tower, vision tower, and projector quantization errors separately inspectable. - Block-wise rounding search for LVLM PTQ: Ablate candidate rounding-function search dep...

## Failure Modes

- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models]]: - LVLM PTQ depends on multimodal calibration coverage; transfer text-only calibration conclusions only after multimodal checks. - Memory and speed claims should be separated from VQA/reasoning accuracy because they stres...

## Evidence

- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models]]: Evidence takeaways: - Q-VLM evidence should connect block rounding-search objectives to multimodal VQA accuracy, memory compression, and generation speed separately. Claim candidates: - `claim-001`: Our Q-VLM can still g...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Calibration-representativeness|Calibration representativeness]]
- [[concepts/Activation-outliers|Activation outliers]]
- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[concepts/Per-channel-scaling|Per-channel scaling]]
