---
type: "method"
title: "Lyu et al. - 2023 - Faithful Chain-of-Thought Reasoning"
status: "draft"
sources:
  - "[[papers/Lyu-et-al-2023-Faithful-Chain-of-Thought-Reasoning|Lyu et al. - 2023 - Faithful Chain-of-Thought Reasoning]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Lyu et al. - 2023 - Faithful Chain-of-Thought Reasoning

- Source paper: [[papers/Lyu-et-al-2023-Faithful-Chain-of-Thought-Reasoning|Lyu et al. - 2023 - Faithful Chain-of-Thought Reasoning]]
- Summary: We propose Faithful CoT, a reasoning framework involving two stages: Translation (Natural Language query →sym- bolic reasoning chain) and Problem Solving (reasoning chain →answer), using an LM and a deterministic solver respectively. To address this concern, we propose Faithful CoT, a reasoning framework where the answer is the result of deterministically executing the rea- soning chain. Our key contributions are as follows: (a) We propose Faithful CoT, a framework that decomposes reasoning into Translation and Prob- lem Solving.
- Inputs: task state, agent policy or prompt, environment feedback
- Outputs: planned actions, task outcomes, interaction trace
- Assumptions: the environment, tools, and evaluation protocol expose the planning behavior the paper claims to study
- Provenance: p. 3; p. 1; p. 2
