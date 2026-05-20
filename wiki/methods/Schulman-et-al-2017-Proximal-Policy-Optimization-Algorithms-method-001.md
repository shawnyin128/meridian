---
type: "method"
title: "Schulman et al. - 2017 - Proximal Policy Optimization Algorithms"
status: "draft"
sources:
  - "[[papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms|Schulman et al. - 2017 - Proximal Policy Optimization Algorithms]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms.md"
related_papers:
  - "papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-deefe37ef2"
---
# Schulman et al. - 2017 - Proximal Policy Optimization Algorithms

- Source paper: [[papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms|Schulman et al. - 2017 - Proximal Policy Optimization Algorithms]]
- Summary: Whereas standard policy gra- dient methods perform one gradient update per data sample, we propose a novel objective function that enables multiple epochs of minibatch updates. We propose a novel objective with clipped probability ratios, which forms a pessimistic estimate (i.e., lower bound) of the performance of the policy. The main objective we propose is the following: LCLIP (θ) = ˆEt h min(rt(θ) ˆAt, clip(rt(θ), 1 −ϵ, 1 + ϵ) ˆAt) i (7) where epsilon is a hyperparameter, say, ϵ = 0.2.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 1; p. 3; p. 2
