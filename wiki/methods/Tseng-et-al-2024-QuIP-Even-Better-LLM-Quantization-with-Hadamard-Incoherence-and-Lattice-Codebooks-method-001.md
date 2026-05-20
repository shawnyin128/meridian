---
type: "method"
title: "Block-wise error minimization with learnable quantization parameters"
status: "draft"
sources:
  - "[[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks|Tseng et al. - 2024 - QuIP# Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Block-wise error minimization with learnable quantization parameters

- Source paper: [[papers/Tseng-et-al-2024-QuIP-Even-Better-LLM-Quantization-with-Hadamard-Incoherence-and-Lattice-Codebooks|Tseng et al. - 2024 - QuIP# Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks]]
- Summary: Freezes full-precision weights but learns a small set of clipping and equivalent-transform parameters by minimizing block output error across weight-only and weight-activation settings.
- Inputs: full-precision transformer block, calibration samples, learnable clipping/scaling/shifting parameters
- Outputs: calibrated quantization parameters, quantized block with reduced reconstruction error
- Assumptions: block-wise reconstruction is a useful proxy for final LLM quality, a restrained parameter set can approach QAT quality without full fine-tuning cost
- Provenance: p. 2; p. 3; p. 7; p. 11
