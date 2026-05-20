---
type: "topic"
title: "KV-cache compression"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
source_papers:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
related_papers:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
related_methods:
  - "long-context inference"
  - "KV-cache compression"
  - "transformer architecture"
  - "post-training quantization"
  - "hardware-aware quantization"
  - "outlier-aware quantization"
  - "calibration-aware PTQ"
  - "rotation-based quantization"
  - "audio-language modeling"
  - "multimodal instruction tuning"
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
revision_id: "knowledge-9aeeedc898"
---
# KV-cache compression

## Scope

This topic page compiles canonical paper pages around `KV-cache compression`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs]]
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]]
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression]]
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference]]
- [[papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]]
- [[papers/13979-STAR-Speculative-Decodin]]
- [[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo]]
- [[papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models]]
- [[papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation]]
- [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling]]
- [[papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs]]
- [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding]]
- [[papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding]]
- [[papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco]]
- [[papers/27323-KVCapsule-Efficient-Temp]]
- [[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification]]
- [[papers/DeepSeek-V4]]
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering]]
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model]]
- [[papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele]]
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac]]
- [[papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization]]

## Method Families

- [[methods/long-context-inference|long-context inference]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[methods/audio-language-modeling|audio-language modeling]]
- [[methods/multimodal-instruction-tuning|multimodal instruction tuning]]
- [[methods/speculative-decoding|speculative decoding]]
- [[methods/survey-synthesis|survey synthesis]]

## Claims

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]: Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks whether the r...
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]: Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget con...
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression|Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression]]: Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cach...
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference]]: Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or c...
- [[papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces|Gu and Dao - 2024 - Mamba Linear-Time Sequence Modeling with Selective State Spaces]]: Gu and Dao - 2024 - Mamba Linear-Time Sequence Modeling with Selective State Spaces is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then ch...
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques]]: Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the qual...
- [[papers/13979-STAR-Speculative-Decodin|13979_STAR_Speculative_Decodin]]: 13979_STAR_Speculative_Decodin: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context l...
- [[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo|Hu et al. - 2025 - DREAM Drafting with Refined Target Features and Entropy-Adaptive Cross-Attention Fusion for Multimo]]: Hu et al. - 2025 - DREAM Drafting with Refined Target Features and Entropy-Adaptive Cross-Attention Fusion for Multimo: We introduce DREAM, a novel speculative decoding framework tailored for VLMs that combines three key...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `KV-cache compression`.
