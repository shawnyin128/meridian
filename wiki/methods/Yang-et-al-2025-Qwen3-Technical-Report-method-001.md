---
type: "method"
title: "Yang et al. - 2025 - Qwen3 Technical Report"
status: "draft"
sources:
  - "[[papers/Yang-et-al-2025-Qwen3-Technical-Report|Yang et al. - 2025 - Qwen3 Technical Report]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Yang-et-al-2025-Qwen3-Technical-Report.md"
related_papers:
  - "papers/Yang-et-al-2025-Qwen3-Technical-Report.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-3452a93b8c"
consolidation_target: "methods/long-context-inference"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Yang et al. - 2025 - Qwen3 Technical Report

- Source paper: [[papers/Yang-et-al-2025-Qwen3-Technical-Report|Yang et al. - 2025 - Qwen3 Technical Report]]
- Summary: Meanwhile, we introduce YARN (Peng et al., 2023) and Dual Chunk Attention (DCA, An et al., 2024) to achieve a four-fold increase in sequence length capacity during inference. A key innovation in Qwen3 is the integration of thinking mode (for complex, multi-step reasoning) and non-thinking mode (for rapid, context-driven responses) into a unified framework. In this work, we introduce Qwen3, the latest series in our foundation model family, Qwen.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 4; p. 10; p. 1
