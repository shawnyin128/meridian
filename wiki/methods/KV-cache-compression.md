---
type: "method"
title: "KV-cache compression"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention.md"
  - "papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
  - "papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length.md"
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
  - "papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
source_papers:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention.md"
  - "papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
  - "papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length.md"
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
  - "papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
related_papers:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention.md"
  - "papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
  - "papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length.md"
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/DeepSeek-V4.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
  - "papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
related_methods:
related_topics:
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
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-e9938fc5de"
---
# KV-cache compression

## What It Is

This is a compiled method-family page for `KV-cache compression`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]: ### Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff. - Operates on: KV-cache tensors; re...
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]: ### Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff. -...
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression|Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression]]: ### Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime...
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention|Shazeer et al. - 2020 - Talking-Heads Attention]]: ### Shazeer et al. - 2020 - Talking-Heads Attention - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff. - Operates on: token embeddings; query/key/value proj...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: ### Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tr...
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]: ### Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime trad...
- [[papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity|Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity]]: ### Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff. - Operates on: token embeddings;...
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference]]: ### Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runt...

## Used By Papers

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs]]
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]]
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression]]
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention]]
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation]]
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention]]
- [[papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity]]
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference]]
- [[papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces]]
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]]
- [[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc]]
- [[papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length]]
- [[papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test]]
- [[papers/13979-STAR-Speculative-Decodin]]
- [[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo]]
- [[papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models]]
- [[papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation]]
- [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling]]
- [[papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs]]
- [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling]]
- [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding]]
- [[papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding]]
- [[papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco]]
- [[papers/27323-KVCapsule-Efficient-Temp]]
- [[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification]]
- [[papers/DeepSeek-V4]]
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering]]
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model]]
- [[papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration]]
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]]
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele]]
- [[papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers]]
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac]]
- [[papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits]]
- [[papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization]]

## Implementation Hooks

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]: - Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs: Measure retention ratio, decode latency, memory footprint, and quality under the same sequence lengths. - Wang et al. - 2024 - BitNet a4.8 4-bit Activa...
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]: - Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs: Verify transformation equivalence before quantizing, then measure quantization error after rotation. - Wang et al. -...
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression|Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression]]: - Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression: Measure retention ratio, decode latency, memory footprint, and quality under the same sequence lengths. -...
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention|Shazeer et al. - 2020 - Talking-Heads Attention]]: - Shazeer et al. - 2020 - Talking-Heads Attention: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - KV-cache: Verify K/V tensor shapes, position indices...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: - Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation...
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]: - Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation ca...
- [[papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity|Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity]]: - Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - Wang et al. - 2020 - Linformer...
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference]]: - Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference: Measure retention ratio, decode latency, memory footprint, and quality under the same sequence lengths...

## Failure Modes

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]: - Long-context or KV-cache gains should be checked at the target sequence lengths and tasks. - Runtime/memory improvements can trade off against quality in ways hidden by short-context metrics. Open questions: - Do key f...
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression|Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression]]: - Long-context or KV-cache gains should be checked at the target sequence lengths and tasks. - Runtime/memory improvements can trade off against quality in ways hidden by short-context metrics. Open questions: - Do key f...
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention|Shazeer et al. - 2020 - Talking-Heads Attention]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity|Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...

## Evidence

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression|Wang et al. - 2025 - SVD-LLM Truncation-aware Singular Value Decomposition for Large Language Model Compression]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention|Shazeer et al. - 2020 - Talking-Heads Attention]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity|Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Cache-retention-policy|Cache retention policy]]
- [[concepts/Attention-sink|Attention sink]]
- [[concepts/KV-cache-memory-bandwidth|KV-cache memory bandwidth]]
