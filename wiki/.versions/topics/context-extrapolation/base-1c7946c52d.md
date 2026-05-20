---
type: "topic"
title: "context extrapolation"
status: "active"
related_papers:
  - "[[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression|Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression]]"
related_methods:
  - "long-context inference"
  - "KV-cache compression"
  - "post-training quantization"
  - "hardware-aware quantization"
confidence: "medium"
---
# context extrapolation

## Related Papers

- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression|Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression]]
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free|Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free]]
- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context|Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context]]
- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens]]
- [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models|Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models]]
- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]
- [[papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer|Beltagy et al. - 2020 - Longformer The Long-Document Transformer]]
- [[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers|Child et al. - 2019 - Generating Long Sequences with Sparse Transformers]]
- [[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models|Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models]]
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference]]
- [[papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces|Gu and Dao - 2024 - Mamba Linear-Time Sequence Modeling with Selective State Spaces]]
- [[papers/2209-11895v1|2209.11895v1]]
- [[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs|Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques]]
- [[papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length|Liu et al. - 2025 - PEARL Parallel Speculative Decoding with Adaptive Draft Length]]
- [[papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test|Li et al. - 2025 - EAGLE-3 Scaling up Inference Acceleration of Large Language Models via Training-Time Test]]
- [[papers/13979-STAR-Speculative-Decodin|13979_STAR_Speculative_Decodin]]
- [[papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models|Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models]]
- [[papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation|Li et al. - 2024 - SnapKV LLM Knows What You are Looking for Before Generation]]
- [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling|Cai et al. - 2025 - PyramidKV Dynamic KV Cache Compression based on Pyramidal Information Funneling]]
- [[papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks|Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks]]
- [[papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs|Ge et al. - 2024 - Model Tells You What to Discard Adaptive KV Cache Compression for LLMs]]
- [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding|Elhoushi et al. - 2024 - LayerSkip Enabling Early Exit Inference and Self-Speculative Decoding]]
- [[papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding|Li et al. - 2025 - Gumiho A Hybrid Architecture to Prioritize Early Tokens in Speculative Decoding]]
- [[papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco|Sadhukhan et al. - 2025 - MagicDec Breaking the Latency-Throughput Tradeoff for Long Context Generation with Speculative Deco]]
- [[papers/27323-KVCapsule-Efficient-Temp|27323_KVCapsule_Efficient_Temp]]
- [[papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents|Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents]]
- [[papers/Wu-2025-LONGMEMEVAL-BENCHMARKING-CHAT-ASSIST-ANTS-ON-LONG-TERM-INTERACTIVE-MEMORY|Wu 等 - 2025 - LONGMEMEVAL BENCHMARKING CHAT ASSIST- ANTS ON LONG-TERM INTERACTIVE MEMORY]]
- [[papers/DeepSeek-V4|DeepSeek_V4]]
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering|GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering]]
- [[papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi|Wang 等 - 2025 - QSVD Efficient Low-rank Approximation for Unified Query-Key-Value Weight Compression in Low-Precisi]]
- [[papers/Jiang-et-al-2024-Mixtral-of-Experts|Jiang et al. - 2024 - Mixtral of Experts]]
- [[papers/Dao-2023-FlashAttention-2-Faster-Attention-with-Better-Parallelism-and-Work-Partitioning|Dao - 2023 - FlashAttention-2 Faster Attention with Better Parallelism and Work Partitioning]]
- [[papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele|Wu et al. - 2025 - PolarQuant Leveraging Polar Transformation for Efficient Key Cache Quantization and Decoding Accele]]
- [[papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers|Tian et al. - 2025 - Irrational Complex Rotations Empower Low-bit Optimizers]]
- [[papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization|Zhang et al. - 2024 - KV Cache is 1 Bit Per Channel Efficient Large Language Model Inference with Coupled Quantization]]
