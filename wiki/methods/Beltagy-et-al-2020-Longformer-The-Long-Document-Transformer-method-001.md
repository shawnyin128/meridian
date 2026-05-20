---
type: "method"
title: "Beltagy et al. - 2020 - Longformer The Long-Document Transformer"
status: "draft"
sources:
  - "[[papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer|Beltagy et al. - 2020 - Longformer The Long-Document Transformer]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer.md"
related_papers:
  - "papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-aea2900672"
---
# Beltagy et al. - 2020 - Longformer The Long-Document Transformer

- Source paper: [[papers/Beltagy-et-al-2020-Longformer-The-Long-Document-Transformer|Beltagy et al. - 2020 - Longformer The Long-Document Transformer]]
- Summary: To address this limitation, we introduce the Longformer with an attention mechanism that scales linearly with sequence length, making it easy to process documents of thousands of tokens or longer. To address this limitation, we present Long- former, a modiﬁed Transformer architecture with a self-attention operation that scales linearly with the sequence length, making it versatile for pro- cessing long documents (Fig 1). Longformer’s attention mechanism is a drop-in replacement for the standard self-attention and combines a local windowed attention with a task moti- vated global attention.
- Inputs: long sequence tokens, positional encoding or attention state
- Outputs: extended-context model behavior or evaluation results
- Assumptions: quality must be checked at the target context lengths, not inferred from short-context behavior
- Provenance: p. 1; p. 3; p. 11
