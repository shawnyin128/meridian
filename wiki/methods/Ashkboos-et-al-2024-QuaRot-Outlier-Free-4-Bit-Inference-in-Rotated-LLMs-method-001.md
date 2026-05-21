---
type: "method"
title: "Randomized Hadamard rotation for end-to-end INT4 inference"
status: "draft"
sources:
  - "[[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
related_papers:
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-99a4d253dc"
consolidation_target: "methods/equivalent-transform-PTQ"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Randomized Hadamard rotation for end-to-end INT4 inference

- Source paper: [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]
- Summary: Applies computationally invariant randomized Hadamard rotations to residual streams, FFN activations, attention values, and KV cache so outlier features disappear without changing the full-precision model output.
- Inputs: LLM weights, hidden states, attention value/cache tensors, randomized Hadamard matrices
- Outputs: rotated equivalent model, 4-bit weights/activations/KV cache, INT4 matmul path
- Assumptions: Hadamard rotations can be fused into weights where possible, remaining online transforms are cheap enough relative to quantized matmuls and cache savings
- Provenance: p. 1; p. 2; p. 3; p. 4
