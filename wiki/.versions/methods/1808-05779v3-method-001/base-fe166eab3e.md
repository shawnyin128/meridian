---
type: "method"
title: "Quantization Interval Learning"
status: "draft"
sources:
  - "[[papers/1808-05779v3|1808.05779v3]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Quantization Interval Learning

- Source paper: [[papers/1808-05779v3|1808.05779v3]]
- Summary: Learns quantization interval parameters jointly with task loss so clipping/pruning and bit assignment are optimized for network accuracy instead of fixed min-max ranges.
- Inputs: full-precision weights or activations, learnable interval parameters, task loss
- Outputs: quantized weights/activations, learned quantization intervals, low-bit network
- Assumptions: task-loss optimization can choose better quantization intervals than static calibration, progressive finetuning is needed for very low-bit settings
- Provenance: p. 1; p. 6; p. 8
