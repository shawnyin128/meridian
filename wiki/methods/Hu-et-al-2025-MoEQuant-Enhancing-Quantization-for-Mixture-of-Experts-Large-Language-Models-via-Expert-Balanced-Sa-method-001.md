---
type: "method"
title: "Expert-Balanced Self-Sampling"
status: "draft"
sources:
  - "[[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa|Hu et al. - 2025 - MoEQuant Enhancing Quantization for Mixture-of-Experts Large Language Models via Expert-Balanced Sa]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Expert-Balanced Self-Sampling

- Source paper: [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa|Hu et al. - 2025 - MoEQuant Enhancing Quantization for Mixture-of-Experts Large Language Models via Expert-Balanced Sa]]
- Summary: Builds calibration data from the model itself while balancing expert usage, so MoE quantization does not overfit calibration samples to a small subset of experts.
- Inputs: MoE model vocabulary/log-probabilities, expert usage statistics, calibration budget
- Outputs: expert-balanced calibration set
- Assumptions: self-sampled sequences can cover expert routing behavior without external data, balanced expert activation improves calibration representativeness
- Provenance: p. 1; p. 2; p. 4; p. 6
