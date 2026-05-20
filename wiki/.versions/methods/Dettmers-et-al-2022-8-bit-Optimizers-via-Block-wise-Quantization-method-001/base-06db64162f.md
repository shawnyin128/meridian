---
type: "method"
title: "Dettmers et al. - 2022 - 8-bit Optimizers via Block-wise Quantization"
status: "draft"
sources:
  - "[[papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization|Dettmers et al. - 2022 - 8-bit Optimizers via Block-wise Quantization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Dettmers et al. - 2022 - 8-bit Optimizers via Block-wise Quantization

- Source paper: [[papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization|Dettmers et al. - 2022 - 8-bit Optimizers via Block-wise Quantization]]
- Summary: Outliers are conﬁned to a single block through block-wise quantization, and their effect on normalization is limited. We introduce a new block-wise quantization approach that addresses all three of these challenges. This block-wise division reduces the effect of outliers on the quantization process since they are isolated to particular blocks, thereby improving stability and performance, especially for large-scale models.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, the page is useful as a synthesis map; individual claims still require checking cited primary evidence
- Provenance: p. 2; p. 11; p. 12
