---
type: "method"
title: "Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache"
status: "draft"
sources:
  - "[[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache|Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
related_papers:
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-4f1fc779c8"
---
# Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache

- Source paper: [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache|Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 2; p. 1; p. 4
