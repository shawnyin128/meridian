---
type: "method"
title: "Learned step size with offset quantization"
status: "draft"
sources:
  - "[[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Learned step size with offset quantization

- Source paper: [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]
- Summary: Extends learned step-size quantization by learning offsets and improving initialization, so low-bit activation/weight quantizers fit asymmetric tensor distributions better.
- Inputs: weights or activations, learnable scale, learnable offset, initialization statistics
- Outputs: quantized tensor, learned scale/offset parameters
- Assumptions: asymmetric offsets reduce low-bit error for activation distributions, initialization strongly affects quantizer training stability
- Provenance: p. 1; p. 2; p. 3; p. 4
