---
type: "concept"
title: "Token-expert routing"
status: "active"
created: "2026-05-26"
updated: "2026-05-26"
aliases:
  - "expert routing"
  - "MoE routing"
  - "token expert assignment"
sources:
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
source_papers:
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
related_methods:
  - "expert routing"
  - "sparse mixture-of-experts"
  - "MoE quantization"
related_topics:
  - "expert routing"
  - "sparse mixture-of-experts"
related_claims:
related_evidence:
prerequisite_for:
  - "expert routing"
  - "sparse mixture-of-experts"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-20260526-token-expert-routing"
---
# Token-expert routing

## What It Is

`Token-expert routing` is the mechanism that assigns each token or hidden state to a subset of experts in a sparse mixture-of-experts model.

## Why It Matters

- MoE quality, compression, calibration, and serving cost depend on which experts are activated and whether routing stays balanced across data regimes.

## Where It Appears

- [[papers/Jiang-et-al-2024-Mixtral-of-Experts]]
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models]]
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model]]

## Used By Methods

- [[methods/expert-routing|expert routing]]
- [[methods/sparse-mixture-of-experts|sparse mixture-of-experts]]
- [[methods/MoE-quantization|MoE quantization]]

## Implementation Implications

- Log token-to-expert assignments, routing entropy, load balance, and per-expert utilization alongside aggregate task quality.
- For quantization or pruning, keep calibration data representative of the expert-routing distribution.

## Common Failure Modes

- Aggregate accuracy hides a small group of overloaded or under-calibrated experts.
- Calibration data covers common tokens but misses rare routing paths that dominate downstream failures.

## Minimal Checks / Probes

- Plot per-expert token counts and expert-specific reconstruction or pruning error.
- Compare routing statistics before and after quantization, pruning, or finetuning.

## Evidence / Provenance

- [[papers/Jiang-et-al-2024-Mixtral-of-Experts|Mixtral]] gives a sparse MoE setting where active experts and serving cost must be separated from total parameters.
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models|DeepSeekMoE]] and [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model|DeepSeek-V2]] provide expert-specialization and routing-system context.

## Related Concepts

- [[concepts/Calibration-representativeness|Calibration representativeness]]
- [[concepts/Activation-outliers|Activation outliers]]

## Open Questions

- Which routing statistics best predict downstream compression or quantization failures?
- When is expert imbalance a model-quality problem versus a serving-system problem?

## Retrieval Hooks

- Use for MoE routing, expert-balanced calibration, expert pruning, MoE quantization, and per-expert diagnostics.
