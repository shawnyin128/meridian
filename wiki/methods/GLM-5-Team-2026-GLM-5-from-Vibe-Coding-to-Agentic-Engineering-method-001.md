---
type: "method"
title: "GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering"
status: "draft"
sources:
  - "[[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering|GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
related_papers:
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-b86ce6ab88"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering

- Source paper: [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering|GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 4; p. 3; p. 5
