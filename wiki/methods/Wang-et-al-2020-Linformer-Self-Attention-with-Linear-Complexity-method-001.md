---
type: "method"
title: "Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity"
status: "draft"
sources:
  - "[[papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity|Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity.md"
related_papers:
  - "papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-444c73e0fa"
---
# Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity

- Source paper: [[papers/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity|Wang et al. - 2020 - Linformer Self-Attention with Linear Complexity]]
- Summary: arXiv:2006.04768v3 [cs.LG] 14 Jun 2020 In this work, we introduce a novel approach for tackling the self-attention bottleneck in Transformers. Our approach is inspired by the key observation that self-attention is low rank. Empowered by this observation, we introduce a novel mechanism that reduces self-attention to an O(n) operation in both space- and time-complexity: we decompose the original scaled dot-product attention into multiple smaller attentions through linear projections, such that the combination of these operations forms a low-rank factorization of the original attention.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, inference is memory-bound enough that compression translates into speed or capacity gains
- Provenance: p. 3; p. 4; p. 1
