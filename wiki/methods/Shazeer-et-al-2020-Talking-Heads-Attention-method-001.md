---
type: "method"
title: "Shazeer et al. - 2020 - Talking-Heads Attention"
status: "draft"
sources:
  - "[[papers/Shazeer-et-al-2020-Talking-Heads-Attention|Shazeer et al. - 2020 - Talking-Heads Attention]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
related_papers:
  - "papers/Shazeer-et-al-2020-Talking-Heads-Attention.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-0e9cf0bee3"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Shazeer et al. - 2020 - Talking-Heads Attention

- Source paper: [[papers/Shazeer-et-al-2020-Talking-Heads-Attention|Shazeer et al. - 2020 - Talking-Heads Attention]]
- Summary: In this paper, we introduce a new variant, "talking-heads attention", that addresses this problem by inserting a learned linear projection across the attention-heads dimension of the attention-logits tensor. def DotProductAttention ( X[n, d], # n query -vectors with dimensionality d M[m, d]): # m memory -vectors with dimensionality d L[n, m] = einsum(X[n, d], M[m, d]) # Attention logits W[n, m] = softmax(L[n, m], reduced_dim =m) # Attention weights Y[n, d] = einsum(W[n, m], M[m, d]) return Y[n, d] 3.2 Dot-Product Attention With Projections [Vaswani et al., 2017] propose a dimensionality-reduction to reduce the computational complexity of the attention algorithm. We insert two additional learned linear projections, Pl and Pw, which transform the attention-logits and the attention- weights respectively, moving information across attention heads.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, the transformation preserves the full-precision computation before quantization
- Provenance: p. 2; p. 3; p. 5
