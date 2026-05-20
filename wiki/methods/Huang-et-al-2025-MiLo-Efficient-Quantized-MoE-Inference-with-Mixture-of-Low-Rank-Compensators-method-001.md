---
type: "method"
title: "Mixture of Low-Rank Compensators"
status: "draft"
sources:
  - "[[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
related_papers:
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-6d415e17c8"
---
# Mixture of Low-Rank Compensators

- Source paper: [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]
- Summary: Adds a small mixture of low-rank residual compensators around quantized MoE weights, so the quantized model can recover expert-specific error without restoring full-precision weights.
- Inputs: quantized MoE weights, expert activations or calibration samples, low-rank compensator rank/budget
- Outputs: quantized MoE model plus low-rank compensators, expert-specific error compensation
- Assumptions: quantization residuals have enough low-rank structure to compensate cheaply, compensator routing or placement preserves MoE expert behavior
- Provenance: p. 1; p. 2; p. 3; p. 4
