---
type: "method"
title: "Christiano et al. - 2023 - Deep reinforcement learning from human preferences"
status: "draft"
sources:
  - "[[papers/Christiano-et-al-2023-Deep-reinforcement-learning-from-human-preferences|Christiano et al. - 2023 - Deep reinforcement learning from human preferences]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Christiano et al. - 2023 - Deep reinforcement learning from human preferences

- Source paper: [[papers/Christiano-et-al-2023-Deep-reinforcement-learning-from-human-preferences|Christiano et al. - 2023 - Deep reinforcement learning from human preferences]]
- Summary: Preference-based reinforcement learning: A formal framework and a policy iteration algorithm. Interactively shaping agents via human reinforcement: The TAMER framework. We show that this approach can effectively solve complex RL tasks without access to the reward function, including Atari games and simulated robot locomotion, while providing feedback on less than 1% of our agent’s interactions with the environment.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 12; p. 8; p. 9
