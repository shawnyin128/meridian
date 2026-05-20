---
type: "method"
title: "Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems"
status: "draft"
sources:
  - "[[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems|Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems

- Source paper: [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems|Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems]]
- Summary: Trains a neural approximator with data loss plus PDE residual and boundary/initial-condition constraints for forward solution and inverse parameter tasks.
- Inputs: boundary/initial condition data, collocation points, PDE residual terms, neural network approximator
- Outputs: solution field approximation, identified PDE parameters, residual-constrained predictions
- Assumptions: the PDE residual, boundary conditions, and sampled collocation points match the physical system being modeled
- Provenance: p. 1; p. 3; p. 11
