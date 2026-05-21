---
type: "topic"
title: "long-context inference"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context.md"
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer.md"
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/2209-11895v1.md"
  - "papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents.md"
  - "papers/Wu-2025-LONGMEMEVAL-BENCHMARKING-CHAT-ASSIST-ANTS-ON-LONG-TERM-INTERACTIVE-MEMORY.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi.md"
  - "papers/Yang-et-al-2025-Qwen3-Technical-Report.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
  - "papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
source_papers:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context.md"
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer.md"
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/2209-11895v1.md"
  - "papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents.md"
  - "papers/Wu-2025-LONGMEMEVAL-BENCHMARKING-CHAT-ASSIST-ANTS-ON-LONG-TERM-INTERACTIVE-MEMORY.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi.md"
  - "papers/Yang-et-al-2025-Qwen3-Technical-Report.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
  - "papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
related_papers:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context.md"
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer.md"
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/2209-11895v1.md"
  - "papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents.md"
  - "papers/Wu-2025-LONGMEMEVAL-BENCHMARKING-CHAT-ASSIST-ANTS-ON-LONG-TERM-INTERACTIVE-MEMORY.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi.md"
  - "papers/Yang-et-al-2025-Qwen3-Technical-Report.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
  - "papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
related_methods:
  - "long-context inference"
  - "KV-cache compression"
  - "transformer architecture"
  - "post-training quantization"
  - "hardware-aware quantization"
  - "relative position encoding"
  - "RoPE scaling"
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
  - "audio-language modeling"
  - "multimodal instruction tuning"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-bf605515ff"
---
# long-context inference

## Scope

This topic page compiles canonical paper pages around `long-context inference`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs]]
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression]]
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free]]
- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context]]
- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens]]
- [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models]]
- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention]]
- [[papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer]]
- [[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers]]
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference]]
- [[papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces]]
- [[papers/2209-11895v1]]
- [[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]]
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache]]
- [[papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models]]
- [[papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation]]
- [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling]]
- [[papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs]]
- [[papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco]]
- [[papers/27323-KVCapsule-Efficient-Temp]]
- [[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification]]
- [[papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents]]
- [[papers/Wu-2025-LONGMEMEVAL-BENCHMARKING-CHAT-ASSIST-ANTS-ON-LONG-TERM-INTERACTIVE-MEMORY]]
- [[papers/DeepSeek-V4]]
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering]]
- [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report]]
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model]]
- [[papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi]]
- [[papers/Yang-et-al-2025-Qwen3-Technical-Report]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision]]
- [[papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele]]
- [[papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers]]
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac]]
- [[papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization]]

## Method Families

- [[methods/long-context-inference|long-context inference]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/relative-position-encoding|relative position encoding]]
- [[methods/RoPE-scaling|RoPE scaling]]
- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]
- [[methods/audio-language-modeling|audio-language modeling]]
- [[methods/multimodal-instruction-tuning|multimodal instruction tuning]]

## Claims

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]: Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks whether the r...
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression|Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression]]: Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cach...
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free|Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free]]: Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free: The output is a weighted sum of the values: Attention(Q, K, V ) = softmax QKT √dk  V , (2) where QKT √ dk...
- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context|Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context]]: Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context: We introduce the notion of recurrence into our arXiv:1901.02860v3 [cs.LG] 2 Jun 2019 deep self-attention network. Hence, as an a...
- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens]]: Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens: Searches and progressively extends RoPE scaling factors so an LLM can move from its original context window to very long contexts while...
- [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models|Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models]]: Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models: (1) Next, the attention weights are calculated as softmax(qT mkn p |D| ), (2) where qm, kn are considered as column vectors so that q...
- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]: Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attenti...
- [[papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer|Beltagy et al. - 2020 - Longformer The Long-Document Transformer]]: Beltagy et al. - 2020 - Longformer The Long-Document Transformer: To address this limitation, we introduce the Longformer with an attention mechanism that scales linearly with sequence length, making it easy to process d...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `long-context inference`.
## Key Concepts

- [[concepts/Cache-retention-policy|Cache retention policy]]
