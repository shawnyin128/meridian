---
type: "topic"
title: "equivalent transformation"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
source_papers:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
related_papers:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
related_methods:
  - "post-training quantization"
  - "outlier-aware quantization"
  - "calibration-aware PTQ"
  - "equivalent-transform PTQ"
  - "rotation-based quantization"
  - "long-context inference"
  - "KV-cache compression"
  - "transformer architecture"
  - "hardware-aware quantization"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-3b1a8f6d80"
---
# equivalent transformation

## Scope

This topic page compiles canonical paper pages around `equivalent transformation`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]]
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference]]
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs]]
- [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration]]
- [[papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap]]
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models]]

## Method Families

- [[methods/post-training-quantization|post-training quantization]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/equivalent-transform-PTQ|equivalent-transform PTQ]]
- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[methods/long-context-inference|long-context inference]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]

## Claims

- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equival...
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]: Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically eq...
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]: Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs: Applies computationally invariant randomized Hadamard rotations to residual streams, FFN activations, attention values, and KV cache so outlie...
- [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration|Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration]]: Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget const...
- [[papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap|Xie et al. - 2024 - Advancing Multimodal Large Language Models with Quantization-Aware Scale Learning for Efficient Adap]]: Xie et al. - 2024 - Advancing Multimodal Large Language Models with Quantization-Aware Scale Learning for Efficient Adap: Freezes full-precision weights but learns a small set of clipping and equivalent-transform paramet...
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models]]: Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematical...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `equivalent transformation`.
