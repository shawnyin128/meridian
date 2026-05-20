---
type: "method"
title: "Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem"
status: "draft"
sources:
  - "[[papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem|Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem

- Source paper: [[papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem|Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem]]
- Summary: 2.2 DIFFUSION PROBABILISTIC MODELS Our approach to the motif-scaffolding problem builds on denoising diffusion probabilistic models (DPMs) (Sohl-Dickstein et al., 2015). We propose to learn a distribution over diverse and longer protein backbone structures via an E(3)- equivariant graph neural network. We develop SMCDiff to efﬁciently sample scaf- folds from this distribution conditioned on a given motif; our algorithm is the ﬁrst to theoretically guarantee conditional samples from a diffusion model in the large- compute limit.
- Inputs: noisy sample, diffusion timestep, conditioning signal
- Outputs: denoised or generated sample conditioned on the input signal
- Assumptions: the conditioning signal and noise schedule match the intended generation distribution
- Provenance: p. 4; p. 2; p. 11
