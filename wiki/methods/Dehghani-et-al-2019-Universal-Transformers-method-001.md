---
type: "method"
title: "Dehghani et al. - 2019 - Universal Transformers"
status: "draft"
sources:
  - "[[papers/Dehghani-et-al-2019-Universal-Transformers|Dehghani et al. - 2019 - Universal Transformers]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Dehghani-et-al-2019-Universal-Transformers.md"
related_papers:
  - "papers/Dehghani-et-al-2019-Universal-Transformers.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-0faa39281d"
consolidation_target: "methods/recurrent-transformer"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Dehghani et al. - 2019 - Universal Transformers

- Source paper: [[papers/Dehghani-et-al-2019-Universal-Transformers|Dehghani et al. - 2019 - Universal Transformers]]
- Summary: We propose the Universal Transformer (UT), a parallel-in-time self-attentive recurrent sequence model which can be cast as a generalization of the Transformer model and which addresses these issues. 1 INTRODUCTION Convolutional and fully-attentional feed-forward architectures like the Transformer have recently emerged as viable alternatives to recurrent neural networks (RNNs) for a range of sequence modeling tasks, notably machine translation (Gehring et al., 2017; Vaswani et al., 2017). The Transformer model in particular relies entirely on a self-attention mechanism (Parikh et al., 2016; Lin et al., 2017) to compute a series of context-informed vector-space representations of the symbols in its input and output, which are then used to predict distributions over subsequent symbols as the model predicts the output sequence symbol-by-symbol.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task
- Provenance: p. 1; p. 2; p. 4
