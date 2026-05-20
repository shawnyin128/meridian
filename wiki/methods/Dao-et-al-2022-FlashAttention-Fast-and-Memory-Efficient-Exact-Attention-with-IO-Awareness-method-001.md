---
type: "method"
title: "Dao et al. - 2022 - FlashAttention Fast and Memory-Efficient Exact Attention with IO-Awareness"
status: "draft"
sources:
  - "[[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness|Dao et al. - 2022 - FlashAttention Fast and Memory-Efficient Exact Attention with IO-Awareness]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Dao et al. - 2022 - FlashAttention Fast and Memory-Efficient Exact Attention with IO-Awareness

- Source paper: [[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness|Dao et al. - 2022 - FlashAttention Fast and Memory-Efficient Exact Attention with IO-Awareness]]
- Summary: Schedules attention tiles, GPU memory movement, and low-precision compute so exact attention runs faster on the target hardware.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 1; p. 2; p. 6
