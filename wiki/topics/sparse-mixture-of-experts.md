---
type: "topic"
title: "sparse mixture-of-experts"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models.md"
source_papers:
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models.md"
related_papers:
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models.md"
related_methods:
  - "long-context inference"
  - "transformer architecture"
  - "MoE quantization"
  - "low-rank compensation"
  - "post-training quantization"
  - "audio-language modeling"
  - "multimodal instruction tuning"
  - "KV-cache compression"
  - "outlier-aware quantization"
  - "calibration-aware PTQ"
  - "expert-aware quantization"
  - "preference-based reinforcement learning"
  - "reward modeling"
  - "sparse mixture-of-experts"
  - "expert routing"
  - "equivalent-transform PTQ"
  - "mechanistic activation analysis"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-fac6236ad4"
---
# sparse mixture-of-experts

## Scope

This topic page compiles canonical paper pages around `sparse mixture-of-experts`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free]]
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators]]
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition]]
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model]]
- [[papers/Jiang-et-al-2024-Mixtral-of-Experts]]
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models]]
- [[papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models]]

## Method Families

- [[methods/long-context-inference|long-context inference]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/MoE-quantization|MoE quantization]]
- [[methods/low-rank-compensation|low-rank compensation]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/audio-language-modeling|audio-language modeling]]
- [[methods/multimodal-instruction-tuning|multimodal instruction tuning]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/expert-aware-quantization|expert-aware quantization]]
- [[methods/preference-based-reinforcement-learning|preference-based reinforcement learning]]
- [[methods/reward-modeling|reward modeling]]
- [[methods/sparse-mixture-of-experts|sparse mixture-of-experts]]
- [[methods/expert-routing|expert routing]]
- [[methods/equivalent-transform-PTQ|equivalent-transform PTQ]]
- [[methods/mechanistic-activation-analysis|mechanistic activation analysis]]

## Claims

- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free|Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free]]: Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free: The output is a weighted sum of the values: Attention(Q, K, V ) = softmax QKT √dk  V , (2) where QKT √ dk...
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators: Adds a small mixture of low-rank residual compensators around quantized MoE weights, so the quantized model can recover...
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]: Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget con...
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model|DeepSeek-AI 等 - 2024 - DeepSeek-V2 A Strong, Economical, and Efficient Mixture-of-Experts Language Model]]: DeepSeek-AI 等 - 2024 - DeepSeek-V2 A Strong, Economical, and Efficient Mixture-of-Experts Language Model turns preference data into a policy-optimization objective. The reusable contract is preference pairs and a referen...
- [[papers/Jiang-et-al-2024-Mixtral-of-Experts|Jiang et al. - 2024 - Mixtral of Experts]]: Jiang et al. - 2024 - Mixtral of Experts: Uses sparse top-k expert routing in each feed-forward block so inference activates only a subset of experts per token while keeping a larger total parameter budget. It operates o...
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models]]: Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematical...
- [[papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models|Sun et al. - 2024 - Massive Activations in Large Language Models]]: Sun et al. - 2024 - Massive Activations in Large Language Models: Identifies rare but extremely large activation dimensions/tokens across LLMs and studies their role in attention, bias-like behavior, and downstream model...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `sparse mixture-of-experts`.
