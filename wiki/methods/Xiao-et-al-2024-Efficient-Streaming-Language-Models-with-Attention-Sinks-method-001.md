---
type: "method"
title: "Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks"
status: "draft"
sources:
  - "[[papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks|Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
related_papers:
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-7f3192be98"
consolidation_target: "methods/IO-aware-attention"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks

- Source paper: [[papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks|Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 3; p. 1; p. 2
