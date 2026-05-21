---
type: "topic"
title: "attention kernel scheduling"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
source_papers:
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
related_papers:
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
related_methods:
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
  - "long-context inference"
  - "KV-cache compression"
  - "transformer architecture"
  - "post-training quantization"
  - "hardware-aware quantization"
  - "non-uniform weight quantization"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-b97fdd9bc3"
---
# attention kernel scheduling

## Scope

This topic page compiles canonical paper pages around `attention kernel scheduling`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention]]
- [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models]]
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference]]
- [[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness]]
- [[papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning]]
- [[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision]]

## Method Families

- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]
- [[methods/long-context-inference|long-context inference]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]

## Claims

- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]: Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attenti...
- [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models|Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models]]: Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models: In this work, we propose Hyena, a subquadratic drop-in replacement for attention constructed by interleaving implicitly parametrized long...
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]: Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention runs f...
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models|Li et al. - 2025 - MBQ Modality-Balanced Quantization for Large Vision-Language Models]]: Li et al. - 2025 - MBQ Modality-Balanced Quantization for Large Vision-Language Models is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then...
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]: Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inf...
- [[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness|Dao et al. - 2022 - FlashAttention Fast and Memory-Efficient Exact Attention with IO-Awareness]]: Dao et al. - 2022 - FlashAttention Fast and Memory-Efficient Exact Attention with IO-Awareness is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention runs...
- [[papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning|Dao - 2023 - FlashAttention-2 Faster Attention with Better Parallelism and Work Partitioning]]: Dao - 2023 - FlashAttention-2 Faster Attention with Better Parallelism and Work Partitioning is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention runs f...
- [[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision|Shah et al. - 2024 - FlashAttention-3 Fast and Accurate Attention with Asynchrony and Low-precision]]: Shah et al. - 2024 - FlashAttention-3 Fast and Accurate Attention with Asynchrony and Low-precision is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `attention kernel scheduling`.
## Key Concepts

- [[concepts/IO-aware-attention-scheduling|IO-aware attention scheduling]]
