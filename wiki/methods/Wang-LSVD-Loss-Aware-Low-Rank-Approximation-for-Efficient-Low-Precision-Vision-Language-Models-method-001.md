---
type: "method"
title: "Activation-to-weight smoothing"
status: "draft"
sources:
  - "[[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
related_papers:
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-cc39ceb6c2"
---
# Activation-to-weight smoothing

- Source paper: [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]
- Summary: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weight quantization become hardware-friendly.
- Inputs: calibration activations, linear weights, smoothing scale s, migration strength alpha
- Outputs: smoothed activations, adjusted weights, W8A8 quantization flow
- Assumptions: weights can absorb extra scale better than activations can tolerate outliers, the equivalent transformation can be fused offline or into adjacent operations
- Provenance: p. 3; p. 13
