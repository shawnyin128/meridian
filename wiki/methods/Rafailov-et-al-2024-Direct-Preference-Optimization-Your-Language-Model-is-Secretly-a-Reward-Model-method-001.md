---
type: "method"
title: "Rafailov et al. - 2024 - Direct Preference Optimization Your Language Model is Secretly a Reward Model"
status: "draft"
sources:
  - "[[papers/Rafailov-et-al-2024-Direct-Preference-Optimization-Your-Language-Model-is-Secretly-a-Reward-Model|Rafailov et al. - 2024 - Direct Preference Optimization Your Language Model is Secretly a Reward Model]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Rafailov-et-al-2024-Direct-Preference-Optimization-Your-Language-Model-is-Secretly-a-Reward-Model.md"
related_papers:
  - "papers/Rafailov-et-al-2024-Direct-Preference-Optimization-Your-Language-Model-is-Secretly-a-Reward-Model.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-fe9f88b720"
consolidation_target: "methods/policy-optimization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Rafailov et al. - 2024 - Direct Preference Optimization Your Language Model is Secretly a Reward Model

- Source paper: [[papers/Rafailov-et-al-2024-Direct-Preference-Optimization-Your-Language-Model-is-Secretly-a-Reward-Model|Rafailov et al. - 2024 - Direct Preference Optimization Your Language Model is Secretly a Reward Model]]
- Summary: Turns preference pairs and a reference-policy constraint into a direct policy objective, avoiding a separate online reward-model optimization loop.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 2; p. 3; p. 6
