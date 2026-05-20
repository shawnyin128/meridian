---
type: "claim"
title: "(4) Note that due to the self-attention mechanism of the Transformer, computing the input hidden state hi t for layer i depends on di−1 1:t−1, i.e., the output hidden states of the previous layer for all the tokens that have been generated so far.2 Therefore, if the model has early exited at some layer j < i −1 for a token s < t, then di−1 s is not available."
status: "draft"
sources:
  - "[[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling|Schuster et al. - 2022 - Confident Adaptive Language Modeling]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "claim-003"
---
# (4) Note that due to the self-attention mechanism of the Transformer, computing the input hidden state hi t for layer i depends on di−1 1:t−1, i.e., the output hidden states of the previous layer for all the tokens that have been generated so far.2 Therefore, if the model has early exited at some layer j < i −1 for a token s < t, then di−1 s is not available.

- Source paper: [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling|Schuster et al. - 2022 - Confident Adaptive Language Modeling]]
- Claim: (4) Note that due to the self-attention mechanism of the Transformer, computing the input hidden state hi t for layer i depends on di−1 1:t−1, i.e., the output hidden states of the previous layer for all the tokens that have been generated so far.2 Therefore, if the model has early exited at some layer j < i −1 for a token s < t, then di−1 s is not available.
- Claim type: source_claim
- Evidence IDs: evidence-p0004
- Provenance: p. 4
