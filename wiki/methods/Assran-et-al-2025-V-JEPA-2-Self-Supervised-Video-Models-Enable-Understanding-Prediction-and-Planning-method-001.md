---
type: "method"
title: "Latent video joint embedding predictive learning"
status: "draft"
sources:
  - "[[papers/Assran-et-al-2025-V-JEPA-2-Self-Supervised-Video-Models-Enable-Understanding-Prediction-and-Planning|Assran et al. - 2025 - V-JEPA 2 Self-Supervised Video Models Enable Understanding, Prediction and Planning]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Assran-et-al-2025-V-JEPA-2-Self-Supervised-Video-Models-Enable-Understanding-Prediction-and-Planning.md"
related_papers:
  - "papers/Assran-et-al-2025-V-JEPA-2-Self-Supervised-Video-Models-Enable-Understanding-Prediction-and-Planning.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-cc5d1e0c91"
consolidation_target: "methods/joint-embedding-predictive-learning"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Latent video joint embedding predictive learning

- Source paper: [[papers/Assran-et-al-2025-V-JEPA-2-Self-Supervised-Video-Models-Enable-Understanding-Prediction-and-Planning|Assran et al. - 2025 - V-JEPA 2 Self-Supervised Video Models Enable Understanding, Prediction and Planning]]
- Summary: Learns video representations by predicting masked or future latent embeddings rather than reconstructing pixels, then uses those representations for downstream understanding, prediction, or planning.
- Inputs: video frames or clips, masked latent targets, joint embedding predictor, downstream task data
- Outputs: latent video representations, perception or planning task predictions
- Assumptions: latent-space prediction captures useful world structure without requiring pixel-level generation, downstream gains should be separated by pretraining, probing, and finetuning stage
- Provenance: p. 1; p. 2; p. 3; p. 4
