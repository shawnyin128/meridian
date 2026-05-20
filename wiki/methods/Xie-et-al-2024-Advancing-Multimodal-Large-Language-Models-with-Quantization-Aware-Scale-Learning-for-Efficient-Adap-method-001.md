---
type: "method"
title: "Block-wise error minimization with learnable quantization parameters"
status: "draft"
sources:
  - "[[papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap|Xie et al. - 2024 - Advancing Multimodal Large Language Models with Quantization-Aware Scale Learning for Efficient Adap]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
related_papers:
  - "papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-ef85d433e9"
---
# Block-wise error minimization with learnable quantization parameters

- Source paper: [[papers/Xie-et-al-2024-Advancing-Multimodal-Large-Language-Models-with-Quantization-Aware-Scale-Learning-for-Efficient-Adap|Xie et al. - 2024 - Advancing Multimodal Large Language Models with Quantization-Aware Scale Learning for Efficient Adap]]
- Summary: Freezes full-precision weights but learns a small set of clipping and equivalent-transform parameters by minimizing block output error across weight-only and weight-activation settings.
- Inputs: full-precision transformer block, calibration samples, learnable clipping/scaling/shifting parameters
- Outputs: calibrated quantization parameters, quantized block with reduced reconstruction error
- Assumptions: block-wise reconstruction is a useful proxy for final LLM quality, a restrained parameter set can approach QAT quality without full fine-tuning cost
- Provenance: p. 3; p. 7; p. 8; p. 10
