---
type: "method"
title: "Curve skeleton from incomplete point clouds"
status: "draft"
sources:
  - "[[papers/Tagliasacchi-et-al-Curve-Skeleton-Extraction-from-Incomplete-Point-Cloud|Tagliasacchi et al. - Curve Skeleton Extraction from Incomplete Point Cloud]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Curve skeleton from incomplete point clouds

- Source paper: [[papers/Tagliasacchi-et-al-Curve-Skeleton-Extraction-from-Incomplete-Point-Cloud|Tagliasacchi et al. - Curve Skeleton Extraction from Incomplete Point Cloud]]
- Summary: Extracts a curve skeleton from incomplete point-cloud geometry by recovering a medial structure that preserves topology despite missing surface observations.
- Inputs: incomplete point cloud, local geometry neighborhoods, skeleton regularization parameters
- Outputs: curve skeleton graph, topology-preserving shape abstraction
- Assumptions: local point geometry is sufficient to infer the underlying medial structure, regularization can bridge missing observations without inventing wrong topology
- Provenance: p. 6
