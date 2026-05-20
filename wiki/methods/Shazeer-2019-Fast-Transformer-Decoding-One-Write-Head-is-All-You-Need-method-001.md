---
type: "method"
title: "Shazeer - 2019 - Fast Transformer Decoding One Write-Head is All You Need"
status: "draft"
sources:
  - "[[papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need|Shazeer - 2019 - Fast Transformer Decoding One Write-Head is All You Need]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Shazeer - 2019 - Fast Transformer Decoding One Write-Head is All You Need

- Source paper: [[papers/Shazeer-2019-Fast-Transformer-Decoding-One-Write-Head-is-All-You-Need|Shazeer - 2019 - Fast Transformer Decoding One Write-Head is All You Need]]
- Summary: We propose a variant called multi-query attention, where the keys and values are shared across all of the diﬀerent attention "heads", greatly reducing the size of these tensors and hence the memory bandwidth requirements of incremental decoding. 2.1 Dot-Product Attention The following code describes a common formulation, where the weights are computed as the softmax of the dot-products of the query with the diﬀerent keys. 1 3 Multi-Query Attention We introduce multi-query Attention as a variation of multi-head attention as described in [Vaswani et al., 2017].
- Inputs: query heads, shared key/value heads, attention checkpoint
- Outputs: attention checkpoint with shared key/value heads
- Assumptions: shared key/value heads preserve enough attention capacity after adaptation
- Provenance: p. 1; p. 5; p. 2
