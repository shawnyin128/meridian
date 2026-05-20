---
type: "method"
title: "Chen et al. - 2019 - Neural Ordinary Differential Equations"
status: "draft"
sources:
  - "[[papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations|Chen et al. - 2019 - Neural Ordinary Differential Equations]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Chen et al. - 2019 - Neural Ordinary Differential Equations

- Source paper: [[papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations|Chen et al. - 2019 - Neural Ordinary Differential Equations]]
- Summary: We demonstrate these properties in continuous-depth residual networks and continuous-time latent variable models. Models such as residual networks, recurrent neural network decoders, and normalizing ﬂows build com- plicated transformations by composing a sequence of transformations to a hidden state: ht+1 = ht + f(ht, θt) (1) where t ∈{0 . 3 Replacing residual networks with ODEs for supervised learning In this section, we experimentally investigate the training of neural ODEs for supervised learning.
- Inputs: hidden state, time variable, ODE solver configuration
- Outputs: continuous-depth hidden trajectory, predictions from ODE solver integration
- Assumptions: continuous-time dynamics and solver tolerances are appropriate for the modeled transformation
- Provenance: p. 1; p. 3; p. 4
