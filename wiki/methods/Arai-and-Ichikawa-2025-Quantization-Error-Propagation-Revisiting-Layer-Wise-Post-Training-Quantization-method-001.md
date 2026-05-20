---
type: "method"
title: "Quantization Error Propagation"
status: "draft"
sources:
  - "[[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Quantization Error Propagation

- Source paper: [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]
- Summary: Revisits layer-wise PTQ by explicitly propagating previous-layer quantization error into the next layer's optimization target, reducing accumulated error across the network.
- Inputs: layer-wise PTQ activations, quantized previous-layer outputs, propagation strength
- Outputs: error-aware layer-wise quantization objective, compensated quantized weights
- Assumptions: propagating upstream error improves downstream reconstruction, propagation strength must be tuned to avoid overfitting or instability
- Provenance: p. 1; p. 2; p. 4; p. 5
