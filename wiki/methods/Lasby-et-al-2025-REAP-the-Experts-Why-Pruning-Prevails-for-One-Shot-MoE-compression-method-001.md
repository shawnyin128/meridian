---
type: "method"
title: "Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression"
status: "draft"
sources:
  - "[[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
related_papers:
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-3e0e5f3b3f"
consolidation_target: "methods/MoE-quantization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression

- Source paper: [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression|Lasby et al. - 2025 - REAP the Experts Why Pruning Prevails for One-Shot MoE compression]]
- Summary: Leveraging this insight, we propose Router- weighted Expert Activation Pruning (REAP), a novel pruning criterion that considers both router gate-values and expert activation norms. HC-SMoE clusters experts based on the euclidean similarity of their representative vectors — the average activation of each expert measured on every token in a calibration dataset — using hierarchical agglomerative clustering. These other approaches are orthogonal to expert pruning and merging; however, note that 2 expert merging necessitates re-quantization for block quantization formats that share common scaling coefficients across a group of weights.
- Inputs: data vectors, cluster count, centroid initialization
- Outputs: cluster assignments, centroids, objective value
- Assumptions: the clustering objective and initialization assumptions match the claimed theory or algorithm
- Provenance: p. 2; p. 3; p. 4
