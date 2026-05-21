---
type: "concept"
title: "IO-aware attention scheduling"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "IO-aware attention"
  - "attention kernel scheduling"
  - "hardware-aware attention"
  - "attention kernel optimization"
sources:
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/Oswald-et-al-2023-Transformers-learn-in-context-by-gradient-descent.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
  - "papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models.md"
source_papers:
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/Oswald-et-al-2023-Transformers-learn-in-context-by-gradient-descent.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
  - "papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models.md"
related_methods:
  - "IO-aware attention"
  - "attention kernel optimization"
  - "hardware-aware attention"
related_topics:
  - "IO-aware attention"
  - "attention kernel scheduling"
  - "computer architecture"
related_claims:
related_evidence:
prerequisite_for:
  - "IO-aware attention"
  - "attention kernel optimization"
  - "hardware-aware attention"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-0e5b915a5d"
---
# IO-aware attention scheduling

## What It Is

`IO-aware attention scheduling` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Attention speed often depends on memory movement and scheduling rather than only FLOP count, so algorithmic sparsity or tiling must be interpreted through the hardware execution path.

## Where It Appears

- [[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers]]
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models]]
- [[papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning]]
- [[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness]]
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]]
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding]]
- [[papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]]
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference]]
- [[papers/Oswald-et-al-2023-Transformers-learn-in-context-by-gradient-descent]]
- [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models]]
- [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models]]
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free]]
- [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling]]
- [[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision]]
- [[papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need]]
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention]]
- [[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models]]

## Used By Methods

- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/hardware-aware-attention|hardware-aware attention]]

## Implementation Implications

- Measure prefill and decode separately, and record the attention kernel used by each experiment.
- Treat block size, sequence length, and batching as part of the method contract.

## Common Failure Modes

- A sparse or low-bit attention idea improves theoretical cost but misses wall-clock speed because memory access dominates.
- Kernel scheduling changes alter numerical behavior or mask handling.

## Minimal Checks / Probes

- Profile memory reads/writes and kernel occupancy for representative sequence lengths.
- Compare against a strong dense attention kernel under identical batching.

## Evidence / Provenance

- [[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers|Child et al. - 2019 - Generating Long Sequences with Sparse Transformers]]: child et al 2019 generating long sequences with sparse transformers child et al 2019 generating long sequences with sparse transformers io aware attention long context inference sparse attention transformer architecture context extrapolation long context infer...
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models|Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models]]: chitsaz et al 2024 exploring quantization for efficient pre training of transformer language models pre training chitsaz et al 2024 exploring quantization for efficient pre training of transformer language models post training quantization hardware aware quant...
- [[papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning|Dao - 2023 - FlashAttention-2 Faster Attention with Better Parallelism and Work Partitioning]]: dao 2023 flashattention 2 faster attention with better parallelism and work partitioning flashattention 2 dao 2023 flashattention 2 faster attention with better parallelism and work partitioning attention kernel scheduling io aware attention low precision atte...
- [[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness|Dao et al. - 2022 - FlashAttention Fast and Memory-Efficient Exact Attention with IO-Awareness]]: dao et al 2022 flashattention fast and memory efficient exact attention with io awareness flashattention memory efficient io awareness dao et al 2022 flashattention fast and memory efficient exact attention with io awareness attention kernel scheduling io awar...
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers|Frantar et al. - 2023 - GPTQ Accurate Post-Training Quantization for Generative Pre-trained Transformers]]: frantar et al 2023 gptq accurate post training quantization for generative pre trained transformers gptq frantar et al 2023 gptq accurate post training quantization for generative pre trained transformers post training quantization low bit quantization activat...
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]: fu et al 2024 break the sequential dependency of llm inference using lookahead decoding fu et al 2024 break the sequential dependency of llm inference using lookahead decoding speculative decoding attention kernel scheduling io aware attention low precision at...
- [[papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs|Gope et al. - 2024 - Highly Optimized Kernels and Fine-Grained Codebooks for LLM Inference on Arm CPUs]]: gope et al 2024 highly optimized kernels and fine grained codebooks for llm inference on arm cpus fine grained cpus lut lut based system implementation post training quantization low bit quantization non uniform quantization hardware aware quantization lookup...
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques]]: hu et al 2025 speculative decoding and beyond an in depth survey of techniques in depth hu et al 2025 speculative decoding and beyond an in depth survey of techniques speculative decoding io aware attention long context inference kv cache compression transform...

## Related Concepts

- [[concepts/KV-cache-memory-bandwidth|KV-cache memory bandwidth]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for attention kernels, long-context systems, hardware-aware attention, and speed/accuracy attribution.
