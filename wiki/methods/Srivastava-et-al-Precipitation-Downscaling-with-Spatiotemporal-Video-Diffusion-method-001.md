---
type: "method"
title: "Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion"
status: "draft"
sources:
  - "[[papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion|Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion

- Source paper: [[papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion|Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion]]
- Summary: It deterministically downscales a low- resolution precipitation sequence using spatio-temporal factorized attention and models residuals with conditional diffusion (with factorized attention). We introduce a novel framework for temporal precipitation downscaling using diffusion models. We propose SpatioTemporal Video Diffusion (STVD)2 for precipitation downscaling.
- Inputs: noisy sample, diffusion timestep, conditioning signal
- Outputs: denoised or generated sample conditioned on the input signal
- Assumptions: the conditioning signal and noise schedule match the intended generation distribution
- Provenance: p. 3; p. 5; p. 12
