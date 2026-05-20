---
type: "method"
title: "Hu et al. - 2026 - Bridging Draft Policy Misalignment Group Tree Optimization for Speculative Decoding"
status: "draft"
sources:
  - "[[papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding|Hu et al. - 2026 - Bridging Draft Policy Misalignment Group Tree Optimization for Speculative Decoding]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Hu et al. - 2026 - Bridging Draft Policy Misalignment Group Tree Optimization for Speculative Decoding

- Source paper: [[papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding|Hu et al. - 2026 - Bridging Draft Policy Misalignment Group Tree Optimization for Speculative Decoding]]
- Summary: 3 GTO: GROUP TREE OPTIMIZATION To address the draft policy misalignment highlighted in Section 1, we introduce Group Tree Op- timization (GTO), a training framework that explicitly aligns the draft policy with decoding. Contributions: To address the draft policy misalignment, we propose Group Tree Optimization (GTO), a novel training algorithm for speculative decoding that explicitly optimizes the tree-based draft policy rather than a single greedy path. First, we introduce a draft-tree reward that directly aligns training with the decoding-time policy.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3; p. 2; p. 12
