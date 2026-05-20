---
type: "method"
title: "LUT-based system implementation"
status: "draft"
sources:
  - "[[papers/Dong-et-al-2024-Self-Boosting-Large-Language-Models-with-Synthetic-Preference-Data|Dong et al. - 2024 - Self-Boosting Large Language Models with Synthetic Preference Data]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# LUT-based system implementation

- Source paper: [[papers/Dong-et-al-2024-Self-Boosting-Large-Language-Models-with-Synthetic-Preference-Data|Dong et al. - 2024 - Self-Boosting Large Language Models with Synthetic Preference Data]]
- Summary: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inference.
- Inputs: cluster assignments, centroids, quantized activations, target GPU or CPU kernel path
- Outputs: LUT-backed low-bit inference path, latency and memory measurements
- Assumptions: target hardware can exploit lookup-table execution efficiently, reported speedups depend on kernel/simulator/CPU setup
- Provenance: p. 3; p. 13; p. 19
