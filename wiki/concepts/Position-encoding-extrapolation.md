---
type: "concept"
title: "Position encoding extrapolation"
status: "active"
created: "2026-05-26"
updated: "2026-05-26"
aliases:
  - "positional extrapolation"
  - "context length extrapolation"
  - "relative position extrapolation"
sources:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations.md"
source_papers:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations.md"
related_methods:
  - "RoPE scaling"
  - "relative-position encoding"
  - "long-context inference"
related_topics:
  - "RoPE scaling"
  - "relative position representation"
  - "long-context inference"
related_claims:
related_evidence:
prerequisite_for:
  - "RoPE scaling"
  - "relative-position encoding"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-20260526-position-encoding-extrapolation"
---
# Position encoding extrapolation

## What It Is

`Position encoding extrapolation` is the problem of extending or adapting positional representations so a sequence model can operate at lengths beyond the regime used during training or checkpoint creation.

## Why It Matters

- Long-context claims can pass narrow retrieval or passkey tests while still degrading short-context quality, attention locality, or ordinary language modeling behavior.

## Where It Appears

- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens]]
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding]]
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation]]
- [[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations]]

## Used By Methods

- [[methods/RoPE-scaling|RoPE scaling]]
- [[methods/relative-position-encoding|relative-position encoding]]
- [[methods/long-context-inference|long-context inference]]

## Implementation Implications

- Keep the position-scaling recipe, interpolation range, and target context length explicit in config.
- Evaluate short-context regression and long-context success separately because they can move in opposite directions.

## Common Failure Modes

- A model passes synthetic retrieval tasks but loses ordinary short-context quality after scaling.
- Position index, cache offset, or packed-sequence handling silently applies the wrong positional phase.

## Minimal Checks / Probes

- Sweep context length and report both short-context perplexity or accuracy and long-context retrieval/passkey scores.
- Unit test position ids, cache offsets, and attention-mask alignment before attributing failures to the scaling method.

## Evidence / Provenance

- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|LongRoPE]] gives a concrete context-window extension setting with short-context regression checks.
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|RoFormer]] and relative-position papers provide the positional mechanism context for these extensions.

## Related Concepts

- [[concepts/KV-cache-memory-bandwidth|KV-cache memory bandwidth]]
- [[concepts/Attention-sink|Attention sink]]

## Open Questions

- Which long-context benchmark best exposes failures missed by passkey-style tasks?
- Which scaling choices are model-family-specific rather than generally portable?

## Retrieval Hooks

- Use for RoPE, ALiBi, relative-position encoding, context extension, and long-context regression debugging.
