---
type: "topic"
title: "attention head sharing"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
source_papers:
  - "papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_papers:
  - "papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_methods:
  - "transformer architecture"
  - "grouped-query attention"
  - "attention checkpoint conversion"
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-eac40bbf4e"
---
# attention head sharing

## Scope

This topic page compiles canonical paper pages around `attention head sharing`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need]]
- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints]]

## Method Families

- [[methods/transformer-architecture|transformer architecture]]
- [[methods/grouped-query-attention|grouped-query attention]]
- [[methods/attention-checkpoint-conversion|attention checkpoint conversion]]
- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]

## Claims

- [[papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need|Shazeer - 2019 - Fast Transformer Decoding One Write-Head is All You Need]]: Shazeer - 2019 - Fast Transformer Decoding One Write-Head is All You Need: We propose a variant called multi-query attention, where the keys and values are shared across all of the diﬀerent attention "heads", greatly red...
- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]: GQA converts a multi-head attention checkpoint into grouped-query attention by sharing key/value heads across query groups, then uptrains the converted checkpoint to recover quality. Its reusable contract is MHA checkpoi...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `attention head sharing`.
