---
type: "method"
title: "Latent video joint embedding predictive learning"
status: "draft"
sources:
  - "[[papers/Caffagni-et-al-2025-Seeing-Beyond-Words-Self-Supervised-Visual-Learning-for-Multimodal-Large-Language-Models|Caffagni et al. - 2025 - Seeing Beyond Words Self-Supervised Visual Learning for Multimodal Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Caffagni-et-al-2025-Seeing-Beyond-Words-Self-Supervised-Visual-Learning-for-Multimodal-Large-Language-Models.md"
related_papers:
  - "papers/Caffagni-et-al-2025-Seeing-Beyond-Words-Self-Supervised-Visual-Learning-for-Multimodal-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-c6e2c285ab"
---
# Latent video joint embedding predictive learning

- Source paper: [[papers/Caffagni-et-al-2025-Seeing-Beyond-Words-Self-Supervised-Visual-Learning-for-Multimodal-Large-Language-Models|Caffagni et al. - 2025 - Seeing Beyond Words Self-Supervised Visual Learning for Multimodal Large Language Models]]
- Summary: Learns video representations by predicting masked or future latent embeddings rather than reconstructing pixels, then uses those representations for downstream understanding, prediction, or planning.
- Inputs: video frames or clips, masked latent targets, joint embedding predictor, downstream task data
- Outputs: latent video representations, perception or planning task predictions
- Assumptions: latent-space prediction captures useful world structure without requiring pixel-level generation, downstream gains should be separated by pretraining, probing, and finetuning stage
- Provenance: p. 3; p. 9
