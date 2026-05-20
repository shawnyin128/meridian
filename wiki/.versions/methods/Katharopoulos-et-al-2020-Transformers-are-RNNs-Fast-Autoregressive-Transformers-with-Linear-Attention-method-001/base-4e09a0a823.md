---
type: "method"
title: "Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention"
status: "draft"
sources:
  - "[[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention

- Source paper: [[papers/Katharopoulos-et-al-2020-Transformers-are-RNNs-Fast-Autoregressive-Transformers-with-Linear-Attention|Katharopoulos et al. - 2020 - Transformers are RNNs Fast Autoregressive Transformers with Linear Attention]]
- Summary: Finally, we present another line of work that seeks to alleviate the softmax bottleneck in the attention computation. We present that changing the attention from the tra- ditional softmax attention to a feature map based dot product attention results in better time and memory complexity as well as a causal model that can perform sequence generation in linear time, similar to a recurrent neural network. We achieve this by using a kernel-based formulation of self-attention and the associative property of matrix products to calculate the self-attention weights (§ 3.2).
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, audio features, text prompts or labels, audio-language training data, calibration or runtime activations, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, audio-language representations, speech/audio understanding predictions, low-bit quantized model representation, latency or memory-efficiency measurements
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, inference is memory-bound enough that compression translates into speed or capacity gains
- Provenance: p. 2; p. 1; p. 4
