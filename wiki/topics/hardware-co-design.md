---
type: "topic"
title: "hardware co-design"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
source_papers:
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
related_papers:
  - "papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference.md"
related_methods:
  - "attention kernel optimization"
  - "IO-aware attention"
  - "hardware-aware attention"
  - "audio-language modeling"
  - "multimodal instruction tuning"
  - "speculative decoding"
  - "KV-cache compression"
  - "transformer architecture"
  - "survey synthesis"
  - "post-training quantization"
  - "non-uniform weight quantization"
  - "hardware-aware quantization"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-6828be6069"
---
# hardware co-design

## Scope

This topic page compiles canonical paper pages around `hardware co-design`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]]
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference]]

## Method Families

- [[methods/attention-kernel-optimization|attention kernel optimization]]
- [[methods/IO-aware-attention|IO-aware attention]]
- [[methods/hardware-aware-attention|hardware-aware attention]]
- [[methods/audio-language-modeling|audio-language modeling]]
- [[methods/multimodal-instruction-tuning|multimodal instruction tuning]]
- [[methods/speculative-decoding|speculative decoding]]
- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/transformer-architecture|transformer architecture]]
- [[methods/survey-synthesis|survey synthesis]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]

## Claims

- [[papers/Yuan-et-al-2025-Native-Sparse-Attention-Hardware-Aligned-and-Natively-Trainable-Sparse-Attention|Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention]]: Yuan et al. - 2025 - Native Sparse Attention Hardware-Aligned and Natively Trainable Sparse Attention is an attention-kernel systems method: it changes how Q/K/V tiles move through GPU memory and compute units so attenti...
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques]]: Hu et al. - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the qual...
- [[papers/Mo-2025-LUT-Tensor-Core-A-Software-Hardware-Co-Design-for-LUT-Based-Low-Bit-LLM-Inference|Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference]]: Mo 等 - 2025 - LUT Tensor Core A Software-Hardware Co-Design for LUT-Based Low-Bit LLM Inference: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inf...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `hardware co-design`.
