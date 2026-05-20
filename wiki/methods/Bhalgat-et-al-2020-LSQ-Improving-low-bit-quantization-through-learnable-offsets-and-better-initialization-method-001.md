---
type: "method"
title: "Learned step size with offset quantization"
status: "draft"
sources:
  - "[[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
related_papers:
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-a4a7897714"
---
# Learned step size with offset quantization

- Source paper: [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]
- Summary: Extends learned step-size quantization by learning offsets and improving initialization, so low-bit activation/weight quantizers fit asymmetric tensor distributions better.
- Inputs: weights or activations, learnable scale, learnable offset, initialization statistics
- Outputs: quantized tensor, learned scale/offset parameters
- Assumptions: asymmetric offsets reduce low-bit error for activation distributions, initialization strongly affects quantizer training stability
- Provenance: p. 1; p. 2; p. 3; p. 4
