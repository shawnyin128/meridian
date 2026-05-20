---
type: "method"
title: "Refined rotation with weighted loss for massive activations"
status: "draft"
sources:
  - "[[papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation|Xiang and Zhang - 2024 - DFRot Achieving Outlier-Free and Massive Activation-Free for Rotated LLMs with Refined Rotation]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Refined rotation with weighted loss for massive activations

- Source paper: [[papers/Xiang-and-Zhang-2024-DFRot-Achieving-Outlier-Free-and-Massive-Activation-Free-for-Rotated-LLMs-with-Refined-Rotation|Xiang and Zhang - 2024 - DFRot Achieving Outlier-Free and Massive Activation-Free for Rotated LLMs with Refined Rotation]]
- Summary: Refines rotated-LLM quantization by treating massive activations as a long-tail optimization problem and weighting the rotation/quantization loss toward hard tokens.
- Inputs: rotated LLM, token activations, weighted quantization loss, activation quantizer parameters
- Outputs: massive-activation-aware rotation, W4A4 quantized model
- Assumptions: massive activation tokens require different weighting than ordinary tokens, the refined loss improves activation quantization without high-precision token escape paths
- Provenance: p. 1; p. 2; p. 7; p. 8
