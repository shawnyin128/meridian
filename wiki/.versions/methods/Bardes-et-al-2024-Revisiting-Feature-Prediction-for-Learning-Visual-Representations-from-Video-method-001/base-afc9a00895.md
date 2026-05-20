---
type: "method"
title: "Latent video joint embedding predictive learning"
status: "draft"
sources:
  - "[[papers/Bardes-et-al-2024-Revisiting-Feature-Prediction-for-Learning-Visual-Representations-from-Video|Bardes et al. - 2024 - Revisiting Feature Prediction for Learning Visual Representations from Video]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Latent video joint embedding predictive learning

- Source paper: [[papers/Bardes-et-al-2024-Revisiting-Feature-Prediction-for-Learning-Visual-Representations-from-Video|Bardes et al. - 2024 - Revisiting Feature Prediction for Learning Visual Representations from Video]]
- Summary: Learns video representations by predicting masked or future latent embeddings rather than reconstructing pixels, then uses those representations for downstream understanding, prediction, or planning.
- Inputs: video frames or clips, masked latent targets, joint embedding predictor, downstream task data
- Outputs: latent video representations, perception or planning task predictions
- Assumptions: latent-space prediction captures useful world structure without requiring pixel-level generation, downstream gains should be separated by pretraining, probing, and finetuning stage
- Provenance: p. 1; p. 2; p. 4; p. 5
