---
type: "method"
title: "Ge et al. - 2024 - Model Tells You What to Discard Adaptive KV Cache Compression for LLMs"
status: "draft"
sources:
  - "[[papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs|Ge et al. - 2024 - Model Tells You What to Discard Adaptive KV Cache Compression for LLMs]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
related_papers:
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-c8035b1d1c"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Ge et al. - 2024 - Model Tells You What to Discard Adaptive KV Cache Compression for LLMs

- Source paper: [[papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs|Ge et al. - 2024 - Model Tells You What to Discard Adaptive KV Cache Compression for LLMs]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 1; p. 2; p. 5
