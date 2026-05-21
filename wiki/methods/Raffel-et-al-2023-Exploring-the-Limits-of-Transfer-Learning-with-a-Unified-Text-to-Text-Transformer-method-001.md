---
type: "method"
title: "Raffel et al. - 2023 - Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer"
status: "draft"
sources:
  - "[[papers/Raffel-et-al-2023-Exploring-the-Limits-of-Transfer-Learning-with-a-Unified-Text-to-Text-Transformer|Raffel et al. - 2023 - Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Raffel-et-al-2023-Exploring-the-Limits-of-Transfer-Learning-with-a-Unified-Text-to-Text-Transformer.md"
related_papers:
  - "papers/Raffel-et-al-2023-Exploring-the-Limits-of-Transfer-Learning-with-a-Unified-Text-to-Text-Transformer.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-ccac68eb1e"
consolidation_target: "methods/survey-synthesis"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Raffel et al. - 2023 - Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer

- Source paper: [[papers/Raffel-et-al-2023-Exploring-the-Limits-of-Transfer-Learning-with-a-Unified-Text-to-Text-Transformer|Raffel et al. - 2023 - Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer]]
- Summary: In this paper, we explore the landscape of transfer learning techniques for NLP by introducing a unified framework that converts all text-based language problems into a text-to-text format. To facilitate future work on transfer learning for NLP, we release our data set, pre-trained models, and code.1 Keywords: transfer learning, natural language processing, multi-task learning, attention- based models, deep learning 1. This approach is inspired by previous unifying frameworks for NLP tasks, including casting all text problems as question answering (McCann et al., 2018), language modeling (Radford et al., 2019), or span extraction Keskar et al.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task
- Provenance: p. 2; p. 11; p. 1
