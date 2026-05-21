---
type: "method"
title: "Child et al. - 2019 - Generating Long Sequences with Sparse Transformers"
status: "draft"
sources:
  - "[[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers|Child et al. - 2019 - Generating Long Sequences with Sparse Transformers]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
related_papers:
  - "papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e8ae236685"
consolidation_target: "methods/long-context-inference"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Child et al. - 2019 - Generating Long Sequences with Sparse Transformers

- Source paper: [[papers/Child-et-al-2019-Generating-Long-Sequences-with-Sparse-Transformers|Child et al. - 2019 - Generating Long Sequences with Sparse Transformers]]
- Summary: In this paper we introduce sparse factorizations of the attention matrix which reduce this to O(n√n). We used the same self-attention based architecture for audio, images, and text. To motivate our approach, we ﬁrst perform a qualitative assessment of attention patterns learned by a standard Transformer on an image dataset.
- Inputs: long sequence tokens, positional encoding or attention state
- Outputs: extended-context model behavior or evaluation results
- Assumptions: quality must be checked at the target context lengths, not inferred from short-context behavior
- Provenance: p. 2; p. 1; p. 3
