---
type: "method"
title: "Fast learnable affine transformation for flat distributions"
status: "draft"
sources:
  - "[[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization|Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
related_papers:
  - "papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-07afb24776"
---
# Fast learnable affine transformation for flat distributions

- Source paper: [[papers/Sun-et-al-2025-FlatQuant-Flatness-Matters-for-LLM-Quantization|Sun et al. - 2025 - FlatQuant Flatness Matters for LLM Quantization]]
- Summary: Learns affine transformations that flatten weight and activation distributions before quantization, using decomposed transforms to balance quantization error reduction against online overhead.
- Inputs: weights, activations, learnable affine transforms, calibration data
- Outputs: flatter transformed tensors, quantized model, speed/accuracy trade-off by transform size
- Assumptions: flatter distributions reduce error under equally spaced quantization points, decomposed affine transforms keep online cost acceptable
- Provenance: p. 1; p. 2; p. 3; p. 4
