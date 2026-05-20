---
type: "method"
title: "Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks"
status: "draft"
sources:
  - "[[papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks|Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks

- Source paper: [[papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks|Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 3; p. 1; p. 2
