---
type: "method"
title: "Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models"
status: "draft"
sources:
  - "[[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models|Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
related_papers:
  - "papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-a4dc4bdb94"
consolidation_target: "methods/IO-aware-attention"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models

- Source paper: [[papers/Poli-et-al-2023-Hyena-Hierarchy-Towards-Larger-Convolutional-Language-Models|Poli et al. - 2023 - Hyena Hierarchy Towards Larger Convolutional Language Models]]
- Summary: In this work, we propose Hyena, a subquadratic drop-in replacement for attention constructed by interleaving implicitly parametrized long convolutions and data-controlled gating. However, the core building block of Transformers, the attention operator, exhibits quadratic cost in sequence length, limiting the amount of context accessible. Existing subquadratic methods based on low-rank and sparse approximations need to be combined with dense attention layers to match Transformers, indicating a gap in capability.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations
- Outputs: contextual token representations, sequence-model predictions
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, the transformation preserves the full-precision computation before quantization
- Provenance: p. 2; p. 8; p. 7
