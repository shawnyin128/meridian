---
type: "topic"
title: "expert routing"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
source_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
related_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
related_methods:
  - "transformer architecture"
  - "post-training quantization"
  - "MoE quantization"
  - "calibration-aware PTQ"
  - "rotation-based quantization"
  - "non-uniform weight quantization"
  - "expert-aware quantization"
  - "hardware-aware quantization"
  - "long-context inference"
  - "low-rank compensation"
  - "speculative decoding"
  - "agent workflow modeling"
  - "sparse mixture-of-experts"
  - "expert routing"
  - "KV-cache compression"
  - "survey synthesis"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-88bb595f60"
---
# expert routing

## Scope

This topic page compiles canonical paper pages around `expert routing`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]]
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free]]
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators]]
- [[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning]]
- [[papers/Jiang-et-al-2024-Mixtral-of-Experts]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa]]

## Method Families

- [[methods/transformer-architecture|transformer architecture]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/MoE-quantization|MoE quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[methods/expert-aware-quantization|expert-aware quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/long-context-inference|long-context inference]]
- [[methods/low-rank-compensation|low-rank compensation]]
- [[methods/speculative-decoding|speculative decoding]]
- [[methods/agent-workflow-modeling|agent workflow modeling]]
- [[methods/sparse-mixture-of-experts|sparse mixture-of-experts]]
- [[methods/expert-routing|expert routing]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/survey-synthesis|survey synthesis]]

## Claims

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression is a clustering method/theory paper: it studies how data vectors are assigned to centroids and which objective or initialization as...
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free|Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free]]: Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free: The output is a weighted sum of the values: Attention(Q, K, V ) = softmax QKT √dk  V , (2) where QKT √ dk...
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators: Adds a small mixture of low-rank residual compensators around quantized MoE weights, so the quantized model can recover...
- [[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning|Guan et al. - 2025 - Dynamic Speculative Agent Planning]]: Guan et al. - 2025 - Dynamic Speculative Agent Planning: In this paper, we propose Dynamic Speculative Planning (DSP), a lossless, user-controllable agent planning acceleration framework that requires no pre-deployment p...
- [[papers/Jiang-et-al-2024-Mixtral-of-Experts|Jiang et al. - 2024 - Mixtral of Experts]]: Jiang et al. - 2024 - Mixtral of Experts: Uses sparse top-k expert routing in each feed-forward block so inference activates only a subset of experts per token while keeping a larger total parameter budget. It operates o...
- [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]: ERNIE_Technical_Report: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths....
- [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa|Hu et al. - 2025 - MoEQuant Enhancing Quantization for Mixture-of-Experts Large Language Models via Expert-Balanced Sa]]: Hu et al. - 2025 - MoEQuant Enhancing Quantization for Mixture-of-Experts Large Language Models via Expert-Balanced Sa is a pipeline: Expert-Balanced Self-Sampling: Builds calibration data from the model itself while bal...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `expert routing`.
