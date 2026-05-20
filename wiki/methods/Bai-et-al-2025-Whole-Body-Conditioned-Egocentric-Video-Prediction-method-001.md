---
type: "method"
title: "Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction"
status: "draft"
sources:
  - "[[papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction|Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction

- Source paper: [[papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction|Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction]]
- Summary: We train an auto-regressive conditional diffusion transformer on Nymeria, a large-scale dataset of real-world egocentric video and body pose capture. Our work represents an initial attempt to tackle the challenges of modeling complex real-world environments and embodied agent behaviors with video prediction from the perspective of a human.1 1 Introduction Human movement is rich, continuous, and physically grounded (Rosenhahn et al., 2008; Aggarwal and Cai, 1999). For embodied agents to simulate and plan like humans, they must not only predict future observations (Von Helmholtz, 1925), but also understand how visual input arises from whole-body action (Craik, 1943).
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 5; p. 2; p. 3
