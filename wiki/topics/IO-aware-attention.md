---
type: "topic"
title: "IO-aware attention"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention.md"
  - "papers/Oswald-et-al-2023-Transformers-learn-in-context-by-gradient-descent.md"
  - "papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
source_papers:
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention.md"
  - "papers/Oswald-et-al-2023-Transformers-learn-in-context-by-gradient-descent.md"
  - "papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
related_papers:
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention.md"
  - "papers/Oswald-et-al-2023-Transformers-learn-in-context-by-gradient-descent.md"
  - "papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
  - "papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
related_methods:
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
  - "long-context inference"
  - "transformer architecture"
  - "KV-cache compression"
  - "audio-language modeling"
  - "multimodal instruction tuning"
  - "post-training quantization"
  - "calibration-aware PTQ"
  - "hardware-aware quantization"
  - "self-rewarding model training"
  - "LLM-as-judge reward modeling"
  - "speculative decoding"
  - "survey synthesis"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-e2d6409f70"
---
# IO-aware attention

## Scope

This topic page compiles canonical paper pages around `IO-aware attention`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models]]
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models]]
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free]]
- [[papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need]]
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention]]
- [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models]]
- [[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers]]
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention]]
- [[papers/Oswald-et-al-2023-Transformers-learn-in-context-by-gradient-descent]]
- [[papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]]
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding]]
- [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling]]
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference]]
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]]
- [[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness]]
- [[papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning]]
- [[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision]]

## Method Families

- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]
- [[methods/long-context-inference|long-context inference]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/audio-language-modeling|audio-language modeling]]
- [[methods/multimodal-instruction-tuning|multimodal instruction tuning]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/self-rewarding-model-training|self-rewarding model training]]
- [[methods/LLM-as-judge-reward-modeling|LLM-as-judge reward modeling]]
- [[methods/speculative-decoding|speculative decoding]]
- [[methods/survey-synthesis|survey synthesis]]

## Claims

- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models|Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models]]: Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention runs faster withou...
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models|Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models]]: Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so atte...
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free|Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free]]: Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free: The output is a weighted sum of the values: Attention(Q, K, V ) = softmax QKT √dk  V , (2) where QKT √ dk...
- [[papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need|Shazeer - 2019 - Fast Transformer Decoding One Write-Head is All You Need]]: Shazeer - 2019 - Fast Transformer Decoding One Write-Head is All You Need: We propose a variant called multi-query attention, where the keys and values are shared across all of the diﬀerent attention "heads", greatly red...
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention|Shazeer et al. - 2020 - Talking-Heads Attention]]: Shazeer et al. - 2020 - Talking-Heads Attention is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks whether the retained cache stil...
- [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models|Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models]]: Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models: (1) Next, the attention weights are calculated as softmax(qT mkn p |D| ), (2) where qm, kn are considered as column vectors so that q...
- [[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers|Child et al. - 2019 - Generating Long Sequences with Sparse Transformers]]: Child et al. - 2019 - Generating Long Sequences with Sparse Transformers: In this paper we introduce sparse factorizations of the attention matrix which reduce this to O(n√n). We used the same self-attention based archit...
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]: Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-bud...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `IO-aware attention`.
## Key Concepts

- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[concepts/Activation-outliers|Activation outliers]]
- [[concepts/Attention-sink|Attention sink]]
- [[concepts/Per-channel-scaling|Per-channel scaling]]
