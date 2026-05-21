---
type: "method"
title: "Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge"
status: "draft"
sources:
  - "[[papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge|Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge.md"
related_papers:
  - "papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-89985b51c8"
consolidation_target: "methods/LLM-as-judge-reward-modeling"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge

- Source paper: [[papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge|Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge]]
- Summary: Turns preference pairs and a reference-policy constraint into a direct policy objective, avoiding a separate online reward-model optimization loop.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 11; p. 2; p. 1
