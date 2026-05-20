---
type: "method"
title: "KV-cache compression"
status: "active"
related_papers:
  - "[[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]"
topics:
  - "low-bit quantization"
  - "activation outliers"
  - "quantization error"
  - "hardware-aware quantization"
  - "lookup-table inference"
  - "benchmark evaluation"
  - "long-context inference"
  - "KV-cache compression"
  - "transformer architecture"
  - "performance evaluation"
confidence: "medium"
review_state: "active"
---
# KV-cache compression

## Related Papers

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression|Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression]]
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention|Shazeer et al. - 2020 - Talking-Heads Attention]]
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]
- [[papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity|Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity]]
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference]]
- [[papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces|Gu and Dao - 2024 - Mamba Linear-Time Sequence Modeling with Selective State Spaces]]
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques]]
- [[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc|Miao et al. - 2024 - SpecInfer Accelerating Generative Large Language Model Serving with Tree-based Speculative Inferenc]]
- [[papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length|Liu et al. - 2025 - PEARL Parallel Speculative Decoding with Adaptive Draft Length]]
- [[papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test|Li et al. - 2025 - EAGLE-3 Scaling up Inference Acceleration of Large Language Models via Training-Time Test]]
- [[papers/13979-STAR-Speculative-Decodin|13979_STAR_Speculative_Decodin]]
- [[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo|Hu et al. - 2025 - DREAM Drafting with Refined Target Features and Entropy-Adaptive Cross-Attention Fusion for Multimo]]
- [[papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models|Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models]]
- [[papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation|Li et al. - 2024 - SnapKV LLM Knows What You are Looking for Before Generation]]
- [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling|Cai et al. - 2025 - PyramidKV Dynamic KV Cache Compression based on Pyramidal Information Funneling]]
- [[papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs|Ge et al. - 2024 - Model Tells You What to Discard Adaptive KV Cache Compression for LLMs]]
- [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling|Schuster et al. - 2022 - Confident Adaptive Language Modeling]]
- [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding|Elhoushi et al. - 2024 - LayerSkip Enabling Early Exit Inference and Self-Speculative Decoding]]
- [[papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding|Li et al. - 2025 - Gumiho A Hybrid Architecture to Prioritize Early Tokens in Speculative Decoding]]
- [[papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco|Sadhukhan et al. - 2025 - MagicDec Breaking the Latency-Throughput Tradeoff for Long Context Generation with Speculative Deco]]
- [[papers/27323-KVCapsule-Efficient-Temp|27323_KVCapsule_Efficient_Temp]]
- [[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification|Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification]]
- [[papers/DeepSeek-V4|DeepSeek_V4]]
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering|GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering]]
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model|DeepSeek-AI 等 - 2024 - DeepSeek-V2 A Strong, Economical, and Efficient Mixture-of-Experts Language Model]]
- [[papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi|Wang 等 - 2025 - QSVD Efficient Low-rank Approximation for Unified Query-Key-Value Weight Compression in Low-Precisi]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models|Li et al. - 2025 - MBQ Modality-Balanced Quantization for Large Vision-Language Models]]
- [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration|Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration]]
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers|Frantar et al. - 2023 - GPTQ Accurate Post-Training Quantization for Generative Pre-trained Transformers]]
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]
- [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]
- [[papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele|Wu et al. - 2025 - PolarQuant Leveraging Polar Transformation for Efficient Key Cache Quantization and Decoding Accele]]
- [[papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers|Tian et al. - 2025 - Irrational Complex Rotations Empower Low-bit Optimizers]]
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac|Son et al. - 2025 - NSNQuant A Double Normalization Approach for Calibration-Free Low-Bit Vector Quantization of KV Cac]]
- [[papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits|Ma et al. - 2024 - The Era of 1-bit LLMs All Large Language Models are in 1.58 Bits]]
- [[papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization|Zhang et al. - 2024 - KV Cache is 1 Bit Per Channel Efficient Large Language Model Inference with Coupled Quantization]]
