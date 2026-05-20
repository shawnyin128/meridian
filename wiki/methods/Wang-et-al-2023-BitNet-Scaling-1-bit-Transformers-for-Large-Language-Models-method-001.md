---
type: "method"
title: "Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models"
status: "draft"
sources:
  - "[[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models|Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models

- Source paper: [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers-for-Large-Language-Models|Wang et al. - 2023 - BitNet Scaling 1-bit Transformers for Large Language Models]]
- Summary: Schedules attention tiles, GPU memory movement, and low-precision compute so exact attention runs faster on the target hardware.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 2; p. 4; p. 11
