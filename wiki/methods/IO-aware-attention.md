---
type: "method"
title: "IO-aware attention"
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
related_methods:
related_topics:
  - "post-training quantization"
  - "hardware-aware quantization"
  - "benchmark evaluation"
  - "IO-aware attention"
  - "low-precision attention"
  - "transformer architecture"
  - "computer architecture"
  - "performance evaluation"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-8c145f2da2"
---
# IO-aware attention

## What It Is

This is a compiled method-family page for `IO-aware attention`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models|Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models]]: ### Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models - Purpose: Schedule attention tiles, memory movement, and precision on the target GPU so attention is faster without changing the intended output. - Operat...
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models|Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models]]: ### Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models - Purpose: Schedule attention tiles, memory movement, and precision on the target GPU so attention is faster without changing the i...
- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]: ### Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention - Purpose: Schedule attention tiles, memory movement, and precision on the target GPU so attention is faster without changing the inte...
- [[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models|Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models]]: ### Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models - Purpose: Schedule attention tiles, memory movement, and precision on the target GPU so attention is faster without changing the intended output...
- [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models|Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models]]: ### Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models - Purpose: In this work, we propose Hyena, a subquadratic drop-in replacement for attention constructed by interleaving implicitly parametrized long convo...
- [[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs|Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs]]: ### Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs - Purpose: Schedule attention tiles, memory movement, and precision on the target GPU so attention is faster without chang...
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache|Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache]]: ### Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache - Purpose: Schedule attention tiles, memory movement, and precision on the target GPU so attention is faster without changing the intended o...
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]: ### Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding - Purpose: Schedule attention tiles, memory movement, and precision on the target GPU so attention is faster without changing the intended outp...

## Used By Papers

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

## Implementation Hooks

- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models|Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models]]: - Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models: Profile matmul, softmax, memory movement, and synchronization separately before trusting end-to-end throughput. - Wang et al. - 2023 - B...
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models|Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models]]: - Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models: Profile matmul, softmax, memory movement, and synchronization separately before trusting end-to-end throughput....
- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]: - Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention: Profile matmul, softmax, memory movement, and synchronization separately before trusting end-to-end throughput. - Y...
- [[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models|Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models]]: - Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models: Profile matmul, softmax, memory movement, and synchronization separately before trusting end-to-end throughput. - Sun et al. -...
- [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models|Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models]]: - Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - Attention kernel:...
- [[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs|Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs]]: - Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs: Profile matmul, softmax, memory movement, and synchronization separately before trusting end-to-end thr...
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache|Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache]]: - Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache: Profile matmul, softmax, memory movement, and synchronization separately before trusting end-to-end throughput. - Tiwari...
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]: - Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding: Profile matmul, softmax, memory movement, and synchronization separately before trusting end-to-end throughput. - Fu et al....

## Failure Modes

- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models|Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models|Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models|Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models|Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs|Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache|Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...

## Evidence

- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models|Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models|Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models|Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models|Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs|Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache|Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/IO-aware-attention-scheduling|IO-aware attention scheduling]]
