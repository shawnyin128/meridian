---
type: "topic"
title: "self-speculative decoding"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
source_papers:
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
related_papers:
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
related_methods:
  - "transformer architecture"
  - "post-training quantization"
  - "calibration-aware PTQ"
  - "hardware-aware quantization"
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
  - "speculative decoding"
  - "self-speculative decoding"
  - "KV-cache compression"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-af6b3b7630"
---
# self-speculative decoding

## Scope

This topic page compiles canonical paper pages around `self-speculative decoding`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/3549-Train-Freeze-or-Exit-Dyna]]
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache]]
- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting]]
- [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling]]
- [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding]]

## Method Families

- [[methods/transformer-architecture|transformer architecture]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]
- [[methods/speculative-decoding|speculative decoding]]
- [[methods/self-speculative-decoding|self-speculative decoding]]
- [[methods/KV-cache-compression|KV-cache compression]]

## Claims

- [[papers/3549-Train-Freeze-or-Exit-Dyna|3549_Train_Freeze_or_Exit_Dyna]]: 3549_Train_Freeze_or_Exit_Dyna is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks whether the retained cache still preserves long-...
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache|Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache]]: Tiwari et al. - 2025 - QuantSpec Self-Speculative Decoding with Hierarchical Quantized KV Cache is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attention run...
- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting|Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting]]: Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting: Uses early-exit branches inside the same model to draft tokens, then verifies them with deeper layers, reducing latency without re...
- [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling|Schuster et al. - 2022 - Confident Adaptive Language Modeling]]: Schuster et al. - 2022 - Confident Adaptive Language Modeling is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks whether the retai...
- [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding|Elhoushi et al. - 2024 - LayerSkip Enabling Early Exit Inference and Self-Speculative Decoding]]: Elhoushi et al. - 2024 - LayerSkip Enabling Early Exit Inference and Self-Speculative Decoding: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluat...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `self-speculative decoding`.
