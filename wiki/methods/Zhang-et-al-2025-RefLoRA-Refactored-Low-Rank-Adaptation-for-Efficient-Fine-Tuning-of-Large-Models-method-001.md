---
type: "method"
title: "Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models"
status: "draft"
sources:
  - "[[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models|Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models

- Source paper: [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models|Zhang et al. - 2025 - RefLoRA Refactored Low-Rank Adaptation for Efficient Fine-Tuning of Large Models]]
- Summary: For instance, DoRA [63] decomposes LoRA weights into magnitude and direction components to improve learning capacity and training stability. PiSSA [40] leverages truncated singular value decomposition (SVD) to keep the low-rank initialization close to the pre-trained weights, whereas LoRA-GA [58] aligns the first update direction with full fine-tuning. Our approach falls within the same family, but adheres strictly to standard backpropagation rule, avoiding direct gradient manipulation and requiring less computational overhead.
- Inputs: calibration or runtime activations, model weights
- Outputs: low-bit quantized model representation, rotation-transformed equivalent model
- Assumptions: the transformation preserves the full-precision computation before quantization
- Provenance: p. 3; p. 12; p. 5
