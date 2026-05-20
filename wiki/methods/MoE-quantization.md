---
type: "method"
title: "MoE quantization"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
source_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
related_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
  - "papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
  - "papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits.md"
related_methods:
related_topics:
  - "MoE quantization"
  - "expert routing"
  - "calibration data selection"
  - "non-uniform quantization"
  - "hardware-aware quantization"
  - "lookup-table inference"
  - "visual reasoning"
  - "transformer architecture"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-877248da94"
---
# MoE quantization

## What It Is

This is a compiled method-family page for `MoE quantization`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: ### Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression - Purpose: Analyze or optimize assignments to centroids under the stated clustering objective and assumptions. - Operates on: data vectors; cluster...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: ### Yin et al. - 2024 - A Survey on Multimodal Large Language Models - Purpose: Align audio representations with language-model behavior for task-conditioned audio understanding. - Operates on: token embeddings; query/key/value projections;...
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: ### Mixture of Low-Rank Compensators - Purpose: Adds a small mixture of low-rank residual compensators around quantized MoE weights, so the quantized model can recover expert-specific error without restoring full-precision weights. - Operat...
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]: ### Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff. -...
- [[papers/DeepSeek-V4|DeepSeek_V4]]: ### DeepSeek_V4 - Purpose: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths. - Operates on: tr...
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models|Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models]]: ### Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeof...
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]: ### Xi et al. - 2023 - Training Transformers with 4-bit Integers - Purpose: To suppress outliers, we propose a Hadamard quantizer, which quantizes a transformed version of the activation matrix. SmoothQuant [57] migrates the quantization di...
- [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]: ### ERNIE_Technical_Report - Purpose: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths. - Oper...

## Used By Papers

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]]
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models]]
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators]]
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition]]
- [[papers/DeepSeek-V4]]
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models]]
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa]]
- [[papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits]]

## Implementation Hooks

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: - Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression: Test centroid update monotonicity, initialization sensitivity, and the claimed PCA relationship. - Quantization: Log pre/post-qu...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: - Yin et al. - 2024 - A Survey on Multimodal Large Language Models: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - Yin et al. - 2024 - A Survey on Mul...
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: - Mixture of Low-Rank Compensators: Ablate quantized weights alone, one shared low-rank adapter, and mixture-of-compensator variants. - Mixture of Low-Rank Compensators: Log per-expert reconstruction error and runtime/me...
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]: - Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition: Keep centroid construction inspectable; compare against uniform quantization as a control. - Li et al. - MoE-SVD Stru...
- [[papers/DeepSeek-V4|DeepSeek_V4]]: - DeepSeek_V4: Log preference-pair construction, labeler agreement, reward-model accuracy, policy reward, and held-out human evaluation separately. - Quantization: Log pre/post-quantization error by layer and separate we...
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models|Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models]]: - Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases...
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]: - Xi et al. - 2023 - Training Transformers with 4-bit Integers: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - Xi et al. - 2023 - Training Transformer...
- [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]: - ERNIE_Technical_Report: Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance. - Quantization: Log pre/post-quantization error by layer and separate weight, act...

## Failure Modes

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: - Preference-learning results depend on labeler consistency, comparison design, and whether the learned reward transfers beyond the sampled trajectories or responses. - Reward-model optimization can create reward hacking...
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: - Low-rank compensation is only useful if residual error is structured enough; compare against the same memory budget and expert-routing behavior. - MoE aggregate metrics can hide per-expert failures, so inspect expert-l...
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]: - Limitations were not explicit in extracted text; promote this page only after checking assumptions, evaluation scope, and failure cases. Open questions: - Do key figures, tables, or equations change the interpretation...
- [[papers/DeepSeek-V4|DeepSeek_V4]]: - Preference-learning results depend on labeler consistency, comparison design, and whether the learned reward transfers beyond the sampled trajectories or responses. - Reward-model optimization can create reward hacking...
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models|Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]: - Preference-learning results depend on labeler consistency, comparison design, and whether the learned reward transfers beyond the sampled trajectories or responses. - Reward-model optimization can create reward hacking...

## Evidence

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: The...
- [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al. - 2025 - MiLo Efficient Quantized MoE Inference with Mixture of Low-Rank Compensators]]: Evidence takeaways: - MiLo evidence should separate MoE quantization quality from compensator overhead; per-expert error and memory budget matter as much as aggregate scores. Claim candidates: - `claim-001`: For Mixtral-...
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/DeepSeek-V4|DeepSeek_V4]]: Evidence takeaways: - Router KL evidence should be tracked separately from accuracy because it measures token-expert assignment stability. Claim candidates: - `claim-001`: Compared against strong non-fused baselines, it...
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models|Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
