---
type: "concept"
title: "Attention sink"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "attention sinks"
  - "sink tokens"
  - "sink attention"
sources:
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
source_papers:
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks.md"
related_methods:
  - "KV-cache compression"
  - "long-context attention"
  - "sparse attention"
related_topics:
  - "long-context attention"
related_claims:
related_evidence:
prerequisite_for:
  - "KV-cache compression"
  - "long-context attention"
  - "sparse attention"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-391661041e"
---
# Attention sink

## What It Is

`Attention sink` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Some tokens receive persistent attention and can stabilize long-context generation or cache eviction behavior, so naive token dropping can remove disproportionately important context.

## Where It Appears

- [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling]]
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free]]
- [[papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks]]

## Used By Methods

- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/long-context-attention|long-context attention]]
- [[methods/sparse-attention|sparse attention]]

## Implementation Implications

- Keep sink-token handling explicit in cache eviction and sparse-attention policies.
- Separate sink preservation from recency heuristics in ablations.

## Common Failure Modes

- A cache policy overfits to recency and discards globally stabilizing tokens.
- Attention visualization averages hide head-specific sink behavior.

## Minimal Checks / Probes

- Compare recency-only, sink-only, and hybrid retention policies.
- Inspect attention mass to sink candidates across layers and heads.

## Evidence / Provenance

- [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling|Cai et al. - 2025 - PyramidKV Dynamic KV Cache Compression based on Pyramidal Information Funneling]]: cai et al 2025 pyramidkv dynamic kv cache compression based on pyramidal information funneling pyramidkv cai et al 2025 pyramidkv dynamic kv cache compression based on pyramidal information funneling long context inference kv cache compression transformer arch...
- [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free|Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free]]: qiu et al 2025 gated attention for large language models non linearity sparsity and attention sink free attention sink qiu et al 2025 gated attention for large language models non linearity sparsity and attention sink free expert routing io aware attention lon...
- [[papers/Xiao-et-al-2024-Efficient-Streaming-Language-Models-with-Attention-Sinks|Xiao et al. - 2024 - Efficient Streaming Language Models with Attention Sinks]]: xiao et al 2024 efficient streaming language models with attention sinks xiao et al 2024 efficient streaming language models with attention sinks low precision attention computer architecture performance evaluation parameter efficient adaptation context extrap...

## Related Concepts

- [[concepts/KV-cache-memory-bandwidth|KV-cache memory bandwidth]]
- [[concepts/Retention-policy|Retention policy]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for long-context cache retention, sparse attention, and token eviction sanity checks.
