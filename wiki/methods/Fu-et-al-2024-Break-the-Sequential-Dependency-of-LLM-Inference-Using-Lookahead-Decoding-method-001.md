---
type: "method"
title: "Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding"
status: "draft"
sources:
  - "[[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding

- Source paper: [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]
- Summary: Schedules attention tiles, GPU memory movement, and low-precision compute so exact attention runs faster on the target hardware.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 1; p. 2; p. 3
