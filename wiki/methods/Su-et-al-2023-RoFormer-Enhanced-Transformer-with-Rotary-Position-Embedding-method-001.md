---
type: "method"
title: "Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding"
status: "draft"
sources:
  - "[[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding

- Source paper: [[papers/Su-et-al-2023-RoFormer-Enhanced-Transformer-with-Rotary-Position-Embedding|Su et al. - 2023 - RoFormer Enhanced Transformer with Rotary Position Embedding]]
- Summary: The query and key values are then used to compute the attention weights, while the output is computed as the weighted sum over the value 2 RoFormer representation. [2020] followed these settings by only encoding the relative position information into the attention weights. Then, we propose a novel method named Rotary Position Embedding(RoPE) to effectively leverage the positional information.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, attention logits or values augmented with relative position information, rotation-transformed equivalent model
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, relative distance information improves sequence modeling without breaking attention computation, the transformation preserves the full-precision computation before quantization
- Provenance: p. 1; p. 5; p. 6
