---
type: "concept"
title: "Per-channel scaling"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "channel-wise scaling"
  - "per channel scale"
  - "scaling granularity"
sources:
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
source_papers:
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
related_methods:
  - "post-training quantization"
  - "weight-activation quantization"
  - "activation smoothing"
related_topics:
  - "quantization"
related_claims:
related_evidence:
prerequisite_for:
  - "post-training quantization"
  - "weight-activation quantization"
  - "activation smoothing"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-7d36a84c15"
---
# Per-channel scaling

## What It Is

`Per-channel scaling` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Scale granularity controls which variation is preserved by a low-bit representation and determines the tradeoff between accuracy, metadata cost, and kernel simplicity.

## Where It Appears

- [[papers/2511-10645v1]]
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference]]
- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]]

## Used By Methods

- [[methods/post-training-quantization|post-training quantization]]
- [[methods/weight-activation-quantization|weight-activation quantization]]
- [[methods/activation-smoothing|activation smoothing]]

## Implementation Implications

- Treat scale granularity as part of the kernel/data-layout contract, not just a math detail.
- Check whether scale tensors broadcast over the intended axis.

## Common Failure Modes

- A tensor axis mismatch silently applies the wrong scale.
- Fine-grained scales recover accuracy but erase the intended memory or speed benefit.

## Minimal Checks / Probes

- Assert scale shapes against weight/activation tensor shapes.
- Run per-tensor vs per-channel vs group-wise ablations with identical calibration data.

## Evidence / Provenance

- [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey synthesis post training quantization outlie...
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference|Liang et al. - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference]]: liang et al 2025 paroquant pairwise rotation quantization for efficient reasoning llm inference paroquant liang et al 2025 paroquant pairwise rotation quantization for efficient reasoning llm inference post training quantization low bit quantization quantizati...
- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: wang lsvd loss aware low rank approximation for efficient low precision vision language models lsvd loss aware low rank low precision smoothquant activation to weight smoothing post training quantization low bit quantization activation outliers equivalent tran...

## Related Concepts

- [[concepts/Activation-outliers|Activation outliers]]
- [[concepts/Quantization-error-propagation|Quantization error propagation]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for quantizer implementation, axis bugs, and scale-granularity ablations.
