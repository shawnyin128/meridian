---
type: "method"
title: "Shao et al. - 2024 - DeepSeekMath Pushing the Limits of Mathematical Reasoning in Open Language Models"
status: "draft"
sources:
  - "[[papers/Shao-et-al-2024-DeepSeekMath-Pushing-the-Limits-of-Mathematical-Reasoning-in-Open-Language-Models|Shao et al. - 2024 - DeepSeekMath Pushing the Limits of Mathematical Reasoning in Open Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Shao et al. - 2024 - DeepSeekMath Pushing the Limits of Mathematical Reasoning in Open Language Models

- Source paper: [[papers/Shao-et-al-2024-DeepSeekMath-Pushing-the-Limits-of-Mathematical-Reasoning-in-Open-Language-Models|Shao et al. - 2024 - DeepSeekMath Pushing the Limits of Mathematical Reasoning in Open Language Models]]
- Summary: Turns preference pairs and a reference-policy constraint into a direct policy objective, avoiding a separate online reward-model optimization loop.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 2; p. 11; p. 1
