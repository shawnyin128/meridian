---
type: "topic"
title: "post-training quantization"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
source_papers:
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
related_papers:
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
related_methods:
  - "transformer architecture"
  - "post-training quantization"
  - "calibration-aware PTQ"
  - "hardware-aware quantization"
  - "non-uniform weight quantization"
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
  - "outlier-aware quantization"
  - "rotation-based quantization"
  - "survey synthesis"
  - "layer-wise PTQ"
  - "equivalent-transform PTQ"
  - "MoE quantization"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-b75cc8abf9"
---
# post-training quantization

## Scope

This topic page compiles canonical paper pages around `post-training quantization`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]]
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]]
- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models]]
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models]]
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for]]
- [[papers/2511-10645v1]]
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference]]
- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]]
- [[papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression]]
- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]]
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers]]
- [[papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations]]
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks]]
- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models]]
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]]
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models]]
- [[papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs]]
- [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa]]
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization]]

## Method Families

- [[methods/transformer-architecture|transformer architecture]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[methods/survey-synthesis|survey synthesis]]
- [[methods/layer-wise-PTQ|layer-wise PTQ]]
- [[methods/equivalent-transform-PTQ|equivalent-transform PTQ]]
- [[methods/MoE-quantization|MoE quantization]]

## Claims

- [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]: Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models: To address these challenges, we introduce a novel quantization-aware training framework called EfficientQAT. Con- versely...
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees|Chee et al. - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: Chee et al. - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inference. It...
- [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models|Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models]]: Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention runs faster withou...
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models|Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models]]: Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so atte...
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]: Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for is a pipeline: QSUR-guided orthogonal and scaling transformations: Introduces Quantization Space Util...
- [[papers/2511-10645v1|2511.10645v1]]: 2511.10645v1: However, the presence of outliers in weights and activations often leads to large quantization errors and severe accuracy degradation, especially in recent reasoning LLMs where errors accumulate across long...
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference|Liang et al. - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference]]: Liang et al. - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference: However, the presence of outliers in weights and activations often leads to large quantization errors and severe accur...
- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization: Revisits layer-wise PTQ by explicitly propagating previous-layer quantization error into the next layer's optimi...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `post-training quantization`.
## Key Concepts

- [[concepts/Calibration-representativeness|Calibration representativeness]]
