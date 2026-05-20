---
type: "method"
title: "Activation-to-weight smoothing"
status: "draft"
sources:
  - "[[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
related_papers:
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-dabc0d0203"
---
# Activation-to-weight smoothing

- Source paper: [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]
- Summary: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weight quantization become hardware-friendly.
- Inputs: calibration activations, linear weights, smoothing scale s, migration strength alpha
- Outputs: smoothed activations, adjusted weights, W8A8 quantization flow
- Assumptions: weights can absorb extra scale better than activations can tolerate outliers, the equivalent transformation can be fused offline or into adjacent operations
- Provenance: p. 1; p. 2; p. 3; p. 4
