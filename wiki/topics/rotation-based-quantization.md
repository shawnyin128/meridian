---
type: "topic"
title: "rotation-based quantization"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models.md"
  - "papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence.md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation.md"
  - "papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
  - "papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers.md"
  - "papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
source_papers:
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models.md"
  - "papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence.md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation.md"
  - "papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
  - "papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers.md"
  - "papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
related_papers:
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models.md"
  - "papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence.md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation.md"
  - "papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
  - "papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers.md"
  - "papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization.md"
  - "papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
related_methods:
  - "KV-cache compression"
  - "post-training quantization"
  - "outlier-aware quantization"
  - "calibration-aware PTQ"
  - "rotation-based quantization"
  - "hardware-aware quantization"
  - "survey synthesis"
  - "non-uniform weight quantization"
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
  - "transformer architecture"
  - "MoE quantization"
  - "equivalent-transform PTQ"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-ddad9ce570"
---
# rotation-based quantization

## Scope

This topic page compiles canonical paper pages around `rotation-based quantization`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]]
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for]]
- [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models]]
- [[papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence]]
- [[papers/2511-10645v1]]
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference]]
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an]]
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models]]
- [[papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu]]
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers]]
- [[papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations]]
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference]]
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks]]
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs]]
- [[papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation]]
- [[papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs]]
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization]]
- [[papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers]]
- [[papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization]]
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac]]
- [[papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits]]

## Method Families

- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/survey-synthesis|survey synthesis]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/MoE-quantization|MoE quantization]]
- [[methods/equivalent-transform-PTQ|equivalent-transform PTQ]]

## Claims

- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]: Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget con...
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]: Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for is a pipeline: QSUR-guided orthogonal and scaling transformations: Introduces Quantization Space Util...
- [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models|Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models]]: Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models: For instance, DoRA [63] decomposes LoRA weights into magnitude and direction components to improve learning capacity...
- [[papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence|Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence]]: Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence: Other work has also proposed low rank manipulations to the activations instead of the weights [Wu et al., 2024]. a) We measure the changes...
- [[papers/2511-10645v1|2511.10645v1]]: 2511.10645v1: However, the presence of outliers in weights and activations often leads to large quantization errors and severe accuracy degradation, especially in recent reasoning LLMs where errors accumulate across long...
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference|Liang et al. - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference]]: Liang et al. - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference: However, the presence of outliers in weights and activations often leads to large quantization errors and severe accur...
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an|Bouda et al. - 2016 - Box-Counting Dimension Revisited Presenting an Efficient Method of Minimizing Quantization Error an]]: Bouda et al. - 2016 - Box-Counting Dimension Revisited Presenting an Efficient Method of Minimizing Quantization Error an is a KV-cache compression method: it decides which cached key/value entries to retain under a memo...
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]: Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models is a clustering method/theory paper: it studies how data vectors are assigned to centroids and which objective or initia...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `rotation-based quantization`.
## Key Concepts

- [[concepts/Rotation-transform-invariance|Rotation transform invariance]]
