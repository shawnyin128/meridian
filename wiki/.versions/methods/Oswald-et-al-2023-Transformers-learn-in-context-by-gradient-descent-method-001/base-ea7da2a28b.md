---
type: "method"
title: "Oswald et al. - 2023 - Transformers learn in-context by gradient descent"
status: "draft"
sources:
  - "[[papers/Oswald-et-al-2023-Transformers-learn-in-context-by-gradient-descent|Oswald et al. - 2023 - Transformers learn in-context by gradient descent]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Oswald et al. - 2023 - Transformers learn in-context by gradient descent

- Source paper: [[papers/Oswald-et-al-2023-Transformers-learn-in-context-by-gradient-descent|Oswald et al. - 2023 - Transformers learn in-context by gradient descent]]
- Summary: Motivated by that construction, we show empirically that when training self-attention-only Transformers on simple regression tasks either the models learned by GD and Transformers show great similarity or, remarkably, the weights found by optimiza- tion match the construction. We summarize our contributions as follows1: • We construct explicit weights for a linear self-attention layer that induces an update identical to a single step of gradient descent (GD) on a mean squared error loss. This allows us to (1) show that optimizing self-attention-only Transformers finds weights that match our weight construc- tion (Proposition 1), demonstrating its practical relevance, and (2) explain in-context learning in shallow two layer Transformers intensively studied by Olsson et al.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task
- Provenance: p. 3; p. 5; p. 6
