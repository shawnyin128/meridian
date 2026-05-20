---
type: "method"
title: "RoPE scaling"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
source_papers:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
related_papers:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
related_methods:
related_topics:
  - "long-context inference"
  - "RoPE scaling"
  - "LLM agents"
  - "parameter-efficient adaptation"
  - "context extrapolation"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-b149978e9f"
---
# RoPE scaling

## What It Is

This is a compiled method-family page for `RoPE scaling`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens]]: ### LongRoPE context-window extension - Purpose: Searches and progressively extends RoPE scaling factors so an LLM can move from its original context window to very long contexts while preserving short-context quality. - Operates on: RoPE d...

## Used By Papers

- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens]]

## Implementation Hooks

- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens]]: - LongRoPE context-window extension: Log short-context perplexity and long-context passkey/retrieval scores for every scaling stage. - LongRoPE context-window extension: Ablate search budget, progressive extension stages...

## Failure Modes

- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens]]: - Long-context extension can preserve passkey-style tasks while still harming ordinary short-context behavior; both must be checked. - RoPE scaling recipes may be model-family and context-length specific. Open questions:...

## Evidence

- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens]]: Evidence takeaways: - LongRoPE evidence should pair long-context success with short-context regression checks under each RoPE scaling stage. Claim candidates: - `claim-001`: We show that LongRoPE is highly effective in m...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
