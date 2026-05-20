---
type: "method"
title: "Schulman et al. - 2017 - Trust Region Policy Optimization"
status: "draft"
sources:
  - "[[papers/Schulman-et-al-2017-Trust-Region-Policy-Optimization|Schulman et al. - 2017 - Trust Region Policy Optimization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Schulman et al. - 2017 - Trust Region Policy Optimization

- Source paper: [[papers/Schulman-et-al-2017-Trust-Region-Policy-Optimization|Schulman et al. - 2017 - Trust Region Policy Optimization]]
- Summary: Instead, we introduce the following local approxi- mation to η: Lπ(˜π) = η(π) + X s ρπ(s) X a ˜π(a|s)Aπ(s, a). Trust region policy optimization, which we propose in the following section, is an approximation to Algorithm 1, which uses a constraint on the KL divergence rather than a penalty to robustly allow large updates. 6 Practical Algorithm Here we present two practical policy optimization algo- rithm based on the ideas above, which use either the single path or vine sampling scheme from the preceding section.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3; p. 1; p. 5
