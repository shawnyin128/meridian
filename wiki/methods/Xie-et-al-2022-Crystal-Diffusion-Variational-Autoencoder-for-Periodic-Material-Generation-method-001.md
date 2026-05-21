---
type: "method"
title: "Xie et al. - 2022 - Crystal Diffusion Variational Autoencoder for Periodic Material Generation"
status: "draft"
sources:
  - "[[papers/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation|Xie et al. - 2022 - Crystal Diffusion Variational Autoencoder for Periodic Material Generation]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation.md"
related_papers:
  - "papers/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-c643256d63"
consolidation_target: "methods/paper-specific-research-method"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Xie et al. - 2022 - Crystal Diffusion Variational Autoencoder for Periodic Material Generation

- Source paper: [[papers/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation|Xie et al. - 2022 - Crystal Diffusion Variational Autoencoder for Periodic Material Generation]]
- Summary: We propose a Crystal Diffusion Variational Autoencoder (CDVAE) that captures the physical inductive bias of material stability. Our decoder that generates the 3D atomic structures via a diffusion process is closely related to the diffusion models used for molecular con- former generation (Shi et al., 2021; Xu et al., 2021b). G-SchNet (Gebauer et al., 2019) is more closely related to our method because it directly generates 3D molecules atom-by-atom without re- lying on a graph.
- Inputs: noisy sample, diffusion timestep, conditioning signal
- Outputs: denoised or generated sample conditioned on the input signal
- Assumptions: the conditioning signal and noise schedule match the intended generation distribution
- Provenance: p. 11; p. 12; p. 5
