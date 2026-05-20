---
type: "topic"
title: "low-precision attention"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models.md"
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
  - "papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
  - "papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
source_papers:
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models.md"
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
  - "papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
  - "papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_papers:
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models.md"
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
  - "papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
  - "papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_methods:
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-f4a9a3c180"
---
# low-precision attention

## Scope

This topic page compiles canonical paper pages around `low-precision attention`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models]]
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models]]
- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention]]
- [[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models]]
- [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models]]
- [[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs]]
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache]]
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding]]
- [[papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks]]
- [[papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu]]
- [[papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs]]
- [[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness]]
- [[papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning]]
- [[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision]]
- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints]]

## Method Families

- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]

## Claims

- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models|Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models]]: Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention runs faster withou...
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models|Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models]]: Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so atte...
- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]: Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attenti...
- [[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models|Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models]]: Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention runs fas...
- [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models|Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models]]: Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models: In this work, we propose Hyena, a subquadratic drop-in replacement for attention constructed by interleaving implicitly parametrized long...
- [[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs|Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs]]: Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute unit...
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache|Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache]]: Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention run...
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]: Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention runs f...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `low-precision attention`.
