---
type: "method"
title: "Szymanowicz et al. - 2024 - Splatter Image Ultra-Fast Single-View 3D Reconstruction"
status: "draft"
sources:
  - "[[papers/Szymanowicz-et-al-2024-Splatter-Image-Ultra-Fast-Single-View-3D-Reconstruction|Szymanowicz et al. - 2024 - Splatter Image Ultra-Fast Single-View 3D Reconstruction]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Szymanowicz et al. - 2024 - Splatter Image Ultra-Fast Single-View 3D Reconstruction

- Source paper: [[papers/Szymanowicz-et-al-2024-Splatter-Image-Ultra-Fast-Single-View-3D-Reconstruction|Szymanowicz et al. - 2024 - Splatter Image Ultra-Fast Single-View 3D Reconstruction]]
- Summary: Abstract We introduce the Splatter Image, an ultra-efficient ap- proach for monocular 3D object reconstruction. We further extend the method take sev- eral images as input via cross-view attention. The dif- ferent views communicate during prediction via lightweight cross-view attention layers in the architecture.
- Inputs: noisy sample, diffusion timestep, conditioning signal, model weights
- Outputs: denoised or generated sample conditioned on the input signal
- Assumptions: the conditioning signal and noise schedule match the intended generation distribution
- Provenance: p. 10; p. 2; p. 3
