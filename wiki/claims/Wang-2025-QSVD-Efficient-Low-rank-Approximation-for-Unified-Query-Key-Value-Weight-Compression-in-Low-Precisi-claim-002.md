---
type: "claim"
title: "During inference, the intermediate products Cqkv between the input and the down-projection matrix W d qkv are buffered to compute the KV vectors, yielding a total buffer size of ηqsvd = rL (Figure 2 (f)), and the KV vectors can be easily recomputed as: K = CqkvW u k , V = CqkvW u v (5) In comparison, our method achieves reduced weight size and computational cost when 4rE < 3E2 and 4LrE < 3LE2, which holds when r < 0.75E."
status: "draft"
sources:
  - "[[papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi|Wang 等 - 2025 - QSVD Efficient Low-rank Approximation for Unified Query-Key-Value Weight Compression in Low-Precisi]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "claim-002"
---
# During inference, the intermediate products Cqkv between the input and the down-projection matrix W d qkv are buffered to compute the KV vectors, yielding a total buffer size of ηqsvd = rL (Figure 2 (f)), and the KV vectors can be easily recomputed as: K = CqkvW u k , V = CqkvW u v (5) In comparison, our method achieves reduced weight size and computational cost when 4rE < 3E2 and 4LrE < 3LE2, which holds when r < 0.75E.

- Source paper: [[papers/Wang-2025-QSVD-Efficient-Low-rank-Approximation-for-Unified-Query-Key-Value-Weight-Compression-in-Low-Precisi|Wang 等 - 2025 - QSVD Efficient Low-rank Approximation for Unified Query-Key-Value Weight Compression in Low-Precisi]]
- Claim: During inference, the intermediate products Cqkv between the input and the down-projection matrix W d qkv are buffered to compute the KV vectors, yielding a total buffer size of ηqsvd = rL (Figure 2 (f)), and the KV vectors can be easily recomputed as: K = CqkvW u k , V = CqkvW u v (5) In comparison, our method achieves reduced weight size and computational cost when 4rE < 3E2 and 4LrE < 3LE2, which holds when r < 0.75E.
- Claim type: source_claim
- Evidence IDs: evidence-p0005
- Provenance: p. 5
