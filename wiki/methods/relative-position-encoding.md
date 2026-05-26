---
type: "method"
title: "relative position encoding"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
  - "papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
source_papers:
  - "papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
  - "papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
related_papers:
  - "papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
  - "papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations.md"
  - "papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models.md"
related_methods:
related_topics:
  - "benchmark evaluation"
  - "long-context inference"
  - "transformer architecture"
  - "relative position representation"
  - "context extrapolation"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-a566c641c8"
---
# relative position encoding

## What It Is

This is a compiled method-family page for `relative position encoding`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context|Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context]]: ### Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context - Purpose: We introduce the notion of recurrence into our arXiv:1901.02860v3 [cs.LG] 2 Jun 2019 deep self-attention network. Hence, as an additio...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: ### Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tr...
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]: ### Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff. - Operates on: token...
- [[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations|Shaw et al. - 2018 - Self-Attention with Relative Position Representations]]: ### Shaw et al. - 2018 - Self-Attention with Relative Position Representations - Purpose: In this work we present an alternative approach, extend- ing the self-attention mechanism to efﬁciently consider representations of the relative posi-...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: ### Yin et al. - 2024 - A Survey on Multimodal Large Language Models - Purpose: Align audio representations with language-model behavior for task-conditioned audio understanding. - Operates on: token embeddings; query/key/value projections;...

## Used By Papers

- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context]]
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation]]
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding]]
- [[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations]]
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models]]

## Implementation Hooks

- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context|Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context]]: - Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context: Sweep context length and separate retrieval/position failures from model-capacity failures. - Long context: Sweep sequence len...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: - Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation...
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]: - Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - Long context: Sweep...
- [[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations|Shaw et al. - 2018 - Self-Attention with Relative Position Representations]]: - Shaw et al. - 2018 - Self-Attention with Relative Position Representations: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - Equation-bearing sections...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: - Yin et al. - 2024 - A Survey on Multimodal Large Language Models: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - Yin et al. - 2024 - A Survey on Mul...

## Failure Modes

- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context|Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations|Shaw et al. - 2018 - Self-Attention with Relative Position Representations]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: - Preference-learning results depend on labeler consistency, comparison design, and whether the learned reward transfers beyond the sampled trajectories or responses. - Reward-model optimization can create reward hacking...

## Evidence

- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context|Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: 4.5...
- [[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations|Shaw et al. - 2018 - Self-Attention with Relative Position Representations]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: The...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Position-encoding-extrapolation|Position encoding extrapolation]]
