---
type: "method"
title: "Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding"
status: "draft"
sources:
  - "[[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
related_papers:
  - "papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-b5ca8fe0f4"
consolidation_target: "methods/relative-position-encoding"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding

- Source paper: [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]
- Summary: The query and key values are then used to compute the attention weights, while the output is computed as the weighted sum over the value 2 RoFormer representation. [2020] followed these settings by only encoding the relative position information into the attention weights. Then, we propose a novel method named Rotary Position Embedding(RoPE) to effectively leverage the positional information.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, attention logits or values augmented with relative position information, rotation-transformed equivalent model
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, relative distance information improves sequence modeling without breaking attention computation, the transformation preserves the full-precision computation before quantization
- Provenance: p. 1; p. 5; p. 6
