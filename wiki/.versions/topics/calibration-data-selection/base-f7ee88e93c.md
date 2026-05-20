---
type: "topic"
title: "calibration data selection"
status: "active"
related_papers:
  - "[[papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms|Schulman et al. - 2017 - Proximal Policy Optimization Algorithms]]"
related_methods:
  - "policy optimization"
confidence: "medium"
---
# calibration data selection

## Related Papers

- [[papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms|Schulman et al. - 2017 - Proximal Policy Optimization Algorithms]]
- [[papers/Schulman-et-al-2017-Trust-Region-Policy-Optimization|Schulman et al. - 2017 - Trust Region Policy Optimization]]
- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]
- [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]
- [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]
- [[papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models|Rahmati et al. - 2025 - C-LoRA Contextual Low-Rank Adaptation for Uncertainty Estimation in Large Language Models]]
- [[papers/Lu-et-al-2022-A-continental-scale-analysis-reveals-widespread-root-bimodality|Lu et al. - 2022 - A continental scale analysis reveals widespread root bimodality]]
- [[papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance|Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance]]
- [[papers/Zhou-et-al-2024-Batch-Calibration-Rethinking-Calibration-for-In-Context-Learning-and-Prompt-Engineering|Zhou et al. - 2024 - Batch Calibration Rethinking Calibration for In-Context Learning and Prompt Engineering]]
- [[papers/Wang-et-al-2023-Self-Consistency-Improves-Chain-of-Thought-Reasoning-in-Language-Models|Wang et al. - 2023 - Self-Consistency Improves Chain of Thought Reasoning in Language Models]]
- [[papers/Xie-et-al-2022-An-Explanation-of-In-context-Learning-as-Implicit-Bayesian-Inference|Xie et al. - 2022 - An Explanation of In-context Learning as Implicit Bayesian Inference]]
- [[papers/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation|Xie et al. - 2022 - Crystal Diffusion Variational Autoencoder for Periodic Material Generation]]
- [[papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models|Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models]]
- [[papers/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications|Yang et al. - 2025 - Diffusion Models A Comprehensive Survey of Methods and Applications]]
- [[papers/Lobet-et-al-2017-Using-a-Structural-Root-System-Model-to-Evaluate-and-Improve-the-Accuracy-of-Root-Image-Analysis-Pip|Lobet et al. - 2017 - Using a Structural Root System Model to Evaluate and Improve the Accuracy of Root Image Analysis Pip]]
- [[papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression|Kuroki et al. - 2025 - Binary Quadratic Quantization Beyond First-Order Quantization for Real-Valued Matrix Compression]]
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]
- [[papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test|Li et al. - 2025 - EAGLE-3 Scaling up Inference Acceleration of Large Language Models via Training-Time Test]]
- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]
- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty|Li et al. - 2025 - EAGLE Speculative Sampling Requires Rethinking Feature Uncertainty]]
- [[papers/Sun-et-al-2024-A-Simple-and-Effective-Pruning-Approach-for-Large-Language-Models|Sun et al. - 2024 - A Simple and Effective Pruning Approach for Large Language Models]]
- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting|Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting]]
- [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling|Schuster et al. - 2022 - Confident Adaptive Language Modeling]]
- [[papers/27323-KVCapsule-Efficient-Temp|27323_KVCapsule_Efficient_Temp]]
- [[papers/Samarin-et-al-2026-LK-Losses-Direct-Acceptance-Rate-Optimization-for-Speculative-Decoding|Samarin et al. - 2026 - LK Losses Direct Acceptance Rate Optimization for Speculative Decoding]]
- [[papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling|Xu et al. - 2025 - Speculative Knowledge Distillation Bridging the Teacher-Student Gap Through Interleaved Sampling]]
- [[papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding|Hu et al. - 2026 - Bridging Draft Policy Misalignment Group Tree Optimization for Speculative Decoding]]
- [[papers/Yu-et-al-2025-DAPO-An-Open-Source-LLM-Reinforcement-Learning-System-at-Scale|Yu et al. - 2025 - DAPO An Open-Source LLM Reinforcement Learning System at Scale]]
- [[papers/Meng-et-al-2026-Sparse-but-Critical-A-Token-Level-Analysis-of-Distributional-Shifts-in-RLVR-Fine-Tuning-of-LLMs|Meng et al. - 2026 - Sparse but Critical A Token-Level Analysis of Distributional Shifts in RLVR Fine-Tuning of LLMs]]
- [[papers/DeepSeek-AI-2025-DeepSeek-R1-Incentivizing-Reasoning-Capability-in-LLMs-via-Reinforcement-Learning|DeepSeek-AI 等 - 2025 - DeepSeek-R1 Incentivizing Reasoning Capability in LLMs via Reinforcement Learning]]
- [[papers/Wang-2026-WSVD-Weighted-Low-Rank-Approximation-for-Fast-and-Efficient-Execution-of-Low-Precision-Vision-Langu|Wang 等 - 2026 - WSVD Weighted Low-Rank Approximation for Fast and Efficient Execution of Low-Precision Vision-Langu]]
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]
- [[papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations|Liu et al. - 2025 - SpinQuant LLM quantization with learned rotations]]
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks|Tseng et al. - 2024 - QuIP# Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks]]
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]
- [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models]]
- [[papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models|Shao et al. - 2024 - OmniQuant Omnidirectionally Calibrated Quantization for Large Language Models]]
- [[papers/Lin-et-al-2024-AWQ-Activation-aware-Weight-Quantization-for-LLM-Compression-and-Acceleration|Lin et al. - 2024 - AWQ Activation-aware Weight Quantization for LLM Compression and Acceleration]]
- [[papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap|Xie et al. - 2024 - Advancing Multimodal Large Language Models with Quantization-Aware Scale Learning for Efficient Adap]]
- [[papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs|Guo 等 - 2025 - Fast Matrix Multiplications for Lookup Table-Quantized LLMs]]
- [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati|Blumenberg et al. - 2025 - Improving Block-Wise LLM Quantization by 4-bit Block-Wise Optimal Float (BOF4) Analysis and Variati]]
- [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa|Hu et al. - 2025 - MoEQuant Enhancing Quantization for Mixture-of-Experts Large Language Models via Expert-Balanced Sa]]
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization|Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization]]
- [[papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization|Lee et al. - 2025 - LittleBit Ultra Low-Bit Quantization via Latent Factorization]]
- [[papers/Son-et-al-2025-NSNQuant-A-Double-Normalization-Approach-for-Calibration-Free-Low-Bit-Vector-Quantization-of-KV-Cac|Son et al. - 2025 - NSNQuant A Double Normalization Approach for Calibration-Free Low-Bit Vector Quantization of KV Cac]]
- [[papers/Rafailov-et-al-2024-Direct-Preference-Optimization-Your-Language-Model-is-Secretly-a-Reward-Model|Rafailov et al. - 2024 - Direct Preference Optimization Your Language Model is Secretly a Reward Model]]
