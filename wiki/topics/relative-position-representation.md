---
type: "topic"
title: "relative position representation"
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
  - "long-context inference"
  - "transformer architecture"
  - "relative position encoding"
  - "KV-cache compression"
  - "audio-language modeling"
  - "multimodal instruction tuning"
  - "survey synthesis"
  - "post-training quantization"
  - "MoE quantization"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-27d414d9f7"
---
# relative position representation

## Scope

This topic page compiles canonical paper pages around `relative position representation`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context]]
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation]]
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding]]
- [[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations]]
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models]]

## Method Families

- [[methods/long-context-inference|long-context inference]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/relative-position-encoding|relative position encoding]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/audio-language-modeling|audio-language modeling]]
- [[methods/multimodal-instruction-tuning|multimodal instruction tuning]]
- [[methods/survey-synthesis|survey synthesis]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/MoE-quantization|MoE quantization]]

## Claims

- [[papers/Dai-et-al-2019-Transformer-XL-Attentive-Language-Models-Beyond-a-Fixed-Length-Context|Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context]]: Dai et al. - 2019 - Transformer-XL Attentive Language Models Beyond a Fixed-Length Context: We introduce the notion of recurrence into our arXiv:1901.02860v3 [cs.LG] 2 Jun 2019 deep self-attention network. Hence, as an a...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-b...
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]: Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks...
- [[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations|Shaw et al. - 2018 - Self-Attention with Relative Position Representations]]: Shaw et al. - 2018 - Self-Attention with Relative Position Representations: In this work we present an alternative approach, extend- ing the self-attention mechanism to efﬁciently consider representations of the relative...
- [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]: Yin et al. - 2024 - A Survey on Multimodal Large Language Models connects audio representations to language-model behavior. Read it as an audio encoder/alignment/decoder contract, where task tags and audio preprocessing...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `relative position representation`.
