---
type: "method"
title: "layer-wise PTQ"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
source_papers:
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
related_papers:
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
related_methods:
related_topics:
  - "post-training quantization"
  - "layer-wise PTQ"
  - "low-bit quantization"
  - "quantization error"
  - "error propagation"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-2b51d23c1d"
---
# layer-wise PTQ

## What It Is

This is a compiled method-family page for `layer-wise PTQ`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: ### Quantization Error Propagation - Purpose: Revisits layer-wise PTQ by explicitly propagating previous-layer quantization error into the next layer's optimization target, reducing accumulated error across the network. - Operates on: layer...

## Used By Papers

- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]]

## Implementation Hooks

- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: - Quantization Error Propagation: Test QEP as a wrapper around RTN/GPTQ/AWQ-style layer-wise quantizers. - Quantization Error Propagation: Ablate propagation strength and measure both layer reconstruction error and end-t...

## Failure Modes

- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...

## Evidence

- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: Evidence takeaways: - QEP evidence should compare layer-wise reconstruction with and without propagated previous-layer error, then check whether that reduces end-task degradation. Claim candidates: - `claim-001`: Notably...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
