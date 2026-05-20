---
type: "claim"
title: "During training, we update each cluster centroid µ by an exponentially moving average of all the keys and queries assigned to it: µ ←λµ + (1 −λ) 2 X i:µ(Qi)=µ Qi + (1 −λ) 2 X j:µ(Kj)=µ Kj, where λ is a decay parameter which we usually set to 0.999."
status: "draft"
sources:
  - "[[papers/Roy-et-al-2020-Efficient-Content-Based-Sparse-Attention-with-Routing-Transformers|Roy et al. - 2020 - Efficient Content-Based Sparse Attention with Routing Transformers]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "claim-005"
---
# During training, we update each cluster centroid µ by an exponentially moving average of all the keys and queries assigned to it: µ ←λµ + (1 −λ) 2 X i:µ(Qi)=µ Qi + (1 −λ) 2 X j:µ(Kj)=µ Kj, where λ is a decay parameter which we usually set to 0.999.

- Source paper: [[papers/Roy-et-al-2020-Efficient-Content-Based-Sparse-Attention-with-Routing-Transformers|Roy et al. - 2020 - Efficient Content-Based Sparse Attention with Routing Transformers]]
- Claim: During training, we update each cluster centroid µ by an exponentially moving average of all the keys and queries assigned to it: µ ←λµ + (1 −λ) 2 X i:µ(Qi)=µ Qi + (1 −λ) 2 X j:µ(Kj)=µ Kj, where λ is a decay parameter which we usually set to 0.999.
- Claim type: source_claim
- Evidence IDs: evidence-p0005
- Provenance: p. 5
