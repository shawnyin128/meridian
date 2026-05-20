---
type: "method"
title: "Hu et al. - 2025 - DREAM Drafting with Refined Target Features and Entropy-Adaptive Cross-Attention Fusion for Multimo"
status: "draft"
sources:
  - "[[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo|Hu et al. - 2025 - DREAM Drafting with Refined Target Features and Entropy-Adaptive Cross-Attention Fusion for Multimo]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Hu et al. - 2025 - DREAM Drafting with Refined Target Features and Entropy-Adaptive Cross-Attention Fusion for Multimo

- Source paper: [[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo|Hu et al. - 2025 - DREAM Drafting with Refined Target Features and Entropy-Adaptive Cross-Attention Fusion for Multimo]]
- Summary: We introduce DREAM, a novel speculative decoding framework tailored for VLMs that combines three key innovations: (1) a cross-attention-based mechanism to inject intermediate features from the target model into the draft model for improved alignment, (2) adaptive intermediate feature selection based on attention entropy to guide efficient draft model training, and (3) visual token compression to reduce draft model latency. In this paper, we propose Drafting with Refined Target Features and Entropy-Adaptive Cross-Attention Fusion for Multimodal Speculative Decoding (DREAM). , sL q+v) by summing each token’s attention weights across all other tokens, as derived from the attention matrix.
- Inputs: draft model proposals, target model verification logits, acceptance or tree budget
- Outputs: verified accepted tokens, inference speedup without target-distribution change
- Assumptions: target-model verification preserves the original decoding distribution
- Provenance: p. 1; p. 2; p. 6
