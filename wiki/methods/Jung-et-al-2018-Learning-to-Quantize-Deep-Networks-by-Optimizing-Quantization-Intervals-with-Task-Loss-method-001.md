---
type: "method"
title: "Quantization Interval Learning"
status: "draft"
sources:
  - "[[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss|Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Quantization Interval Learning

- Source paper: [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss|Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss]]
- Summary: Learns quantization interval parameters jointly with task loss so clipping/pruning and bit assignment are optimized for network accuracy instead of fixed min-max ranges.
- Inputs: full-precision weights or activations, learnable interval parameters, task loss
- Outputs: quantized weights/activations, learned quantization intervals, low-bit network
- Assumptions: task-loss optimization can choose better quantization intervals than static calibration, progressive finetuning is needed for very low-bit settings
- Provenance: p. 1; p. 6; p. 8
