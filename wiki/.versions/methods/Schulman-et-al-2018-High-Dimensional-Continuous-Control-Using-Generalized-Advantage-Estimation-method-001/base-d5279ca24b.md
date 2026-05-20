---
type: "method"
title: "Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation"
status: "draft"
sources:
  - "[[papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation|Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation

- Source paper: [[papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation|Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation]]
- Summary: We present experimental results on a number of highly challenging 3D locomotion tasks, where we show that our approach can learn complex gaits using high-dimensional, general purpose neural network function approximators for both the policy and the value function, each with over 104 parameters. Our approach yields strong empirical results on highly challenging 3D locomo- tion tasks, learning running gaits for bipedal and quadrupedal simulated robots, and learning a policy for getting the biped to stand up from starting out lying on the ground. We propose a family of policy gradient estimators that signiﬁcantly reduce variance while main- taining a tolerable level of bias.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 2; p. 7; p. 8
