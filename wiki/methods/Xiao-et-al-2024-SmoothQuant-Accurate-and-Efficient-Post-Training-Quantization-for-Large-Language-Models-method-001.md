---
type: "method"
title: "Activation-to-weight smoothing"
status: "draft"
sources:
  - "[[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
related_papers:
  - "papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-c10cad7269"
consolidation_target: "methods/post-training-quantization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Activation-to-weight smoothing

- Source paper: [[papers/Xiao-et-al-2024-SmoothQuant-Accurate-and-Efficient-Post-Training-Quantization-for-Large-Language-Models|Xiao et al. - 2024 - SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models]]
- Summary: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weight quantization become hardware-friendly.
- Inputs: calibration activations, linear weights, smoothing scale s, migration strength alpha
- Outputs: smoothed activations, adjusted weights, W8A8 quantization flow
- Assumptions: weights can absorb extra scale better than activations can tolerate outliers, the equivalent transformation can be fused offline or into adjacent operations
- Provenance: p. 1; p. 2; p. 3; p. 4
