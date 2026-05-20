---
type: "method"
title: "Ma et al. - 2026 - FIPO Eliciting Deep Reasoning with Future-KL Influenced Policy Optimization"
status: "draft"
sources:
  - "[[papers/Ma-et-al-2026-FIPO-Eliciting-Deep-Reasoning-with-Future-KL-Influenced-Policy-Optimization|Ma et al. - 2026 - FIPO Eliciting Deep Reasoning with Future-KL Influenced Policy Optimization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Ma et al. - 2026 - FIPO Eliciting Deep Reasoning with Future-KL Influenced Policy Optimization

- Source paper: [[papers/Ma-et-al-2026-FIPO-Eliciting-Deep-Reasoning-with-Future-KL-Influenced-Policy-Optimization|Ma et al. - 2026 - FIPO Eliciting Deep Reasoning with Future-KL Influenced Policy Optimization]]
- Summary: 4 FIPO In this section, we introduce the core framework of FutureKL-Induced Policy Optimization (FIPO). FIPO addresses this by incorporating discounted future-KL divergence into the policy update, creating a dense advantage formulation that re-weights tokens based on their influence on sub- sequent trajectory behavior. We open-source our training system, built on the verl framework.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 2; p. 5; p. 1
