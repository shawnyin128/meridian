---
type: "method"
title: "Meng et al. - 2022 - SDEdit Guided Image Synthesis and Editing with Stochastic Differential Equations"
status: "draft"
sources:
  - "[[papers/Meng-et-al-2022-SDEdit-Guided-Image-Synthesis-and-Editing-with-Stochastic-Differential-Equations|Meng et al. - 2022 - SDEdit Guided Image Synthesis and Editing with Stochastic Differential Equations]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Meng-et-al-2022-SDEdit-Guided-Image-Synthesis-and-Editing-with-Stochastic-Differential-Equations.md"
related_papers:
  - "papers/Meng-et-al-2022-SDEdit-Guided-Image-Synthesis-and-Editing-with-Stochastic-Differential-Equations.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-93f7c79782"
---
# Meng et al. - 2022 - SDEdit Guided Image Synthesis and Editing with Stochastic Differential Equations

- Source paper: [[papers/Meng-et-al-2022-SDEdit-Guided-Image-Synthesis-and-Editing-with-Stochastic-Differential-Equations|Meng et al. - 2022 - SDEdit Guided Image Synthesis and Editing with Stochastic Differential Equations]]
- Summary: To address these issues, we introduce a new image synthesis and editing method, Stochas- tic Differential Editing (SDEdit), based on a diffusion model generative prior, which synthesizes realistic images by iteratively denoising through a stochastic differential equation (SDE). To balance realism and faithfulness while avoiding the previously mentioned challenges, we intro- duce SDEdit, a guided image synthesis and editing framework leveraging generative stochastic dif- ferential equations (SDEs; Song et al., 2021). In image synthesis (Song et al., 2021), we suppose that x(0) ∼p0 = pdata represents a sample from the data distribution and that a forward SDE produces x(t) for t ∈(0, 1] via a Gaussian diffusion.
- Inputs: hidden state, time variable, ODE solver configuration, noisy sample, diffusion timestep, conditioning signal, model weights
- Outputs: continuous-depth hidden trajectory, predictions from ODE solver integration, denoised or generated sample conditioned on the input signal
- Assumptions: continuous-time dynamics and solver tolerances are appropriate for the modeled transformation, the conditioning signal and noise schedule match the intended generation distribution
- Provenance: p. 1; p. 3; p. 6
