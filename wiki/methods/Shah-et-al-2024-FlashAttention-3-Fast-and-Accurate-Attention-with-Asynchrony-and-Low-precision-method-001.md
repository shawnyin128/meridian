---
type: "method"
title: "Shah et al. - 2024 - FlashAttention-3 Fast and Accurate Attention with Asynchrony and Low-precision"
status: "draft"
sources:
  - "[[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision|Shah et al. - 2024 - FlashAttention-3 Fast and Accurate Attention with Asynchrony and Low-precision]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
related_papers:
  - "papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-188c22d4c7"
consolidation_target: "methods/IO-aware-attention"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Shah et al. - 2024 - FlashAttention-3 Fast and Accurate Attention with Asynchrony and Low-precision

- Source paper: [[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision|Shah et al. - 2024 - FlashAttention-3 Fast and Accurate Attention with Asynchrony and Low-precision]]
- Summary: Schedules attention tiles, GPU memory movement, and low-precision compute so exact attention runs faster on the target hardware.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 2; p. 7; p. 1
