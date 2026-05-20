---
type: "method"
title: "Learned rotation matrices for quantization"
status: "draft"
sources:
  - "[[papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations|Liu et al. - 2025 - SpinQuant LLM quantization with learned rotations]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
related_papers:
  - "papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-d942016470"
---
# Learned rotation matrices for quantization

- Source paper: [[papers/Liu-et-al-2025-SpinQuant-LLM-quantization-with-learned-rotations|Liu et al. - 2025 - SpinQuant LLM quantization with learned rotations]]
- Summary: Learns orthonormal rotation matrices that keep the full-precision Transformer numerically equivalent while reducing activation, weight, and KV-cache outliers for low-bit quantization.
- Inputs: Transformer weights, calibration data, rotation matrices R1/R2/R3/R4
- Outputs: rotation-augmented equivalent model, learned rotations, improved W/A/KV quantized accuracy
- Assumptions: rotation matrices can be merged or placed without changing the full-precision network, calibration loss is a useful proxy for downstream quantized accuracy
- Provenance: p. 1; p. 2; p. 4; p. 5
