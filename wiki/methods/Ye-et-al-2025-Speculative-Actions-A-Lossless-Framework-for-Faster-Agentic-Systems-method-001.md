---
type: "method"
title: "Ye et al. - 2025 - Speculative Actions A Lossless Framework for Faster Agentic Systems"
status: "draft"
sources:
  - "[[papers/Ye-et-al-2025-Speculative-Actions-A-Lossless-Framework-for-Faster-Agentic-Systems|Ye et al. - 2025 - Speculative Actions A Lossless Framework for Faster Agentic Systems]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Ye-et-al-2025-Speculative-Actions-A-Lossless-Framework-for-Faster-Agentic-Systems.md"
related_papers:
  - "papers/Ye-et-al-2025-Speculative-Actions-A-Lossless-Framework-for-Faster-Agentic-Systems.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-dcf6787e00"
---
# Ye et al. - 2025 - Speculative Actions A Lossless Framework for Faster Agentic Systems

- Source paper: [[papers/Ye-et-al-2025-Speculative-Actions-A-Lossless-Framework-for-Faster-Agentic-Systems|Ye et al. - 2025 - Speculative Actions A Lossless Framework for Faster Agentic Systems]]
- Summary: Speculates future agent actions with a fast path and uses a slower trusted executor or verifier to commit or roll back the action trace.
- Inputs: agent state, candidate future actions, fast speculative model, slow ground-truth executor or verifier
- Outputs: tentatively executed action trace, verified committed actions, latency or wall-clock speedup
- Assumptions: speculated actions can be checked or rolled back so faster execution remains lossless with respect to the ground-truth executor
- Provenance: p. 2; p. 3; p. 4
