---
type: "method"
title: "Feature-wise Linear Modulation"
status: "draft"
sources:
  - "[[papers/Perez-et-al-2017-FiLM-Visual-Reasoning-with-a-General-Conditioning-Layer|Perez et al. - 2017 - FiLM Visual Reasoning with a General Conditioning Layer]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Perez-et-al-2017-FiLM-Visual-Reasoning-with-a-General-Conditioning-Layer.md"
related_papers:
  - "papers/Perez-et-al-2017-FiLM-Visual-Reasoning-with-a-General-Conditioning-Layer.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-b757e75643"
consolidation_target: "methods/visual-reasoning"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Feature-wise Linear Modulation

- Source paper: [[papers/Perez-et-al-2017-FiLM-Visual-Reasoning-with-a-General-Conditioning-Layer|Perez et al. - 2017 - FiLM Visual Reasoning with a General Conditioning Layer]]
- Summary: Predicts per-feature affine modulation parameters from a conditioning input, then applies them inside a visual reasoning network so language can steer visual feature processing.
- Inputs: visual feature maps, question or conditioning embedding, per-channel gamma and beta
- Outputs: modulated visual features, conditioned reasoning behavior
- Assumptions: feature-wise affine modulation is expressive enough to inject question semantics, conditioning quality determines which visual features are emphasized or suppressed
- Provenance: p. 1; p. 2; p. 3; p. 4
