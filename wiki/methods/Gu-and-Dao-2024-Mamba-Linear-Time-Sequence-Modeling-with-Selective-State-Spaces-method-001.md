---
type: "method"
title: "Gu and Dao - 2024 - Mamba Linear-Time Sequence Modeling with Selective State Spaces"
status: "draft"
sources:
  - "[[papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces|Gu and Dao - 2024 - Mamba Linear-Time Sequence Modeling with Selective State Spaces]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
related_papers:
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-0d447af9d5"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Gu and Dao - 2024 - Mamba Linear-Time Sequence Modeling with Selective State Spaces

- Source paper: [[papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces|Gu and Dao - 2024 - Mamba Linear-Time Sequence Modeling with Selective State Spaces]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 5; p. 1; p. 3
