---
type: "method"
title: "Yu et al. - 2025 - DAPO An Open-Source LLM Reinforcement Learning System at Scale"
status: "draft"
sources:
  - "[[papers/Yu-et-al-2025-DAPO-An-Open-Source-LLM-Reinforcement-Learning-System-at-Scale|Yu et al. - 2025 - DAPO An Open-Source LLM Reinforcement Learning System at Scale]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Yu et al. - 2025 - DAPO An Open-Source LLM Reinforcement Learning System at Scale

- Source paper: [[papers/Yu-et-al-2025-DAPO-An-Open-Source-LLM-Reinforcement-Learning-System-at-Scale|Yu et al. - 2025 - DAPO An Open-Source LLM Reinforcement Learning System at Scale]]
- Summary: Unlike previous works that withhold training details, we introduce four key techniques of our algorithm that make large-scale LLM RL a success. In addition, we open-source our training code, which is built on the verl framework a, along with a carefully curated and processed dataset. We propose the Decoupled Clip and Dynamic sAmpling Policy Optimization (DAPO) algorithm, and introduce 4 key techniques to make RL shine in the long-CoT RL scenario.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 1; p. 2; p. 4
