---
type: "method"
title: "Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs"
status: "draft"
sources:
  - "[[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs

- Source paper: [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs|Wang et al. - 2025 - BitNet v2 Native 4-bit Activations with Hadamard Transformation for 1-bit LLMs]]
- Summary: To tackle outliers in attention and feed-forward network activations, we pro- pose H-BitLinear, a module applying an online Hadamard transformation prior to activation quantization. We introduce BitNet v2, a novel framework enabling native 4-bit activation quantization for 1-bit LLMs. H-BitLinear employs a Hadamard transformation before activation quantization to first reduce the number of outlier channels.
- Inputs: calibration or runtime activations, model weights, KV-cache tensors
- Outputs: low-bit quantized model representation, rotation-transformed equivalent model, latency or memory-efficiency measurements
- Assumptions: inference is memory-bound enough that compression translates into speed or capacity gains
- Provenance: p. 2; p. 1; p. 6
