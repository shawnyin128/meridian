---
type: "method"
title: "Bodnar et al. - 2025 - A foundation model for the Earth system"
status: "draft"
sources:
  - "[[papers/Bodnar-et-al-2025-A-foundation-model-for-the-Earth-system|Bodnar et al. - 2025 - A foundation model for the Earth system]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Bodnar-et-al-2025-A-foundation-model-for-the-Earth-system.md"
related_papers:
  - "papers/Bodnar-et-al-2025-A-foundation-model-for-the-Earth-system.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-fda04d4616"
consolidation_target: "methods/transformer-architecture"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Bodnar et al. - 2025 - A foundation model for the Earth system

- Source paper: [[papers/Bodnar-et-al-2025-A-foundation-model-for-the-Earth-system|Bodnar et al. - 2025 - A foundation model for the Earth system]]
- Summary: Our approach uses low-rank adaptation (LoRA)53 to fine-tune all linear layers in the backbone’s self-attention opera- tions, allowing adaptation of very large models in a data-efficient and parameter-efficient manner. Here we introduce Aurora, a large-scale foundation model trained on more than one million hours of diverse geophysical data. In this paper, we introduce Aurora, a foundation model for the Earth system, capable of tackling a variety of forecasting tasks.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 9; p. 10; p. 2
