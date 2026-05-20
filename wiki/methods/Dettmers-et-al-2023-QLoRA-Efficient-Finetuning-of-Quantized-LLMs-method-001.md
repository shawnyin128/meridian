---
type: "method"
title: "Dettmers et al. - 2023 - QLoRA Efficient Finetuning of Quantized LLMs"
status: "draft"
sources:
  - "[[papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs|Dettmers et al. - 2023 - QLoRA Efficient Finetuning of Quantized LLMs]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
related_papers:
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-de1dac3baa"
---
# Dettmers et al. - 2023 - QLoRA Efficient Finetuning of Quantized LLMs

- Source paper: [[papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs|Dettmers et al. - 2023 - QLoRA Efficient Finetuning of Quantized LLMs]]
- Summary: QLORA introduces a number of innovations to save memory without sacrificing performance: (a) 4-bit NormalFloat (NF4), a new data type that is information theoretically optimal for normally distributed weights (b) Double Quantization to reduce the average memory footprint by quantizing the quantization constants, and (c) Paged Optimizers to manage memory spikes. Our method, QLORA, uses a novel high-precision technique to quantize a pretrained model to 4-bit, then adds a small set of learnable Low-rank Adapter weights [28] ∗Equal contribution. Dequantization is the inverse: dequant(cFP32, XInt8) = XInt8 cFP32 = XFP32 (2) The problem with this approach is that if a large magnitude value (i.e., an outlier) occurs in the input tensor, then the quantization bins—certain bit combinations—are not utilized well with few or no numbers quantized in some bins.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, the transformation preserves the full-precision computation before quantization
- Provenance: p. 4; p. 3; p. 5
