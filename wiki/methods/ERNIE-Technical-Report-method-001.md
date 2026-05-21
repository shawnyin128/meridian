---
type: "method"
title: "ERNIE_Technical_Report"
status: "draft"
sources:
  - "[[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/ERNIE-Technical-Report.md"
related_papers:
  - "papers/ERNIE-Technical-Report.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-ec03c97679"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# ERNIE_Technical_Report

- Source paper: [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 2; p. 5; p. 8
