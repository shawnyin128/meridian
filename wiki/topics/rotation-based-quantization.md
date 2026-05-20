---
type: "topic"
title: "rotation-based quantization"
status: "active"
related_papers:
  - "[[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]"
related_methods:
  - "KV-cache compression"
  - "post-training quantization"
  - "outlier-aware quantization"
  - "calibration-aware PTQ"
  - "rotation-based quantization"
  - "hardware-aware quantization"
confidence: "medium"
---
# rotation-based quantization

## Related Papers

- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]
- [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models|Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models]]
- [[papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence|Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence]]
- [[papers/2511-10645v1|2511.10645v1]]
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference|Liang et al. - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference]]
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an|Bouda et al. - 2016 - Box-Counting Dimension Revisited Presenting an Efficient Method of Minimizing Quantization Error an]]
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]
- [[papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu|Wang 等 - 2026 - WSVD Weighted Low-Rank Approximation for Fast and Efficient Execution of Low-Precision Vision-Langu]]
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]
- [[papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations|Liu et al. - 2025 - SpinQuant LLM quantization with learned rotations]]
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks|Tseng et al. - 2024 - QuIP# Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks]]
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]
- [[papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation|Xiang and Zhang - 2024 - DFRot Achieving Outlier-Free and Massive Activation-Free for Rotated LLMs with Refined Rotation]]
- [[papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs|Lin et al. - 2024 - DuQuant Distributing Outliers via Dual Transformation Makes Stronger Quantized LLMs]]
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization|Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization]]
- [[papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers|Tian et al. - 2025 - Irrational Complex Rotations Empower Low-bit Optimizers]]
- [[papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization|Liu et al. - 2025 - ParetoQ Scaling Laws in Extremely Low-bit LLM Quantization]]
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac|Son et al. - 2025 - NSNQuant A Double Normalization Approach for Calibration-Free Low-Bit Vector Quantization of KV Cac]]
- [[papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits|Ma et al. - 2024 - The Era of 1-bit LLMs All Large Language Models are in 1.58 Bits]]
