---
type: "method"
title: "non-uniform weight quantization"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/1909-13144v2.md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs.md"
  - "papers/Wei-et-al-2025-T-MAC-CPU-Renaissance-via-Table-Lookup-for-Low-Bit-LLM-Deployment-on-Edge.md"
source_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/1909-13144v2.md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs.md"
  - "papers/Wei-et-al-2025-T-MAC-CPU-Renaissance-via-Table-Lookup-for-Low-Bit-LLM-Deployment-on-Edge.md"
related_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/1909-13144v2.md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
  - "papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
  - "papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs.md"
  - "papers/Wei-et-al-2025-T-MAC-CPU-Renaissance-via-Table-Lookup-for-Low-Bit-LLM-Deployment-on-Edge.md"
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
revision_id: "knowledge-eed156e527"
---
# non-uniform weight quantization

## What It Is

This is a compiled method-family page for `non-uniform weight quantization`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: ### Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression - Purpose: Analyze or optimize assignments to centroids under the stated clustering objective and assumptions. - Operates on: data vectors; cluster...
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees|Chee et al. - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: ### LUT-based system implementation - Purpose: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inference. - Operates on: cluster assignments; centroids; quantized activ...
- [[papers/1909-13144v2|1909.13144v2]]: ### 1909.13144v2 - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff. - Operates on: token embeddings; query/key/value projections; positional or attention bi...
- [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks]]: ### Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runt...
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]: ### Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models - Purpose: Analyze or optimize assignments to centroids under the stated clustering objective and assumptions. - Operates on: data vecto...
- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: ### Sensitivity-based non-uniform quantization - Purpose: Allocates non-uniform quantization centroids according to both weight distribution and sensitivity, so low-bit dense weights preserve model outputs better than uniform bins. - Operat...
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks|Tseng et al. - 2024 - QuIP# Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks]]: ### Block-wise error minimization with learnable quantization parameters - Purpose: Freezes full-precision weights but learns a small set of clipping and equivalent-transform parameters by minimizing block output error across weight-only an...
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]: ### LUT-based system implementation - Purpose: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inference. - Operates on: cluster assignments; centroids; quantized activ...

## Used By Papers

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]]
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]]
- [[papers/1909-13144v2]]
- [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks]]
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models]]
- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization]]
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks]]
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference]]
- [[papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs]]
- [[papers/Wei-et-al-2025-T-MAC-CPU-Renaissance-via-Table-Lookup-for-Low-Bit-LLM-Deployment-on-Edge]]

## Implementation Hooks

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: - Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression: Test centroid update monotonicity, initialization sensitivity, and the claimed PCA relationship. - Quantization: Log pre/post-qu...
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees|Chee et al. - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: - LUT-based system implementation: Separate algorithmic accuracy claims from GPU simulation and CPU kernel speed claims. - LUT-based system implementation: Record hardware target, bit width, group setting, and baseline k...
- [[papers/1909-13144v2|1909.13144v2]]: - 1909.13144v2: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - 1909.13144v2: Keep centroid construction inspectable; compare against uniform quantizat...
- [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks]]: - Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapol...
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]: - Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models: Test centroid update monotonicity, initialization sensitivity, and the claimed PCA relationship. - Quantization: Log...
- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: - Sensitivity-based non-uniform quantization: Implement weighted k-means/objective explicitly and compare against uniform quantization. - Sensitivity-based non-uniform quantization: Keep sensitivity estimation reproducib...
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks|Tseng et al. - 2024 - QuIP# Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks]]: - Block-wise error minimization with learnable quantization parameters: Keep learnable weight clipping and equivalent transformation as separate ablations. - Block-wise error minimization with learnable quantization para...
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]: - LUT-based system implementation: Separate algorithmic accuracy claims from GPU simulation and CPU kernel speed claims. - LUT-based system implementation: Record hardware target, bit width, group setting, and baseline k...

## Failure Modes

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees|Chee et al. - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/1909-13144v2|1909.13144v2]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]: - Clustering conclusions can depend on initialization, objective assumptions, and data distribution. - Theoretical equivalence claims should be separated from algorithmic performance claims. Open questions: - Do key figu...
- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks|Tseng et al. - 2024 - QuIP# Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]: - Some hardware evidence depends on simulation or specific CPU/kernel settings. Open questions: - Do key figures, tables, or equations change the interpretation of the text extraction?

## Evidence

- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees|Chee et al. - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/1909-13144v2|1909.13144v2]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]: Evidence takeaways: - Router KL evidence should be tracked separately from accuracy because it measures token-expert assignment stability. Claim candidates: - `claim-001`: 4, for the LLaMA-2 7B model, the inference speed...
- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: Evidence takeaways: - SqueezeLLM evidence should separate dense non-uniform quantization gains from sparse-retention gains and runtime/memory claims. Claim candidates: - `claim-001`: With 3-bit LLaMA-7B, sensitivity-base...
- [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks|Tseng et al. - 2024 - QuIP# Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks]]: Evidence takeaways: - OmniQuant evidence should be read as block-wise PTQ calibration evidence; compare weight-only and weight-activation settings without treating it as full QAT. Claim candidates: - `claim-001`: We repo...
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]: Evidence takeaways: - GPU speed evidence uses simulation; keep it distinct from CPU measurements and accuracy tables. Claim candidates: - `claim-001`: As shown in Figure 15, LUT-based Tensor Core outperforms traditional...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Lookup-table-inference|Lookup-table inference]]
