---
type: "method"
title: "grouped-query attention"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
source_papers:
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_papers:
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_methods:
related_topics:
  - "low-precision attention"
  - "grouped-query attention"
  - "transformer architecture"
  - "KV-cache memory"
  - "attention head sharing"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-b8baa74f12"
---
# grouped-query attention

## What It Is

This is a compiled method-family page for `grouped-query attention`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]: ### Grouped-query attention checkpoint conversion - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff. - Operates on: multi-head attention checkpoint; number...

## Used By Papers

- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints]]

## Implementation Hooks

- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]: - Grouped-query attention checkpoint conversion: Check tensor reshaping for Q heads versus grouped K/V heads before training. - Grouped-query attention checkpoint conversion: Compare MHA, MQA, and multiple GQA group coun...

## Failure Modes

- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]: - GQA conversion quality depends on group count and uptraining budget; MHA/MQA/GQA comparisons should hold adaptation data and compute fixed. - Memory-bandwidth gains only matter if decode is KV-cache/bandwidth bound at...

## Evidence

- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]: Evidence takeaways: - GQA evidence should compare MHA, MQA, and GQA under matched checkpoint/uptraining conditions while separating quality from memory-bandwidth gains. Claim candidates: - `claim-001`: We eval- 0 0.5 1 1...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/KV-cache-memory-bandwidth|KV-cache memory bandwidth]]
