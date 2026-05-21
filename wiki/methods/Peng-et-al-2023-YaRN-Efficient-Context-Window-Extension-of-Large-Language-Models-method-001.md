---
type: "method"
title: "Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models"
status: "draft"
sources:
  - "[[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models|Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
related_papers:
  - "papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-43c9173c83"
consolidation_target: "methods/transformer-architecture"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models

- Source paper: [[papers/Peng-et-al-2023-YaRN-Efficient-Context-Window-Extension-of-Large-Language-Models|Peng et al. - 2023 - YaRN Efficient Context Window Extension of Large Language Models]]
- Summary: (1) Next, the attention weights are calculated as softmax(qT mkn p |D| ), (2) where qm, kn are considered as column vectors so that qT mkn is simply the Euclidean inner product. We present YaRN (Yet another RoPE extensioN method), a compute-efficient method to extend the context window of such models, requiring 10x less tokens and 2.5x less training steps than previous methods. In this paper, in addition to making a complete account of the previous unpublished works on the "NTK-aware", the "Dynamic NTK" and the "NTK-by-part" interpolations, we present YaRN (Yet another RoPE extensioN method), an improved method to efficiently extend the context window of models trained with Rotary Position Embeddings (RoPE) including the LLaMA [38], the GPT- NeoX [5], and the PaLM [10] families of models.
- Inputs: long sequence tokens, positional encoding or attention state
- Outputs: extended-context model behavior or evaluation results
- Assumptions: quality must be checked at the target context lengths, not inferred from short-context behavior
- Provenance: p. 4; p. 12; p. 2
