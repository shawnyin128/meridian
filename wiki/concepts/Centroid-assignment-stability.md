---
type: "concept"
title: "Centroid assignment stability"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "centroid assignment"
  - "assignment stability"
  - "empty cluster"
  - "cluster utilization"
sources:
  - "papers/DeepSeek-AI-2025-DeepSeek-R1-Incentivizing-Reasoning-Capability-in-LLMs-via-Reinforcement-Learning.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling.md"
  - "papers/Yang-et-al-2025-Qwen3-Technical-Report.md"
source_papers:
  - "papers/DeepSeek-AI-2025-DeepSeek-R1-Incentivizing-Reasoning-Capability-in-LLMs-via-Reinforcement-Learning.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling.md"
  - "papers/Yang-et-al-2025-Qwen3-Technical-Report.md"
related_methods:
  - "k-means"
  - "deep clustering"
  - "clustering algorithm"
related_topics:
  - "clustering theory"
  - "classical ML theory"
related_claims:
related_evidence:
prerequisite_for:
  - "k-means"
  - "deep clustering"
  - "clustering algorithm"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-c8a1a937ee"
---
# Centroid assignment stability

## What It Is

`Centroid assignment stability` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Many clustering conclusions depend on assignment stability and cluster utilization, not only the final objective or downstream label accuracy.

## Where It Appears

- [[papers/DeepSeek-AI-2025-DeepSeek-R1-Incentivizing-Reasoning-Capability-in-LLMs-via-Reinforcement-Learning]]
- [[papers/DeepSeek-V4]]
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering]]
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for]]
- [[papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models]]
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac]]
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models]]
- [[papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling]]
- [[papers/Yang-et-al-2025-Qwen3-Technical-Report]]

## Used By Methods

- [[methods/k-means|k-means]]
- [[methods/deep-clustering|deep clustering]]
- [[methods/clustering-algorithm|clustering algorithm]]

## Implementation Implications

- Log assignment changes, empty clusters, and utilization across iterations and seeds.
- Separate representation updates from assignment-rule changes.

## Common Failure Modes

- A better downstream metric hides unstable or collapsed clusters.
- Different empty-cluster handling changes results more than the proposed objective.

## Minimal Checks / Probes

- Report assignment stability across seeds.
- Compare cluster utilization and objective value under fixed initialization.

## Evidence / Provenance

- [[papers/DeepSeek-AI-2025-DeepSeek-R1-Incentivizing-Reasoning-Capability-in-LLMs-via-Reinforcement-Learning|DeepSeek-AI 等 - 2025 - DeepSeek-R1 Incentivizing Reasoning Capability in LLMs via Reinforcement Learning]]: deepseek ai 2025 deepseek r1 incentivizing reasoning capability in llms via reinforcement learning deepseek ai deepseek r1 deepseek ai 2025 deepseek r1 incentivizing reasoning capability in llms via reinforcement learning calibration data selection human prefe...
- [[papers/DeepSeek-V4|DeepSeek_V4]]: deepseek v4 deepseek v4 moe quantization hardware aware quantization lookup table inference long context inference sparse attention kv cache compression human preference feedback reward modeling policy optimization context extrapolation long context inference...
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering|GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering]]: glm 5 team 2026 glm 5 from vibe coding to agentic engineering glm 5 glm 5 team 2026 glm 5 from vibe coding to agentic engineering speculative decoding long context inference kv cache compression context extrapolation speculative decoding long context inference...
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]: hu et al 2025 ostquant refining large language model quantization with orthogonal and scaling transformations for ostquant ostquant qsur guided orthogonal and scaling transformations qsur quantization space utilization rate post training quantization calibrati...
- [[papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models|Rahmati et al. - 2025 - C-LoRA Contextual Low-Rank Adaptation for Uncertainty Estimation in Large Language Models]]: rahmati et al 2025 c lora contextual low rank adaptation for uncertainty estimation in large language models c lora low rank rahmati et al 2025 c lora contextual low rank adaptation for uncertainty estimation in large language models low bit quantization calib...
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac|Son et al. - 2025 - NSNQuant A Double Normalization Approach for Calibration-Free Low-Bit Vector Quantization of KV Cac]]: son et al 2025 nsnquant a double normalization approach for calibration free low bit vector quantization of kv cac nsnquant calibration free son et al 2025 nsnquant a double normalization approach for calibration free low bit vector quantization of kv cac low...
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]: xu et al 2025 rsavq riemannian sensitivity aware vector quantization for large language models rsavq sensitivity aware xu et al 2025 rsavq riemannian sensitivity aware vector quantization for large language models low bit quantization quantization error rotati...
- [[papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling|Xu et al. - 2025 - Speculative Knowledge Distillation Bridging the Teacher-Student Gap Through Interleaved Sampling]]: xu et al 2025 speculative knowledge distillation bridging the teacher student gap through interleaved sampling teacher student xu et al 2025 speculative knowledge distillation bridging the teacher student gap through interleaved sampling calibration data selec...

## Related Concepts

- [[concepts/K-means-objective-landscape|K-means objective landscape]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for clustering objectives, representation-learning probes, and centroid-update implementation checks.
