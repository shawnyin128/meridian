---
type: "method"
title: "3549_Train_Freeze_or_Exit_Dyna"
status: "draft"
sources:
  - "[[papers/3549-Train-Freeze-or-Exit-Dyna|3549_Train_Freeze_or_Exit_Dyna]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# 3549_Train_Freeze_or_Exit_Dyna

- Source paper: [[papers/3549-Train-Freeze-or-Exit-Dyna|3549_Train_Freeze_or_Exit_Dyna]]
- Summary: 4 OUR METHOD: THREE-STATE MODULE SCHEDULING (TRIMS) To enable resource-controllable dynamic module scheduling, we propose the TriMS framework. To address this, we propose Three-State Module Schedul- ing (TriMS), a dynamic fine-tuning framework that assigns each module in the model to one of three states (trainable, frozen, or early exit). 3 PRELIMINARIES & PROBLEM FORMULATION In this section, we introduce the foundations of our approach.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task
- Provenance: p. 2; p. 3; p. 4
