---
type: "method"
title: "low-rank compensation"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
source_papers:
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
related_papers:
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
related_methods:
related_topics:
  - "low-bit quantization"
  - "MoE quantization"
  - "expert routing"
  - "calibration data selection"
  - "hardware-aware quantization"
  - "benchmark evaluation"
  - "low-rank adaptation"
  - "sparse mixture-of-experts"
  - "calibration representativeness"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-dc1b94b147"
---
# low-rank compensation

## What It Is

This is a compiled method-family page for `low-rank compensation`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: ### Mixture of Low-Rank Compensators - Purpose: Adds a small mixture of low-rank residual compensators around quantized MoE weights, so the quantized model can recover expert-specific error without restoring full-precision weights. - Operat...

## Used By Papers

- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators]]

## Implementation Hooks

- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: - Mixture of Low-Rank Compensators: Ablate quantized weights alone, one shared low-rank adapter, and mixture-of-compensator variants. - Mixture of Low-Rank Compensators: Log per-expert reconstruction error and runtime/me...

## Failure Modes

- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: - Low-rank compensation is only useful if residual error is structured enough; compare against the same memory budget and expert-routing behavior. - MoE aggregate metrics can hide per-expert failures, so inspect expert-l...

## Evidence

- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: Evidence takeaways: - MiLo evidence should separate MoE quantization quality from compensator overhead; per-expert error and memory budget matter as much as aggregate scores. Claim candidates: - `claim-001`: For Mixtral-...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[concepts/Calibration-representativeness|Calibration representativeness]]
