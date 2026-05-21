---
type: "method"
title: "Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models"
status: "draft"
sources:
  - "[[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
related_papers:
  - "papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-1d7e48595f"
consolidation_target: "methods/hardware-aware-quantization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models

- Source paper: [[papers/Xu-et-al-2025-RSAVQ-Riemannian-Sensitivity-Aware-Vector-Quantization-for-Large-Language-Models|Xu et al. - 2025 - RSAVQ Riemannian Sensitivity-Aware Vector Quantization for Large Language Models]]
- Summary: To address these limitations, we propose Riemannian Sensitivity-Aware Vector Quantization (RSAVQ), a novel VQ framework that leverages information geometry to model the parameter space (i.e., the weights) of LLMs as a Riemannian manifold with non-uniform curvature—where the local geometry is described by Fisher Information Matrix (FIM) [2, 27]. CRVQ[49] achieves 1-bit quantization by iteratively selecting critical channels for residual processing, and QuIP# [44] uses Hadamard rotations to preprocess weights before uniform codebook quantization. In this paper, we propose RSAVQ, a novel VQ framework to enhance extremely low-bit quantization for LLMs.
- Inputs: data vectors, cluster count, centroid initialization
- Outputs: cluster assignments, centroids, objective value
- Assumptions: the clustering objective and initialization assumptions match the claimed theory or algorithm
- Provenance: p. 3; p. 5; p. 4
