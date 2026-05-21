---
type: "method"
title: "Vision-language joint embedding predictive architecture"
status: "draft"
sources:
  - "[[papers/Chen-et-al-2026-VL-JEPA-Joint-Embedding-Predictive-Architecture-for-Vision-language|Chen et al. - 2026 - VL-JEPA Joint Embedding Predictive Architecture for Vision-language]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Chen-et-al-2026-VL-JEPA-Joint-Embedding-Predictive-Architecture-for-Vision-language.md"
related_papers:
  - "papers/Chen-et-al-2026-VL-JEPA-Joint-Embedding-Predictive-Architecture-for-Vision-language.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-f38859344b"
consolidation_target: "methods/joint-embedding-predictive-learning"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Vision-language joint embedding predictive architecture

- Source paper: [[papers/Chen-et-al-2026-VL-JEPA-Joint-Embedding-Predictive-Architecture-for-Vision-language|Chen et al. - 2026 - VL-JEPA Joint Embedding Predictive Architecture for Vision-language]]
- Summary: Trains a vision-language model in embedding space rather than token reconstruction: caption pretraining aligns image/text embeddings, then supervised finetuning adds VQA and classification behavior.
- Inputs: image embeddings, text/caption embeddings, query-conditioned prediction target, SFT data
- Outputs: aligned vision-language embedding model, VQA-capable finetuned model
- Assumptions: embedding prediction is sufficient for useful vision-language alignment, query-conditioned SFT transfers the pretrained representation to downstream tasks
- Provenance: p. 1; p. 2; p. 3; p. 4
