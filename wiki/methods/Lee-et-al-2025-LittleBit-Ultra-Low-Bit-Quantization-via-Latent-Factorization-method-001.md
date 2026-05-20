---
type: "method"
title: "Block-wise error minimization with learnable quantization parameters"
status: "draft"
sources:
  - "[[papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization|Lee et al. - 2025 - LittleBit Ultra Low-Bit Quantization via Latent Factorization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization.md"
related_papers:
  - "papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e7be793095"
---
# Block-wise error minimization with learnable quantization parameters

- Source paper: [[papers/Lee-et-al-2025-LittleBit-Ultra-Low-Bit-Quantization-via-Latent-Factorization|Lee et al. - 2025 - LittleBit Ultra Low-Bit Quantization via Latent Factorization]]
- Summary: Freezes full-precision weights but learns a small set of clipping and equivalent-transform parameters by minimizing block output error across weight-only and weight-activation settings.
- Inputs: full-precision transformer block, calibration samples, learnable clipping/scaling/shifting parameters
- Outputs: calibrated quantization parameters, quantized block with reduced reconstruction error
- Assumptions: block-wise reconstruction is a useful proxy for final LLM quality, a restrained parameter set can approach QAT quality without full fine-tuning cost
- Provenance: p. 2; p. 7; p. 13
