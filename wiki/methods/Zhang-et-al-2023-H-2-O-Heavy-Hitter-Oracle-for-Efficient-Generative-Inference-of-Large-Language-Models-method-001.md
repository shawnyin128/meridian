---
type: "method"
title: "Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models"
status: "draft"
sources:
  - "[[papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models|Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
related_papers:
  - "papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-a079023f1c"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models

- Source paper: [[papers/Zhang-et-al-2023-H-2-O-Heavy-Hitter-Oracle-for-Efficient-Generative-Inference-of-Large-Language-Models|Zhang et al. - 2023 - H$_2$O Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 1; p. 2; p. 3
