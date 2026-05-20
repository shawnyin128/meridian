---
type: "method"
title: "Zuo et al. - 2025 - TTRL Test-Time Reinforcement Learning"
status: "draft"
sources:
  - "[[papers/Zuo-et-al-2025-TTRL-Test-Time-Reinforcement-Learning|Zuo et al. - 2025 - TTRL Test-Time Reinforcement Learning]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Zuo et al. - 2025 - TTRL Test-Time Reinforcement Learning

- Source paper: [[papers/Zuo-et-al-2025-TTRL-Test-Time-Reinforcement-Learning|Zuo et al. - 2025 - TTRL Test-Time Reinforcement Learning]]
- Summary: Applies reinforcement-learning style updates at test time, so evaluation must separate task reward, rollout/update behavior, and inference-time cost.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3; p. 8; p. 10
