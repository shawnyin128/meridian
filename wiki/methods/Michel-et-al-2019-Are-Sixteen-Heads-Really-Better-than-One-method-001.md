---
type: "method"
title: "Michel et al. - 2019 - Are Sixteen Heads Really Better than One"
status: "draft"
sources:
  - "[[papers/Michel-et-al-2019-Are-Sixteen-Heads-Really-Better-than-One|Michel et al. - 2019 - Are Sixteen Heads Really Better than One]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Michel-et-al-2019-Are-Sixteen-Heads-Really-Better-than-One.md"
related_papers:
  - "papers/Michel-et-al-2019-Are-Sixteen-Heads-Really-Better-than-One.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-26b0b54206"
consolidation_target: "methods/transformer-architecture"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Michel et al. - 2019 - Are Sixteen Heads Really Better than One

- Source paper: [[papers/Michel-et-al-2019-Are-Sixteen-Heads-Really-Better-than-One|Michel et al. - 2019 - Are Sixteen Heads Really Better than One]]
- Summary: 2 Background: Attention, Multi-headed Attention, and Masking In this section we lay out the notational groundwork regarding attention, and also describe our method for masking out attention heads. In particular, multi-headed attention is a driving force behind many recent state-of-the-art natural language processing (NLP) models such as Transformer-based MT models and BERT. These models apply multiple attention mechanisms in parallel, with each attention “head” potentially focusing on different parts of the input, which makes it possible to express sophisticated functions beyond the simple weighted average.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights
- Outputs: contextual token representations, sequence-model predictions
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, the page is useful as a synthesis map; individual claims still require checking cited primary evidence, the transformation preserves the full-precision computation before quantization
- Provenance: p. 1; p. 2; p. 11
