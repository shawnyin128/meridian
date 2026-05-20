---
type: "method"
title: "Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models"
status: "draft"
sources:
  - "[[papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models|Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models

- Source paper: [[papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models|Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models]]
- Summary: In this study, we propose DiffSBDD, an SE(3)-equivariant 3D-conditional diffusion model for SBDD that respects translation, rotation, and permutation symmetries. Structure-based Drug Design with Equivariant Diffusion Models Arne Schneuing1*†, Charles Harris2†, Yuanqi Du3†, Kieran Didi2, Arian Jamasb2,9, Ilia Igashov1, Weitao Du4, Carla Gomes3, Tom L. Recently a surge of diffusion generative models has entered this domain which hold promise to capture the statistical properties of natural ligands more faithfully.
- Inputs: noisy sample, diffusion timestep, conditioning signal
- Outputs: denoised or generated sample conditioned on the input signal
- Assumptions: the conditioning signal and noise schedule match the intended generation distribution
- Provenance: p. 2; p. 12; p. 10
