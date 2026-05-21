---
type: "method"
title: "Zuo et al. - 2025 - TTRL Test-Time Reinforcement Learning"
status: "draft"
sources:
  - "[[papers/Zuo-et-al-2025-TTRL-Test-Time-Reinforcement-Learning|Zuo et al. - 2025 - TTRL Test-Time Reinforcement Learning]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Zuo-et-al-2025-TTRL-Test-Time-Reinforcement-Learning.md"
related_papers:
  - "papers/Zuo-et-al-2025-TTRL-Test-Time-Reinforcement-Learning.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e2d541cc0b"
consolidation_target: "methods/test-time-reinforcement-learning"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Zuo et al. - 2025 - TTRL Test-Time Reinforcement Learning

- Source paper: [[papers/Zuo-et-al-2025-TTRL-Test-Time-Reinforcement-Learning|Zuo et al. - 2025 - TTRL Test-Time Reinforcement Learning]]
- Summary: Applies reinforcement-learning style updates at test time, so evaluation must separate task reward, rollout/update behavior, and inference-time cost.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3; p. 8; p. 10
