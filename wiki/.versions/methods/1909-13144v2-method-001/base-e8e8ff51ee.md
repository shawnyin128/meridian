---
type: "method"
title: "1909.13144v2"
status: "draft"
sources:
  - "[[papers/1909-13144v2|1909.13144v2]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# 1909.13144v2

- Source paper: [[papers/1909-13144v2|1909.13144v2]]
- Summary: We introduce the APoT quantization scheme for the weights and activations of DNNs. Inspired by the crucial role of batch nor- malization (BN) (Ioffe & Szegedy, 2015) in activation quantization (Cai et al., 2017), we propose weight normalization (WN) to reﬁne the distribution of weights with zero mean and unit variance, ˜ W = W −µ σ + ϵ , where µ = 1 I I X i=1 Wi, σ = v u u t1 I I X i=1 (Wi −µ)2, (9) where ϵ is a small number (typically 10−5) for numerical stability, and I denotes the number of weights in one layer. APoT is a non-uniform quantization scheme, in which the quantization levels is a sum of several PoT terms and can adapt well to the bell-shaped distribution of weights.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, the transformation preserves the full-precision computation before quantization
- Provenance: p. 2; p. 5; p. 7
