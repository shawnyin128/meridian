---
type: "method"
title: "GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering"
status: "draft"
sources:
  - "[[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering|GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering

- Source paper: [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering|GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 4; p. 3; p. 5
