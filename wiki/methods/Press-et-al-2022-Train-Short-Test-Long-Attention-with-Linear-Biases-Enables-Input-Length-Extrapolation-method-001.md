---
type: "method"
title: "Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation"
status: "draft"
sources:
  - "[[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
related_papers:
  - "papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-678ba71400"
---
# Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation

- Source paper: [[papers/Press-et-al-2022-Train-Short-Test-Long-Attention-with-Linear-Biases-Enables-Input-Length-Extrapolation|Press et al. - 2022 - Train Short, Test Long Attention with Linear Biases Enables Input Length Extrapolation]]
- Summary: We therefore introduce a simpler and more efﬁcient position method, Attention with Linear Biases (ALiBi). ALiBi does not add positional embeddings to word embeddings; instead, it biases query-key attention scores with a penalty that is proportional to their distance. ALiBi negatively biases attention scores with a linearly decreasing penalty proportional to the dis- tance between the relevant key and query.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, attention logits or values augmented with relative position information, latency or memory-efficiency measurements
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, relative distance information improves sequence modeling without breaking attention computation, the transformation preserves the full-precision computation before quantization
- Provenance: p. 1; p. 4; p. 5
