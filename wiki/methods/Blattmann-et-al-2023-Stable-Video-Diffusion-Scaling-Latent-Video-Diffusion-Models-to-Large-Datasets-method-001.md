---
type: "method"
title: "Blattmann et al. - 2023 - Stable Video Diffusion Scaling Latent Video Diffusion Models to Large Datasets"
status: "draft"
sources:
  - "[[papers/Blattmann-et-al-2023-Stable-Video-Diffusion-Scaling-Latent-Video-Diffusion-Models-to-Large-Datasets|Blattmann et al. - 2023 - Stable Video Diffusion Scaling Latent Video Diffusion Models to Large Datasets]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Blattmann-et-al-2023-Stable-Video-Diffusion-Scaling-Latent-Video-Diffusion-Models-to-Large-Datasets.md"
related_papers:
  - "papers/Blattmann-et-al-2023-Stable-Video-Diffusion-Scaling-Latent-Video-Diffusion-Models-to-Large-Datasets.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e986daa8b2"
consolidation_target: "methods/policy-optimization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Blattmann et al. - 2023 - Stable Video Diffusion Scaling Latent Video Diffusion Models to Large Datasets

- Source paper: [[papers/Blattmann-et-al-2023-Stable-Video-Diffusion-Scaling-Latent-Video-Diffusion-Models-to-Large-Datasets|Blattmann et al. - 2023 - Stable Video Diffusion Scaling Latent Video Diffusion Models to Large Datasets]]
- Summary: Curating Data for HQ Video Synthesis In this section, we introduce a general strategy to train a state-of-the-art video diffusion model on large datasets of videos. We provide a brief overview of related works which utilize latent video diffusion models (Video-LDMs) 2 Prompt Alignment Quality Aggregated 0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 User Preference LVD-10M-F WebVid-10M (a) User preference for LVD- 10M-F and WebVid [7]. Recently, latent diffusion models trained for 2D image synthesis have been turned into generative video models by inserting temporal layers and finetuning them on small, high-quality video datasets.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 3; p. 2; p. 5
