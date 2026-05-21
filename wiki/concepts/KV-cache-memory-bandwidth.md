---
type: "concept"
title: "KV-cache memory bandwidth"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "KV cache bandwidth"
  - "key value cache bandwidth"
  - "cache memory bandwidth"
sources:
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
source_papers:
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
related_methods:
  - "KV-cache compression"
  - "long-context attention"
  - "sparse attention"
related_topics:
  - "long-context attention"
  - "systems ML"
related_claims:
related_evidence:
prerequisite_for:
  - "KV-cache compression"
  - "long-context attention"
  - "sparse attention"
supports:
contradicts:
confidence: "low"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-63532093d3"
---
# KV-cache memory bandwidth

## What It Is

`KV-cache memory bandwidth` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Long-context decoding is often limited by moving cached keys/values rather than arithmetic, so an accuracy-preserving cache policy can matter more than a smaller attention formula.

## Where It Appears

- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints]]

## Used By Methods

- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/long-context-attention|long-context attention]]
- [[methods/sparse-attention|sparse attention]]

## Implementation Implications

- Track cache bytes read per generated token and separate prefill from decode.
- Tie retention/compression policies to the attention kernel layout.

## Common Failure Modes

- A method reduces theoretical tokens but does not reduce actual memory traffic.
- Cache layout changes break batching or paged-attention assumptions.

## Minimal Checks / Probes

- Measure decode latency and memory bandwidth counters across context lengths.
- Run an oracle-retention comparison to separate policy quality from systems overhead.

## Evidence / Provenance

- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]: gqa training generalized multi query transformer models from multi head checkpoints gqa gqa multi query multi head grouped query attention checkpoint conversion grouped query attention transformer architecture kv cache memory attention head sharing grouped que...

## Related Concepts

- [[concepts/Attention-sink|Attention sink]]
- [[concepts/Retention-policy|Retention policy]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for KV-cache compression, sparse decoding, long-context inference, and decode-memory bottleneck debugging.
