---
type: "topic"
title: "MoE quantization"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
source_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
related_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
related_methods:
  - "transformer architecture"
  - "post-training quantization"
  - "MoE quantization"
  - "calibration-aware PTQ"
  - "rotation-based quantization"
  - "non-uniform weight quantization"
  - "expert-aware quantization"
  - "hardware-aware quantization"
  - "audio-language modeling"
  - "multimodal instruction tuning"
  - "relative position encoding"
  - "survey synthesis"
  - "low-rank compensation"
  - "KV-cache compression"
  - "outlier-aware quantization"
  - "long-context inference"
  - "preference-based reinforcement learning"
  - "reward modeling"
  - "speculative decoding"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-877248da94"
---
# MoE quantization

## Scope

This topic page compiles canonical paper pages around `MoE quantization`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]]
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models]]
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators]]
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition]]
- [[papers/DeepSeek-V4]]
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models]]
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa]]
- [[papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits]]

## Method Families

- [[methods/transformer-architecture|transformer architecture]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/MoE-quantization|MoE quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[methods/expert-aware-quantization|expert-aware quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/audio-language-modeling|audio-language modeling]]
- [[methods/multimodal-instruction-tuning|multimodal instruction tuning]]
- [[methods/relative-position-encoding|relative position encoding]]
- [[methods/survey-synthesis|survey synthesis]]
- [[methods/low-rank-compensation|low-rank compensation]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/long-context-inference|long-context inference]]
- [[methods/preference-based-reinforcement-learning|preference-based reinforcement learning]]
- [[methods/reward-modeling|reward modeling]]
- [[methods/speculative-decoding|speculative decoding]]

## Claims

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression is a clustering method/theory paper: it studies how data vectors are assigned to centroids and which objective or initialization as...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: Yin et al. - 2024 - A Survey on Multimodal Large Language Models connects audio representations to language-model behavior. Read it as an audio encoder/alignment/decoder contract, where task tags and audio preprocessing...
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators: Adds a small mixture of low-rank residual compensators around quantized MoE weights, so the quantized model can recover...
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]: Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget con...
- [[papers/DeepSeek-V4|DeepSeek_V4]]: DeepSeek_V4 turns preference data into a policy-optimization objective. The reusable contract is preference pairs and a reference policy -> loss/reward signal -> aligned policy behavior, with KL/reference-model assumptio...
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models|Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models]]: Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget...
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]: Xi et al. - 2023 - Training Transformers with 4-bit Integers: To suppress outliers, we propose a Hadamard quantizer, which quantizes a transformed version of the activation matrix. SmoothQuant [57] migrates the quantizat...
- [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]: ERNIE_Technical_Report: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths....

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `MoE quantization`.
