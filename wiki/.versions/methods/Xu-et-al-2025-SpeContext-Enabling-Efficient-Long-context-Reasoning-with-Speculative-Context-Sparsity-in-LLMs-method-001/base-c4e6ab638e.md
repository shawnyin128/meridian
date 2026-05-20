---
type: "method"
title: "Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs"
status: "draft"
sources:
  - "[[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs|Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs

- Source paper: [[papers/Xu-et-al-2025-SpeContext-Enabling-Efficient-Long-context-Reasoning-with-Speculative-Context-Sparsity-in-LLMs|Xu et al. - 2025 - SpeContext Enabling Efficient Long-context Reasoning with Speculative Context Sparsity in LLMs]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 1; p. 5; p. 2
