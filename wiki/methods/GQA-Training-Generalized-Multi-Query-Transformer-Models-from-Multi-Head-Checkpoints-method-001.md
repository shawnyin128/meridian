---
type: "method"
title: "Grouped-query attention checkpoint conversion"
status: "draft"
sources:
  - "[[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_papers:
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-0f69a96cd4"
---
# Grouped-query attention checkpoint conversion

- Source paper: [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]
- Summary: Converts multi-head attention checkpoints into grouped-query attention by sharing key/value heads across groups, trading a small quality adaptation step for lower decode-time memory bandwidth.
- Inputs: multi-head attention checkpoint, number of query groups, uptraining data/budget
- Outputs: grouped-query attention checkpoint, reduced KV-cache memory/bandwidth
- Assumptions: key/value head sharing preserves enough attention capacity after uptraining, decode speed or memory is bottlenecked by KV-cache bandwidth
- Provenance: p. 1; p. 2; p. 3; p. 4
