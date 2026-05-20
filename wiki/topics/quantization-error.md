---
type: "topic"
title: "quantization error"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/1808-05779v3.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
source_papers:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/1808-05779v3.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
related_papers:
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/1808-05779v3.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation.md"
  - "papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration.md"
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
  - "papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization.md"
related_methods:
  - "long-context inference"
  - "KV-cache compression"
  - "transformer architecture"
  - "post-training quantization"
  - "hardware-aware quantization"
  - "quantization-aware training"
  - "learned quantization intervals"
  - "outlier-aware quantization"
  - "calibration-aware PTQ"
  - "rotation-based quantization"
  - "survey synthesis"
  - "layer-wise PTQ"
  - "non-uniform weight quantization"
  - "speculative decoding"
  - "preference-based reinforcement learning"
  - "reward modeling"
  - "sparse outlier retention"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-9b34f1549f"
---
# quantization error

## Scope

This topic page compiles canonical paper pages around `quantization error`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs]]
- [[papers/1808-05779v3]]
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss]]
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for]]
- [[papers/2511-10645v1]]
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference]]
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an]]
- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]]
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models]]
- [[papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression]]
- [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report]]
- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization]]
- [[papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations]]
- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation]]
- [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration]]
- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models]]
- [[papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap]]
- [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati]]
- [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa]]
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization]]
- [[papers/Zhang-et-al-2024-KV-Cache-is-1-Bit-Per-Channel-Efficient-Large-Language-Model-Inference-with-Coupled-Quantization]]

## Method Families

- [[methods/long-context-inference|long-context inference]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/quantization-aware-training|quantization-aware training]]
- [[methods/learned-quantization-intervals|learned quantization intervals]]
- [[methods/outlier-aware-quantization|outlier-aware quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[methods/survey-synthesis|survey synthesis]]
- [[methods/layer-wise-PTQ|layer-wise PTQ]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[methods/speculative-decoding|speculative decoding]]
- [[methods/preference-based-reinforcement-learning|preference-based reinforcement learning]]
- [[methods/reward-modeling|reward modeling]]
- [[methods/sparse-outlier-retention|sparse outlier retention]]

## Claims

- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]: Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks whether the r...
- [[papers/1808-05779v3|1808.05779v3]]: 1808.05779v3: Learns quantization interval parameters jointly with task loss so clipping/pruning and bit assignment are optimized for network accuracy instead of fixed min-max ranges. It operates on full-precision weight...
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss|Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss]]: Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss: Learns quantization interval parameters jointly with task loss so clipping/pruning and bit assignment are optim...
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]: Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for is a pipeline: QSUR-guided orthogonal and scaling transformations: Introduces Quantization Space Util...
- [[papers/2511-10645v1|2511.10645v1]]: 2511.10645v1: However, the presence of outliers in weights and activations often leads to large quantization errors and severe accuracy degradation, especially in recent reasoning LLMs where errors accumulate across long...
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference|Liang et al. - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference]]: Liang et al. - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference: However, the presence of outliers in weights and activations often leads to large quantization errors and severe accur...
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an|Bouda et al. - 2016 - Box-Counting Dimension Revisited Presenting an Efficient Method of Minimizing Quantization Error an]]: Bouda et al. - 2016 - Box-Counting Dimension Revisited Presenting an Efficient Method of Minimizing Quantization Error an is a KV-cache compression method: it decides which cached key/value entries to retain under a memo...
- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization: Revisits layer-wise PTQ by explicitly propagating previous-layer quantization error into the next layer's optimi...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `quantization error`.
