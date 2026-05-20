---
type: "method"
title: "Xie et al. - 2022 - An Explanation of In-context Learning as Implicit Bayesian Inference"
status: "draft"
sources:
  - "[[papers/Xie-et-al-2022-An-Explanation-of-In-context-Learning-as-Implicit-Bayesian-Inference|Xie et al. - 2022 - An Explanation of In-context Learning as Implicit Bayesian Inference]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Xie et al. - 2022 - An Explanation of In-context Learning as Implicit Bayesian Inference

- Source paper: [[papers/Xie-et-al-2022-An-Explanation-of-In-context-Learning-as-Implicit-Bayesian-Inference|Xie et al. - 2022 - An Explanation of In-context Learning as Implicit Bayesian Inference]]
- Summary: In this paper, we introduce a simple pretraining distribution where in-context learning emerges. In our framework, a latent concept θ from a family of concepts Θ deﬁnes a distribution over observed tokens o from a vocabulary O.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration data
- Outputs: contextual token representations, sequence-model predictions
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, calibration data reflects the activation/weight behavior relevant to deployment
- Provenance: p. 2; p. 12; p. 1
