---
type: "topic"
title: "low-bit quantization"
status: "active"
related_papers:
  - "[[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]"
related_methods:
  - "transformer architecture"
  - "post-training quantization"
  - "calibration-aware PTQ"
  - "hardware-aware quantization"
confidence: "medium"
---
# low-bit quantization

## Related Papers

- [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees|Chee et al. - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]
- [[papers/3549-Train-Freeze-or-Exit-Dyna|3549_Train_Freeze_or_Exit_Dyna]]
- [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs|Wang et al. - 2024 - BitNet a4.8 4-bit Activations for 1-bit LLMs]]
- [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]
- [[papers/1808-05779v3|1808.05779v3]]
- [[papers/1909-13144v2|1909.13144v2]]
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss|Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss]]
- [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks]]
- [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]
- [[papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models|Rahmati et al. - 2025 - C-LoRA Contextual Low-Rank Adaptation for Uncertainty Estimation in Large Language Models]]
- [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models|Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models]]
- [[papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence|Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence]]
- [[papers/2511-10645v1|2511.10645v1]]
- [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference|Liang et al. - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference]]
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an|Bouda et al. - 2016 - Box-Counting Dimension Revisited Presenting an Efficient Method of Minimizing Quantization Error an]]
- [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]
- [[papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity|Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity]]
- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]
- [[papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression|Kuroki et al. - 2025 - Binary Quadratic Quantization Beyond First-Order Quantization for Real-Valued Matrix Compression]]
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache|Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache]]
- [[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc|Miao et al. - 2024 - SpecInfer Accelerating Generative Large Language Model Serving with Tree-based Speculative Inferenc]]
- [[papers/Sun-et-al-2024-A-Simple-and-Effective-Pruning-Approach-for-Large-Language-Models|Sun et al. - 2024 - A Simple and Effective Pruning Approach for Large Language Models]]
- [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling|Schuster et al. - 2022 - Confident Adaptive Language Modeling]]
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models|Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models]]
- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]
- [[papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi|Wang 等 - 2025 - QSVD Efficient Low-rank Approximation for Unified Query-Key-Value Weight Compression in Low-Precisi]]
- [[papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu|Wang 等 - 2026 - WSVD Weighted Low-Rank Approximation for Fast and Efficient Execution of Low-Precision Vision-Langu]]
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]
- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]
- [[papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations|Liu et al. - 2025 - SpinQuant LLM quantization with learned rotations]]
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks|Tseng et al. - 2024 - QuIP# Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks]]
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]
- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models]]
- [[papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models|Shao et al. - 2024 - OmniQuant Omnidirectionally Calibrated Quantization for Large Language Models]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models|Li et al. - 2025 - MBQ Modality-Balanced Quantization for Large Vision-Language Models]]
- [[papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation|Xiang and Zhang - 2024 - DFRot Achieving Outlier-Free and Massive Activation-Free for Rotated LLMs with Refined Rotation]]
- [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration|Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration]]
- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models|Ma et al. - 2024 - AffineQuant Affine Transformation Quantization for Large Language Models]]
- [[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale|Dettmers et al. - 2022 - LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale]]
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers|Frantar et al. - 2023 - GPTQ Accurate Post-Training Quantization for Generative Pre-trained Transformers]]
- [[papers/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs|Lin et al. - 2024 - DuQuant Distributing Outliers via Dual Transformation Makes Stronger Quantized LLMs]]
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models]]
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]
- [[papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs|Guo 等 - 2025 - Fast Matrix Multiplications for Lookup Table-Quantized LLMs]]
- [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati|Blumenberg et al. - 2025 - Improving Block-Wise LLM Quantization by 4-bit Block-Wise Optimal Float (BOF4) Analysis and Variati]]
- [[papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs|Dettmers et al. - 2023 - QLoRA Efficient Finetuning of Quantized LLMs]]
- [[papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization|Dettmers et al. - 2022 - 8-bit Optimizers via Block-wise Quantization]]
- [[papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs|Gope et al. - 2024 - Highly Optimized Kernels and Fine-Grained Codebooks for LLM Inference on Arm CPUs]]
- [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa|Hu et al. - 2025 - MoEQuant Enhancing Quantization for Mixture-of-Experts Large Language Models via Expert-Balanced Sa]]
- [[papers/Wei-et-al-2025-T-MAC-CPU-Renaissance-via-Table-Lookup-for-Low-Bit-LLM-Deployment-on-Edge|Wei et al. - 2025 - T-MAC CPU Renaissance via Table Lookup for Low-Bit LLM Deployment on Edge]]
- [[papers/Tian-et-al-2025-Irrational-Complex-Rotations-Empower-Low-bit-Optimizers|Tian et al. - 2025 - Irrational Complex Rotations Empower Low-bit Optimizers]]
- [[papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization|Liu et al. - 2025 - ParetoQ Scaling Laws in Extremely Low-bit LLM Quantization]]
- [[papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization|Lee et al. - 2025 - LittleBit Ultra Low-Bit Quantization via Latent Factorization]]
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac|Son et al. - 2025 - NSNQuant A Double Normalization Approach for Calibration-Free Low-Bit Vector Quantization of KV Cac]]
- [[papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits|Ma et al. - 2024 - The Era of 1-bit LLMs All Large Language Models are in 1.58 Bits]]
