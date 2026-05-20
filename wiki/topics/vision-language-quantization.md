---
type: "topic"
title: "vision-language quantization"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/ERNIE-Technical-Report.md"
source_papers:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/ERNIE-Technical-Report.md"
related_papers:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/ERNIE-Technical-Report.md"
related_methods:
  - "post-training quantization"
  - "outlier-aware quantization"
  - "calibration-aware PTQ"
  - "equivalent-transform PTQ"
  - "vision-language model quantization"
  - "long-context inference"
  - "KV-cache compression"
  - "transformer architecture"
  - "hardware-aware quantization"
  - "speculative decoding"
  - "survey synthesis"
  - "MoE quantization"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-ee5f3252fb"
---
# vision-language quantization

## Scope

This topic page compiles canonical paper pages around `vision-language quantization`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]]
- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models]]
- [[papers/ERNIE-Technical-Report]]

## Method Families

- [[methods/post-training-quantization|post-training quantization]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/equivalent-transform-PTQ|equivalent-transform PTQ]]
- [[methods/vision-language-model-quantization|vision-language model quantization]]
- [[methods/long-context-inference|long-context inference]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/speculative-decoding|speculative decoding]]
- [[methods/survey-synthesis|survey synthesis]]
- [[methods/MoE-quantization|MoE quantization]]

## Claims

- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equival...
- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models]]: Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models: Searches quantized rounding functions block by block for large vision-language models, using output quantization error to keep multi...
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models|Li et al. - 2025 - MBQ Modality-Balanced Quantization for Large Vision-Language Models]]: Li et al. - 2025 - MBQ Modality-Balanced Quantization for Large Vision-Language Models is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then...
- [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]: ERNIE_Technical_Report: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths....

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `vision-language quantization`.
