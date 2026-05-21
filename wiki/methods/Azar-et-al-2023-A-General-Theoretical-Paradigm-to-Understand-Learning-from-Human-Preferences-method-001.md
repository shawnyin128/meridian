---
type: "method"
title: "Azar et al. - 2023 - A General Theoretical Paradigm to Understand Learning from Human Preferences"
status: "draft"
sources:
  - "[[papers/Azar-et-al-2023-A-General-Theoretical-Paradigm-to-Understand-Learning-from-Human-Preferences|Azar et al. - 2023 - A General Theoretical Paradigm to Understand Learning from Human Preferences]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Azar-et-al-2023-A-General-Theoretical-Paradigm-to-Understand-Learning-from-Human-Preferences.md"
related_papers:
  - "papers/Azar-et-al-2023-A-General-Theoretical-Paradigm-to-Understand-Learning-from-Human-Preferences.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-70bcd0a2ba"
consolidation_target: "methods/policy-optimization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Azar et al. - 2023 - A General Theoretical Paradigm to Understand Learning from Human Preferences

- Source paper: [[papers/Azar-et-al-2023-A-General-Theoretical-Paradigm-to-Understand-Learning-from-Human-Preferences|Azar et al. - 2023 - A General Theoretical Paradigm to Understand Learning from Human Preferences]]
- Summary: Recently, Direct Preference Optimisa- tion (DPO) has been proposed as an approach that bypasses the second approximation and learn directly a policy from collected data without the reward modelling stage. It consists in first collecting large amounts of data where each datum is composed of a context, pairs of continuations of the context, also called generations, and a pairwise human preference that indicates which generation is the best. Furthermore recent works such as direct preference op- timisation (DPO, Rafailov et al., 2023) and (SLiC-HF, Zhao et al., 2023) have shown that it is possible to optimize the bandit policy directly from human pref- erences without learning a reward model.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 11
