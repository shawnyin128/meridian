---
type: "method"
title: "Gao et al. - 2025 - Soft Adaptive Policy Optimization"
status: "draft"
sources:
  - "[[papers/Gao-et-al-2025-Soft-Adaptive-Policy-Optimization|Gao et al. - 2025 - Soft Adaptive Policy Optimization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Gao-et-al-2025-Soft-Adaptive-Policy-Optimization.md"
related_papers:
  - "papers/Gao-et-al-2025-Soft-Adaptive-Policy-Optimization.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-bd87741047"
consolidation_target: "methods/paper-specific-research-method"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Gao et al. - 2025 - Soft Adaptive Policy Optimization

- Source paper: [[papers/Gao-et-al-2025-Soft-Adaptive-Policy-Optimization|Gao et al. - 2025 - Soft Adaptive Policy Optimization]]
- Summary: We propose Soft Adaptive Policy Optimization (SAPO), which replaces hard clipping with a smooth, temperature-controlled gate that adaptively atten- uates off-policy updates while preserving useful learning signals. When a sequence contains a few highly off-policy tokens, GSPO suppresses all gradients for that sequence, whereas SAPO selectively down-weights only the offending tokens and preserves the learning signal from the near-on-policy ones, improving sample efficiency. SAPO weights token-level updates by a bounded, sigmoid-shaped function of the importance ratio, centered at the on-policy point.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3; p. 2; p. 4
