---
type: "method"
title: "Segmentation-conditioned 3D DDPM"
status: "draft"
sources:
  - "[[papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis|Dorjsembe et al. - 2024 - Conditional Diffusion Models for Semantic 3D Brain MRI Synthesis]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Segmentation-conditioned 3D DDPM

- Source paper: [[papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis|Dorjsembe et al. - 2024 - Conditional Diffusion Models for Semantic 3D Brain MRI Synthesis]]
- Summary: Conditions a 3D denoising diffusion model on semantic brain segmentation masks so synthetic MRI volumes follow specified anatomy rather than only matching a marginal image distribution.
- Inputs: 3D noisy MRI volume, diffusion timestep, semantic segmentation mask
- Outputs: synthetic 3D brain MRI, augmentation or anonymized image samples tied to anatomy
- Assumptions: segmentation masks encode the anatomy that downstream users need to control, diffusion samples are judged by both image realism and downstream segmentation utility
- Provenance: p. 2; p. 3; p. 5; p. 6
