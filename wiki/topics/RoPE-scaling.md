---
type: "topic"
title: "RoPE scaling"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
source_papers:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
related_papers:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
related_methods:
  - "long-context inference"
  - "RoPE scaling"
  - "transformer architecture"
  - "KV-cache compression"
  - "relative position encoding"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-7bdeda366d"
---
# RoPE scaling

## Scope

This topic page compiles canonical paper pages around `RoPE scaling`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens]]
- [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models]]
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation]]
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding]]
- [[papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele]]

## Method Families

- [[methods/long-context-inference|long-context inference]]
- [[methods/RoPE-scaling|RoPE scaling]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/relative-position-encoding|relative position encoding]]

## Claims

- [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens]]: Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens: Searches and progressively extends RoPE scaling factors so an LLM can move from its original context window to very long contexts while...
- [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models|Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models]]: Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models: (1) Next, the attention weights are calculated as softmax(qT mkn p |D| ), (2) where qm, kn are considered as column vectors so that q...
- [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]: Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-b...
- [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]: Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks...
- [[papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele|Wu et al. - 2025 - PolarQuant Leveraging Polar Transformation for Efficient Key Cache Quantization and Decoding Accele]]: Wu et al. - 2025 - PolarQuant Leveraging Polar Transformation for Efficient Key Cache Quantization and Decoding Accele is a KV-cache compression method: it decides which cached key/value entries to retain under a memory...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `RoPE scaling`.
## Key Concepts

- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[concepts/Activation-outliers|Activation outliers]]
- [[concepts/Per-channel-scaling|Per-channel scaling]]
