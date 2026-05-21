---
type: "method"
title: "Guan et al. - 2025 - Dynamic Speculative Agent Planning"
status: "draft"
sources:
  - "[[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning|Guan et al. - 2025 - Dynamic Speculative Agent Planning]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
related_papers:
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-76379127f9"
consolidation_target: "methods/agent-workflow-modeling"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Guan et al. - 2025 - Dynamic Speculative Agent Planning

- Source paper: [[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning|Guan et al. - 2025 - Dynamic Speculative Agent Planning]]
- Summary: In this paper, we propose Dynamic Speculative Planning (DSP), a lossless, user-controllable agent planning acceleration framework that requires no pre-deployment preparation. To address these gaps, we introduce Dynamic Speculative Planning (DSP), an asynchronous online reinforcement learning framework that provides lossless acceleration with substantially reduced costs without requiring additional pre-deployment preparation. Our work bridges this gap by introducing a lossless self-optimizing, zero-setup framework based on speculative execution that can adaptively balance latency reduction against operational costs, providing the first comprehensive solution for deploying accelerated LLM agents in diverse real-world contexts with varying efficiency requirements.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3; p. 1; p. 2
