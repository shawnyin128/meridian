---
type: "concept"
title: "Activation outliers"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "LLM outliers"
  - "activation outlier"
  - "outlier activations"
sources:
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs.md"
  - "papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
source_papers:
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs.md"
  - "papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
related_methods:
  - "post-training quantization"
  - "outlier-aware quantization"
  - "activation smoothing"
related_topics:
  - "quantization"
  - "systems ML"
related_claims:
related_evidence:
prerequisite_for:
  - "post-training quantization"
  - "outlier-aware quantization"
  - "activation smoothing"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-dad9e57a4f"
---
# Activation outliers

## What It Is

`Activation outliers` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Outlier activations can dominate quantization scale choices and make low-bit activation or weight-activation quantization fail even when average error looks acceptable.

## Where It Appears

- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]]
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition]]
- [[papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs]]
- [[papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models]]
- [[papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models]]
- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]]
- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs]]
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]]
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers]]
- [[papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation]]
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models]]
- [[papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap]]
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference]]

## Used By Methods

- [[methods/post-training-quantization|post-training quantization]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/activation-smoothing|activation smoothing]]

## Implementation Implications

- Inspect per-channel and per-token activation ranges before choosing scaling or clipping.
- Keep calibration data and routing/expert paths aligned with the target deployment regime.

## Common Failure Modes

- A global scale hides rare channels that drive most error.
- An ablation looks stable on average metrics while failing on outlier-heavy layers.

## Minimal Checks / Probes

- Plot layer-wise max/RMS activation ranges on calibration batches.
- Run an outlier-suppression ablation and check whether quantization error moves to another layer.

## Evidence / Provenance

- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers|Frantar et al. - 2023 - GPTQ Accurate Post-Training Quantization for Generative Pre-trained Transformers]]: frantar et al 2023 gptq accurate post training quantization for generative pre trained transformers gptq frantar et al 2023 gptq accurate post training quantization for generative pre trained transformers post training quantization low bit quantization activat...
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]: li et al moe svd structured mixture of experts llms compression via singular value decomposition moe svd li et al moe svd structured mixture of experts llms compression via singular value decomposition low bit quantization moe quantization activation outliers...
- [[papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs|Lin et al. - 2024 - DuQuant Distributing Outliers via Dual Transformation Makes Stronger Quantized LLMs]]: lin et al 2024 duquant distributing outliers via dual transformation makes stronger quantized llms duquant dual transformation for massive and normal outliers low bit quantization activation outliers rotation based quantization hardware aware quantization benc...
- [[papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models|Shao et al. - 2024 - OmniQuant Omnidirectionally Calibrated Quantization for Large Language Models]]: shao et al 2024 omniquant omnidirectionally calibrated quantization for large language models omniquant block wise error minimization with learnable quantization parameters post training quantization low bit quantization calibration data selection activation o...
- [[papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models|Sun et al. - 2024 - Massive Activations in Large Language Models]]: sun et al 2024 massive activations in large language models massiveactivations massive activation localization and mechanism analysis benchmark evaluation mechanistic activation analysis sparse mixture of experts transformer architecture llm outliers mechanist...
- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: wang lsvd loss aware low rank approximation for efficient low precision vision language models lsvd loss aware low rank low precision smoothquant activation to weight smoothing post training quantization low bit quantization activation outliers equivalent tran...
- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]: wang et al 2024 bitnet a4 8 4 bit activations for 1 bit llms bitnet wang et al 2024 bitnet a4 8 4 bit activations for 1 bit llms low bit quantization activation outliers quantization error hardware aware quantization lookup table inference benchmark evaluation...
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]: wang et al 2025 bitnet v2 native 4 bit activations with hadamard transformation for 1 bit llms bitnet wang et al 2025 bitnet v2 native 4 bit activations with hadamard transformation for 1 bit llms low bit quantization activation outliers rotation based quantiz...

## Related Concepts

- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[concepts/Per-channel-scaling|Per-channel scaling]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for PTQ, activation quantization, MoE quantization, and outlier smoothing ablations.
