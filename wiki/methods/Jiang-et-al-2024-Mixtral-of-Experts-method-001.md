---
type: "method"
title: "Sparse mixture-of-experts decoder"
status: "draft"
sources:
  - "[[papers/Jiang-et-al-2024-Mixtral-of-Experts|Jiang et al. - 2024 - Mixtral of Experts]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Sparse mixture-of-experts decoder

- Source paper: [[papers/Jiang-et-al-2024-Mixtral-of-Experts|Jiang et al. - 2024 - Mixtral of Experts]]
- Summary: Uses sparse top-k expert routing in each feed-forward block so inference activates only a subset of experts per token while keeping a larger total parameter budget.
- Inputs: token hidden states, router logits, expert FFN weights, top-k routing rule
- Outputs: expert-weighted FFN output, sparse activated parameter path
- Assumptions: router load and expert specialization preserve quality without dense FFN cost, serving stack can handle expert dispatch efficiently
- Provenance: p. 1; p. 2; p. 3; p. 4
