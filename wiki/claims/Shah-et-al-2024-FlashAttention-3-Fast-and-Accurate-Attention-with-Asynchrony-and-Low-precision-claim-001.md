---
type: "claim"
title: "To validate our method empirically, we benchmark FlashAttention-3 on the H100 SXM5 GPU over a range of parameters and show that (1) FP16 achieves 1.5-2.0× speedup over FlashAttention-2 in the forward pass (reaching up to 740 TFLOPs/s) and 1.5-1.75× in the backward pass, (2) FP8 achieves close to 1.2 PFLOPs/s, and (3) for large sequence length, FP16 outperforms and FP8 is competitive2 with a state-of-the-art implementation of attention from NVIDIA’s cuDNN library."
status: "draft"
sources:
  - "[[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision|Shah et al. - 2024 - FlashAttention-3 Fast and Accurate Attention with Asynchrony and Low-precision]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "claim-001"
---
# To validate our method empirically, we benchmark FlashAttention-3 on the H100 SXM5 GPU over a range of parameters and show that (1) FP16 achieves 1.5-2.0× speedup over FlashAttention-2 in the forward pass (reaching up to 740 TFLOPs/s) and 1.5-1.75× in the backward pass, (2) FP8 achieves close to 1.2 PFLOPs/s, and (3) for large sequence length, FP16 outperforms and FP8 is competitive2 with a state-of-the-art implementation of attention from NVIDIA’s cuDNN library.

- Source paper: [[papers/Shah-et-al-2024-FlashAttention-3-Fast-and-Accurate-Attention-with-Asynchrony-and-Low-precision|Shah et al. - 2024 - FlashAttention-3 Fast and Accurate Attention with Asynchrony and Low-precision]]
- Claim: To validate our method empirically, we benchmark FlashAttention-3 on the H100 SXM5 GPU over a range of parameters and show that (1) FP16 achieves 1.5-2.0× speedup over FlashAttention-2 in the forward pass (reaching up to 740 TFLOPs/s) and 1.5-1.75× in the backward pass, (2) FP8 achieves close to 1.2 PFLOPs/s, and (3) for large sequence length, FP16 outperforms and FP8 is competitive2 with a state-of-the-art implementation of attention from NVIDIA’s cuDNN library.
- Claim type: source_claim
- Evidence IDs: evidence-p0002
- Provenance: p. 2
