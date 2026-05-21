---
type: "method"
title: "Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free"
status: "draft"
sources:
  - "[[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free|Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
related_papers:
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-d604f8fcf2"
consolidation_target: "methods/long-context-inference"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free

- Source paper: [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free|Qiu et al. - 2025 - Gated Attention for Large Language Models Non-linearity, Sparsity, and Attention-Sink-Free]]
- Summary: The output is a weighted sum of the values: Attention(Q, K, V ) = softmax QKT √dk  V , (2) where QKT √ dk ∈Rn×n represents the scaled dot-product similarity matrix, and softmax(·) ensures the attention weights are no-negative and sum to 1 across each row. Right: Average attention map weights for each head. (4) 2.2 Augmenting Attention Layer with Gating Mechanisms The gating mechanism is formalized as: Y ′ = g(Y , X, Wθ, σ) = Y ⊙σ(XWθ), (5) where Y is the input to be modulated, X is another input used to compute the gating scores1, Wθ refers to the learnable parameters of gate, σ is an activation function (e.g., sigmoid), and Y ′ is the gated output.
- Inputs: long sequence tokens, positional encoding or attention state
- Outputs: extended-context model behavior or evaluation results
- Assumptions: quality must be checked at the target context lengths, not inferred from short-context behavior
- Provenance: p. 9; p. 1; p. 3
