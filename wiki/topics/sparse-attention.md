---
type: "topic"
title: "sparse attention"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
source_papers:
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
related_papers:
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness.md"
related_methods:
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
  - "long-context inference"
  - "transformer architecture"
  - "speculative decoding"
  - "KV-cache compression"
  - "post-training quantization"
  - "hardware-aware quantization"
  - "preference-based reinforcement learning"
  - "reward modeling"
  - "MoE quantization"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-216bacdbd4"
---
# sparse attention

## Scope

This topic page compiles canonical paper pages around `sparse attention`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention]]
- [[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers]]
- [[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification]]
- [[papers/DeepSeek-V4]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness]]

## Method Families

- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]
- [[methods/long-context-inference|long-context inference]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/speculative-decoding|speculative decoding]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/preference-based-reinforcement-learning|preference-based reinforcement learning]]
- [[methods/reward-modeling|reward modeling]]
- [[methods/MoE-quantization|MoE quantization]]

## Claims

- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]: Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attenti...
- [[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers|Child et al. - 2019 - Generating Long Sequences with Sparse Transformers]]: Child et al. - 2019 - Generating Long Sequences with Sparse Transformers: In this paper we introduce sparse factorizations of the attention matrix which reduce this to O(n√n). We used the same self-attention based archit...
- [[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification|Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification]]: Yang et al. - 2025 - LongSpec Long-Context Lossless Speculative Decoding with Efficient Drafting and Verification: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache b...
- [[papers/DeepSeek-V4|DeepSeek_V4]]: DeepSeek_V4 turns preference data into a policy-optimization objective. The reusable contract is preference pairs and a reference policy -> loss/reward signal -> aligned policy behavior, with KL/reference-model assumptio...
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models|Li et al. - 2025 - MBQ Modality-Balanced Quantization for Large Vision-Language Models]]: Li et al. - 2025 - MBQ Modality-Balanced Quantization for Large Vision-Language Models is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then...
- [[papers/Dao-et-al-2022-FlashAttention-Fast-and-Memory-Efficient-Exact-Attention-with-IO-Awareness|Dao et al. - 2022 - FlashAttention Fast and Memory-Efficient Exact Attention with IO-Awareness]]: Dao et al. - 2022 - FlashAttention Fast and Memory-Efficient Exact Attention with IO-Awareness is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention runs...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `sparse attention`.
## Key Concepts

- [[concepts/Cache-retention-policy|Cache retention policy]]
