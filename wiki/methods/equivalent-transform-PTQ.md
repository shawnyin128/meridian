---
type: "method"
title: "equivalent-transform PTQ"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
source_papers:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
related_papers:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models.md"
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
related_methods:
related_topics:
  - "post-training quantization"
  - "low-bit quantization"
  - "activation outliers"
  - "equivalent transformation"
  - "hardware-aware quantization"
  - "low-rank adaptation"
  - "vision-language quantization"
  - "layer reconstruction"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-ea2719ac33"
---
# equivalent-transform PTQ

## What It Is

This is a compiled method-family page for `equivalent-transform PTQ`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: ### Activation-to-weight smoothing - Purpose: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weight quantization become hardware-fr...
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]: ### Activation-to-weight smoothing - Purpose: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weight quantization become hardware-fr...
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]: ### Randomized Hadamard rotation for end-to-end INT4 inference - Purpose: Applies computationally invariant randomized Hadamard rotations to residual streams, FFN activations, attention values, and KV cache so outlier features disappear wit...
- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models|Ma et al. - 2024 - AffineQuant Affine Transformation Quantization for Large Language Models]]: ### Equivalent affine transformation quantization - Purpose: Optimizes invertible affine transformations around linear layers so transformed weights and activations are easier to quantize while preserving the original matrix product before...
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models]]: ### Activation-to-weight smoothing - Purpose: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weight quantization become hardware-fr...
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization|Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization]]: ### Fast learnable affine transformation for flat distributions - Purpose: Learns affine transformations that flatten weight and activation distributions before quantization, using decomposed transforms to balance quantization error reducti...

## Used By Papers

- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]]
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference]]
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs]]
- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models]]
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models]]
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization]]

## Implementation Hooks

- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: - Activation-to-weight smoothing: Implement scale search for alpha and verify Y = XW is preserved before quantization. - Activation-to-weight smoothing: Track O1/O2/O3 separately because dynamic/static activation quantiz...
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]: - Activation-to-weight smoothing: Implement scale search for alpha and verify Y = XW is preserved before quantization. - Activation-to-weight smoothing: Track O1/O2/O3 separately because dynamic/static activation quantiz...
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]: - Randomized Hadamard rotation for end-to-end INT4 inference: Keep residual, FFN, attention, and KV-cache rotations as separate implementation checkpoints. - Randomized Hadamard rotation for end-to-end INT4 inference: Un...
- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models|Ma et al. - 2024 - AffineQuant Affine Transformation Quantization for Large Language Models]]: - Equivalent affine transformation quantization: Test strict diagonal dominance or condition-number safeguards for transform invertibility. - Equivalent affine transformation quantization: Verify transformed full-precisi...
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models]]: - Activation-to-weight smoothing: Implement scale search for alpha and verify Y = XW is preserved before quantization. - Activation-to-weight smoothing: Track O1/O2/O3 separately because dynamic/static activation quantiz...
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization|Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization]]: - Fast learnable affine transformation for flat distributions: Track transform decomposition size as a speed/accuracy hyperparameter. - Fast learnable affine transformation for flat distributions: Separate offline-merged...

## Failure Modes

- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]: - Rotation or transform equivalence must be verified before quantization; otherwise accuracy changes may come from the transform implementation rather than quantization quality. - Rotation results should be compared unde...
- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models|Ma et al. - 2024 - AffineQuant Affine Transformation Quantization for Large Language Models]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization|Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...

## Evidence

- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: Evidence takeaways: - SmoothQuant evidence should be read as W8A8 deployment evidence: accuracy preservation and latency/memory claims depend on O1/O2/O3 quantization settings. Claim candidates: - `claim-001`: The evalua...
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]: Evidence takeaways: - QuaRot evidence combines perplexity/zero-shot accuracy with systems claims for INT4 weights, activations, and KV cache; keep these evidence types separate. Claim candidates: - `claim-001`: We provid...
- [[papers/Ma-et-al-2024-AffineQuant-Affine-Transformation-Quantization-for-Large-Language-Models|Ma et al. - 2024 - AffineQuant Affine Transformation Quantization for Large Language Models]]: Evidence takeaways: - AffineQuant evidence should tie gains to the larger affine transform search space, especially very low-bit W4A4 settings against OmniQuant/AWQ-style baselines. Claim candidates: - `claim-001`: On ze...
- [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models]]: Evidence takeaways: - SmoothQuant evidence should be read as W8A8 deployment evidence: accuracy preservation and latency/memory claims depend on O1/O2/O3 quantization settings. Claim candidates: - `claim-001`: SmoothQuan...
- [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization|Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization]]: Evidence takeaways: - FlatQuant evidence should keep flatness/quantization-error reductions separate from transform-overhead and speed claims. Claim candidates: - `claim-001`: With kernel fusion, FLATQUANT can achieve up...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Rotation-transform-invariance|Rotation transform invariance]]
