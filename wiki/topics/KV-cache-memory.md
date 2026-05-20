---
type: "topic"
title: "KV-cache memory"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
source_papers:
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_papers:
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_methods:
  - "long-context inference"
  - "KV-cache compression"
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
revision_id: "knowledge-44a15d5c00"
---
# KV-cache memory

## Scope

This topic page compiles canonical paper pages around `KV-cache memory`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/27323-KVCapsule-Efficient-Temp]]
- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints]]

## Method Families

- [[methods/long-context-inference|long-context inference]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/grouped-query-attention|grouped-query attention]]
- [[methods/attention-checkpoint-conversion|attention checkpoint conversion]]
- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]

## Claims

- [[papers/27323-KVCapsule-Efficient-Temp|27323_KVCapsule_Efficient_Temp]]: 27323_KVCapsule_Efficient_Temp is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks whether the retained cache still preserves long-...
- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]: GQA converts a multi-head attention checkpoint into grouped-query attention by sharing key/value heads across query groups, then uptrains the converted checkpoint to recover quality. Its reusable contract is MHA checkpoi...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `KV-cache memory`.
