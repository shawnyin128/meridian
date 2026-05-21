---
type: "topic"
title: "parameter-efficient adaptation"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need.md"
  - "papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models.md"
  - "papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models.md"
  - "papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post.md"
  - "papers/Qi-et-al-2025-EvoLM-In-Search-of-Lost-Language-Model-Training-Dynamics.md"
  - "papers/3520-V-JEPA-Latent-Video-Predi.md"
  - "papers/Bodnar-et-al-2025-A-foundation-model-for-the-Earth-system.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Watson-et-al-2023-De-novo-design-of-protein-structure-and-function-with-RFdiffusion.md"
  - "papers/Lobet-et-al-2017-Using-a-Structural-Root-System-Model-to-Evaluate-and-Improve-the-Accuracy-of-Root-Image-Analysis-Pip.md"
  - "papers/Huang-et-al-2025-LLM-JEPA-Large-Language-Models-Meet-Joint-Embedding-Predictive-Architectures.md"
  - "papers/Chu-et-al-2024-Qwen2-Audio-Technical-Report.md"
  - "papers/Chu-et-al-2023-Qwen-Audio-Advancing-Universal-Audio-Understanding-via-Unified-Large-Scale-Audio-Language-Models.md"
  - "papers/Deshmukh-et-al-2024-Pengi-An-Audio-Language-Model-for-Audio-Tasks.md"
  - "papers/Yuan-et-al-2025-Self-Rewarding-Language-Models.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Meng-et-al-2026-Sparse-but-Critical-A-Token-Level-Analysis-of-Distributional-Shifts-in-RLVR-Fine-Tuning-of-LLMs.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization.md"
  - "papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization.md"
  - "papers/Rafailov-et-al-2024-Direct-Preference-Optimization-Your-Language-Model-is-Secretly-a-Reward-Model.md"
source_papers:
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need.md"
  - "papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models.md"
  - "papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models.md"
  - "papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post.md"
  - "papers/Qi-et-al-2025-EvoLM-In-Search-of-Lost-Language-Model-Training-Dynamics.md"
  - "papers/3520-V-JEPA-Latent-Video-Predi.md"
  - "papers/Bodnar-et-al-2025-A-foundation-model-for-the-Earth-system.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Watson-et-al-2023-De-novo-design-of-protein-structure-and-function-with-RFdiffusion.md"
  - "papers/Lobet-et-al-2017-Using-a-Structural-Root-System-Model-to-Evaluate-and-Improve-the-Accuracy-of-Root-Image-Analysis-Pip.md"
  - "papers/Huang-et-al-2025-LLM-JEPA-Large-Language-Models-Meet-Joint-Embedding-Predictive-Architectures.md"
  - "papers/Chu-et-al-2024-Qwen2-Audio-Technical-Report.md"
  - "papers/Chu-et-al-2023-Qwen-Audio-Advancing-Universal-Audio-Understanding-via-Unified-Large-Scale-Audio-Language-Models.md"
  - "papers/Deshmukh-et-al-2024-Pengi-An-Audio-Language-Model-for-Audio-Tasks.md"
  - "papers/Yuan-et-al-2025-Self-Rewarding-Language-Models.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Meng-et-al-2026-Sparse-but-Critical-A-Token-Level-Analysis-of-Distributional-Shifts-in-RLVR-Fine-Tuning-of-LLMs.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization.md"
  - "papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization.md"
  - "papers/Rafailov-et-al-2024-Direct-Preference-Optimization-Your-Language-Model-is-Secretly-a-Reward-Model.md"
related_papers:
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models.md"
  - "papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need.md"
  - "papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models.md"
  - "papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models.md"
  - "papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post.md"
  - "papers/Qi-et-al-2025-EvoLM-In-Search-of-Lost-Language-Model-Training-Dynamics.md"
  - "papers/3520-V-JEPA-Latent-Video-Predi.md"
  - "papers/Bodnar-et-al-2025-A-foundation-model-for-the-Earth-system.md"
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Watson-et-al-2023-De-novo-design-of-protein-structure-and-function-with-RFdiffusion.md"
  - "papers/Lobet-et-al-2017-Using-a-Structural-Root-System-Model-to-Evaluate-and-Improve-the-Accuracy-of-Root-Image-Analysis-Pip.md"
  - "papers/Huang-et-al-2025-LLM-JEPA-Large-Language-Models-Meet-Joint-Embedding-Predictive-Architectures.md"
  - "papers/Chu-et-al-2024-Qwen2-Audio-Technical-Report.md"
  - "papers/Chu-et-al-2023-Qwen-Audio-Advancing-Universal-Audio-Understanding-via-Unified-Large-Scale-Audio-Language-Models.md"
  - "papers/Deshmukh-et-al-2024-Pengi-An-Audio-Language-Model-for-Audio-Tasks.md"
  - "papers/Yuan-et-al-2025-Self-Rewarding-Language-Models.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/Meng-et-al-2026-Sparse-but-Critical-A-Token-Level-Analysis-of-Distributional-Shifts-in-RLVR-Fine-Tuning-of-LLMs.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models.md"
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization.md"
  - "papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization.md"
  - "papers/Rafailov-et-al-2024-Direct-Preference-Optimization-Your-Language-Model-is-Secretly-a-Reward-Model.md"
related_methods:
  - "transformer architecture"
  - "post-training quantization"
  - "calibration-aware PTQ"
  - "hardware-aware quantization"
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
  - "paper-specific research method"
  - "rotation-based quantization"
  - "preference-based reinforcement learning"
  - "reward modeling"
  - "video representation learning"
  - "joint embedding predictive learning"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-d958ee381d"
---
# parameter-efficient adaptation

## Scope

This topic page compiles canonical paper pages around `parameter-efficient adaptation`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]]
- [[papers/3549-Train-Freeze-or-Exit-Dyna]]
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models]]
- [[papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need]]
- [[papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models]]
- [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models]]
- [[papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence]]
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an]]
- [[papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post]]
- [[papers/Qi-et-al-2025-EvoLM-In-Search-of-Lost-Language-Model-Training-Dynamics]]
- [[papers/3520-V-JEPA-Latent-Video-Predi]]
- [[papers/Bodnar-et-al-2025-A-foundation-model-for-the-Earth-system]]
- [[papers/Shazeer-et-al-2020-Talking-Heads-Attention]]
- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens]]
- [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models]]
- [[papers/Watson-et-al-2023-De-novo-design-of-protein-structure-and-function-with-RFdiffusion]]
- [[papers/Lobet-et-al-2017-Using-a-Structural-Root-System-Model-to-Evaluate-and-Improve-the-Accuracy-of-Root-Image-Analysis-Pip]]
- [[papers/Huang-et-al-2025-LLM-JEPA-Large-Language-Models-Meet-Joint-Embedding-Predictive-Architectures]]
- [[papers/Chu-et-al-2024-Qwen2-Audio-Technical-Report]]
- [[papers/Chu-et-al-2023-Qwen-Audio-Advancing-Universal-Audio-Understanding-via-Unified-Large-Scale-Audio-Language-Models]]
- [[papers/Deshmukh-et-al-2024-Pengi-An-Audio-Language-Model-for-Audio-Tasks]]
- [[papers/Yuan-et-al-2025-Self-Rewarding-Language-Models]]
- [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads]]
- [[papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation]]
- [[papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks]]
- [[papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs]]
- [[papers/27323-KVCapsule-Efficient-Temp]]
- [[papers/Meng-et-al-2026-Sparse-but-Critical-A-Token-Level-Analysis-of-Distributional-Shifts-in-RLVR-Fine-Tuning-of-LLMs]]
- [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report]]
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model]]
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks]]
- [[papers/Shao-et-al-2024-OmniQuant-Omnidirectionally-Calibrated-Quantization-for-Large-Language-Models]]
- [[papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap]]
- [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati]]
- [[papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization]]
- [[papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization]]
- [[papers/Rafailov-et-al-2024-Direct-Preference-Optimization-Your-Language-Model-is-Secretly-a-Reward-Model]]

## Method Families

- [[methods/transformer-architecture|transformer architecture]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]
- [[methods/paper-specific-research-method|paper-specific research method]]
- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[methods/preference-based-reinforcement-learning|preference-based reinforcement learning]]
- [[methods/reward-modeling|reward modeling]]
- [[methods/video-representation-learning|video representation learning]]
- [[methods/joint-embedding-predictive-learning|joint embedding predictive learning]]

## Claims

- [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]: Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models: To address these challenges, we introduce a novel quantization-aware training framework called EfficientQAT. Con- versely...
- [[papers/3549-Train-Freeze-or-Exit-Dyna|3549_Train_Freeze_or_Exit_Dyna]]: 3549_Train_Freeze_or_Exit_Dyna is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks whether the retained cache still preserves long-...
- [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models|Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models]]: Chitsaz et al. - 2024 - Exploring Quantization for Efficient Pre-Training of Transformer Language Models is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so atte...
- [[papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need|Li et al. - 2025 - Uni-LoRA One Vector is All You Need]]: Li et al. - 2025 - Uni-LoRA One Vector is All You Need: To address the aforementioned limitations, we propose Uni-LoRA, a unified framework of LoRA that treats the LoRA parameter space as a high-dimensional vector space...
- [[papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models|Rahmati et al. - 2025 - C-LoRA Contextual Low-Rank Adaptation for Uncertainty Estimation in Large Language Models]]: Rahmati et al. - 2025 - C-LoRA Contextual Low-Rank Adaptation for Uncertainty Estimation in Large Language Models: To address this limitation, we propose Contextual Low-Rank Adaptation (C-LoRA) as a novel uncertainty-awa...
- [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models|Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models]]: Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models: For instance, DoRA [63] decomposes LoRA weights into magnitude and direction components to improve learning capacity...
- [[papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence|Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence]]: Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence: Other work has also proposed low rank manipulations to the activations instead of the weights [Wu et al., 2024]. a) We measure the changes...
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an|Bouda et al. - 2016 - Box-Counting Dimension Revisited Presenting an Efficient Method of Minimizing Quantization Error an]]: Bouda et al. - 2016 - Box-Counting Dimension Revisited Presenting an Efficient Method of Minimizing Quantization Error an is a KV-cache compression method: it decides which cached key/value entries to retain under a memo...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `parameter-efficient adaptation`.
## Key Concepts

- [[concepts/KL-regularization|KL regularization]]
