---
type: "method"
title: "Yao et al. - 2023 - ReAct Synergizing Reasoning and Acting in Language Models"
status: "draft"
sources:
  - "[[papers/Yao-et-al-2023-ReAct-Synergizing-Reasoning-and-Acting-in-Language-Models|Yao et al. - 2023 - ReAct Synergizing Reasoning and Acting in Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Yao-et-al-2023-ReAct-Synergizing-Reasoning-and-Acting-in-Language-Models.md"
related_papers:
  - "papers/Yao-et-al-2023-ReAct-Synergizing-Reasoning-and-Acting-in-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-9ee61cab7a"
---
# Yao et al. - 2023 - ReAct Synergizing Reasoning and Acting in Language Models

- Source paper: [[papers/Yao-et-al-2023-ReAct-Synergizing-Reasoning-and-Acting-in-Language-Models|Yao et al. - 2023 - ReAct Synergizing Reasoning and Acting in Language Models]]
- Summary: We apply our approach, named ReAct, to a diverse set of language and decision making tasks and demonstrate its effectiveness over state-of-the-art baselines in addition to improved human interpretability and trustworthiness. 2 REAC T: SYNERGIZING REASONING + ACTING Consider a general setup of an agent interacting with an environment for task solving. At time step t, an agent receives an observation ot ∈O from the environment and takes an action at ∈A following some policy π(at|ct), where ct = (o1, a1, · · · , ot−1, at−1, ot) is the context to the agent.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3
