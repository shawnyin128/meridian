---
type: "method"
title: "Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models"
status: "draft"
sources:
  - "[[papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models|Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models

- Source paper: [[papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models|Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 1; p. 2; p. 3
