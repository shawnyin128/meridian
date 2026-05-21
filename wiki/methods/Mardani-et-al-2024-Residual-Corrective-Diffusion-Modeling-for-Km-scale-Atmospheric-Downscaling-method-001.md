---
type: "method"
title: "Mardani et al. - 2024 - Residual Corrective Diffusion Modeling for Km-scale Atmospheric Downscaling"
status: "draft"
sources:
  - "[[papers/Mardani-et-al-2024-Residual-Corrective-Diffusion-Modeling-for-Km-scale-Atmospheric-Downscaling|Mardani et al. - 2024 - Residual Corrective Diffusion Modeling for Km-scale Atmospheric Downscaling]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Mardani-et-al-2024-Residual-Corrective-Diffusion-Modeling-for-Km-scale-Atmospheric-Downscaling.md"
related_papers:
  - "papers/Mardani-et-al-2024-Residual-Corrective-Diffusion-Modeling-for-Km-scale-Atmospheric-Downscaling.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e31183eb49"
consolidation_target: "methods/paper-specific-research-method"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Mardani et al. - 2024 - Residual Corrective Diffusion Modeling for Km-scale Atmospheric Downscaling

- Source paper: [[papers/Mardani-et-al-2024-Residual-Corrective-Diffusion-Modeling-for-Km-scale-Atmospheric-Downscaling|Mardani et al. - 2024 - Residual Corrective Diffusion Modeling for Km-scale Atmospheric Downscaling]]
- Summary: Residual Corrective Diffusion Modeling for Km-scale Atmospheric Downscaling Morteza Mardani1,*,a, Noah Brenowitz1,*, Yair Cohen1,*, Jaideep Pathak1, Chieh-Yu Chen1, Cheng-Chin Liu2, Arash Vahdat1, Mohammad Amin Nabian1, Tao Ge1, Akshay Subramaniam1, Karthik Kashinath1, Jan Kautz1, and Mike Pritchard1 1NVIDIA, Santa Clara, CA. To address the large resolution ratio, different physics involved at different scales and prediction of channels beyond those in the input data, we employ a two-step approach where a UNet predicts the mean and a corrector diffusion (CorrDiff) model predicts the residual. Bottom right: diffusion model is conditioned with the coarse-resolution input to generate the residual r after a few denoising steps.
- Inputs: noisy sample, diffusion timestep, conditioning signal
- Outputs: denoised or generated sample conditioned on the input signal
- Assumptions: the conditioning signal and noise schedule match the intended generation distribution
- Provenance: p. 12; p. 11; p. 3
