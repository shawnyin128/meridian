---
type: "method"
title: "Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks"
status: "draft"
sources:
  - "[[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
related_papers:
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e4ea1a14ef"
---
# Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks

- Source paper: [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks]]
- Summary: We introduce the APoT quantization scheme for the weights and activations of DNNs. Inspired by the crucial role of batch nor- malization (BN) (Ioffe & Szegedy, 2015) in activation quantization (Cai et al., 2017), we propose weight normalization (WN) to reﬁne the distribution of weights with zero mean and unit variance, ˜ W = W −µ σ + ϵ , where µ = 1 I I X i=1 Wi, σ = v u u t1 I I X i=1 (Wi −µ)2, (9) where ϵ is a small number (typically 10−5) for numerical stability, and I denotes the number of weights in one layer. APoT is a non-uniform quantization scheme, in which the quantization levels is a sum of several PoT terms and can adapt well to the bell-shaped distribution of weights.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, the transformation preserves the full-precision computation before quantization
- Provenance: p. 2; p. 5; p. 7
