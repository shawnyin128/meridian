---
type: "method"
title: "Li et al. - 2024 - SnapKV LLM Knows What You are Looking for Before Generation"
status: "draft"
sources:
  - "[[papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation|Li et al. - 2024 - SnapKV LLM Knows What You are Looking for Before Generation]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
related_papers:
  - "papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-7a313768a1"
---
# Li et al. - 2024 - SnapKV LLM Knows What You are Looking for Before Generation

- Source paper: [[papers/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation|Li et al. - 2024 - SnapKV LLM Knows What You are Looking for Before Generation]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 2; p. 5; p. 6
