---
type: "method"
title: "D'Oosterlinck et al. - 2024 - Anchored Preference Optimization and Contrastive Revisions Addressing Underspecification in Alignme"
status: "draft"
sources:
  - "[[papers/D-Oosterlinck-et-al-2024-Anchored-Preference-Optimization-and-Contrastive-Revisions-Addressing-Underspecification-in-Alignme|D'Oosterlinck et al. - 2024 - Anchored Preference Optimization and Contrastive Revisions Addressing Underspecification in Alignme]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/D-Oosterlinck-et-al-2024-Anchored-Preference-Optimization-and-Contrastive-Revisions-Addressing-Underspecification-in-Alignme.md"
related_papers:
  - "papers/D-Oosterlinck-et-al-2024-Anchored-Preference-Optimization-and-Contrastive-Revisions-Addressing-Underspecification-in-Alignme.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-7ebd5271ce"
---
# D'Oosterlinck et al. - 2024 - Anchored Preference Optimization and Contrastive Revisions Addressing Underspecification in Alignme

- Source paper: [[papers/D-Oosterlinck-et-al-2024-Anchored-Preference-Optimization-and-Contrastive-Revisions-Addressing-Underspecification-in-Alignme|D'Oosterlinck et al. - 2024 - Anchored Preference Optimization and Contrastive Revisions Addressing Underspecification in Alignme]]
- Summary: Turns preference pairs and a reference-policy constraint into a direct policy objective, avoiding a separate online reward-model optimization loop.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 5; p. 9; p. 4
