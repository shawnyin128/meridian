---
type: "method"
title: "Feature-wise Linear Modulation"
status: "draft"
sources:
  - "[[papers/Perez-et-al-2017-FiLM-Visual-Reasoning-with-a-General-Conditioning-Layer|Perez et al. - 2017 - FiLM Visual Reasoning with a General Conditioning Layer]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Feature-wise Linear Modulation

- Source paper: [[papers/Perez-et-al-2017-FiLM-Visual-Reasoning-with-a-General-Conditioning-Layer|Perez et al. - 2017 - FiLM Visual Reasoning with a General Conditioning Layer]]
- Summary: Predicts per-feature affine modulation parameters from a conditioning input, then applies them inside a visual reasoning network so language can steer visual feature processing.
- Inputs: visual feature maps, question or conditioning embedding, per-channel gamma and beta
- Outputs: modulated visual features, conditioned reasoning behavior
- Assumptions: feature-wise affine modulation is expressive enough to inject question semantics, conditioning quality determines which visual features are emphasized or suppressed
- Provenance: p. 1; p. 2; p. 3; p. 4
