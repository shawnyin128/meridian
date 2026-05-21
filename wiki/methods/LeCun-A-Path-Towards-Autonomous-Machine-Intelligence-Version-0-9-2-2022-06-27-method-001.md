---
type: "method"
title: "LeCun - A Path Towards Autonomous Machine Intelligence Version 0.9.2, 2022-06-27"
status: "draft"
sources:
  - "[[papers/LeCun-A-Path-Towards-Autonomous-Machine-Intelligence-Version-0-9-2-2022-06-27|LeCun - A Path Towards Autonomous Machine Intelligence Version 0.9.2, 2022-06-27]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/LeCun-A-Path-Towards-Autonomous-Machine-Intelligence-Version-0-9-2-2022-06-27.md"
related_papers:
  - "papers/LeCun-A-Path-Towards-Autonomous-Machine-Intelligence-Version-0-9-2-2022-06-27.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-b65149dbac"
consolidation_target: "methods/joint-embedding-predictive-learning"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# LeCun - A Path Towards Autonomous Machine Intelligence Version 0.9.2, 2022-06-27

- Source paper: [[papers/LeCun-A-Path-Towards-Autonomous-Machine-Intelligence-Version-0-9-2-2022-06-27|LeCun - A Path Towards Autonomous Machine Intelligence Version 0.9.2, 2022-06-27]]
- Summary: Learns video representations by predicting masked targets in latent space, then tests whether those representations transfer to perception or planning tasks.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 7; p. 1; p. 3
