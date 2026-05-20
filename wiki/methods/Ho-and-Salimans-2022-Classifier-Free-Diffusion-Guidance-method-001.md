---
type: "method"
title: "Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance"
status: "draft"
sources:
  - "[[papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance|Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance

- Source paper: [[papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance|Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance]]
- Summary: 1 INTRODUCTION Diffusion models have recently emerged as an expressive and ﬂexible family of generative models, delivering competitive sample quality and likelihood scores on image and audio synthesis tasks (Sohl- Dickstein et al., 2015; Song & Ermon, 2019; Ho et al., 2020; Song et al., 2021b; Kingma et al., 2021; Song et al., 2021a). Classiﬁer guidance combines the score estimate of a diffusion model with the gradient of an image classiﬁer and thereby requires training an image classiﬁer separate from the diffusion model. We show that guidance can be indeed performed by a pure generative model without such a classiﬁer: in what we call classiﬁer-free guidance, we jointly train a conditional and an unconditional diffusion model, and we combine the resulting conditional and unconditional score estimates to attain a trade-off between sample quality and diversity similar to that obtained using classiﬁer guidance.
- Inputs: noisy sample, diffusion timestep, conditioning signal
- Outputs: denoised or generated sample conditioned on the input signal
- Assumptions: the conditioning signal and noise schedule match the intended generation distribution
- Provenance: p. 4; p. 3; p. 5
