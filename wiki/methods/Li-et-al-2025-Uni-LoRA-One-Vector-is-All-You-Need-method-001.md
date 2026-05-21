---
type: "method"
title: "Li et al. - 2025 - Uni-LoRA One Vector is All You Need"
status: "draft"
sources:
  - "[[papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need|Li et al. - 2025 - Uni-LoRA One Vector is All You Need]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need.md"
related_papers:
  - "papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-41d9bfd07b"
consolidation_target: "methods/paper-specific-research-method"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Li et al. - 2025 - Uni-LoRA One Vector is All You Need

- Source paper: [[papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need|Li et al. - 2025 - Uni-LoRA One Vector is All You Need]]
- Summary: To address the aforementioned limitations, we propose Uni-LoRA, a unified framework of LoRA that treats the LoRA parameter space as a high-dimensional vector space and performs a global projection into a shared low-dimensional subspace. Our contributions are summarized as follows: • We propose a unified framework to analyze various LoRA variants, and show that many of them (e.g., Tied-LoRA, VeRA, LoRA-XS, and VB-LoRA) can be interpreted as projecting trainable parameters from the full LoRA parameter space into structured low-dimensional subspaces. In this paper, we show that the parameter space reduction strategies employed by these LoRA variants can be formulated within a unified framework, Uni-LoRA, where the LoRA parameter space, flattened as a high- dimensional vector space RD, can be reconstructed through a projection from a subspace Rd, with d ≪D.
- Inputs: model weights
- Outputs: the proposed analysis, method, or artifact, evaluation results tied to the paper's stated problem
- Assumptions: the paper's stated setting and evaluation protocol are the right scope for reusing the method
- Provenance: p. 2; p. 4; p. 3
