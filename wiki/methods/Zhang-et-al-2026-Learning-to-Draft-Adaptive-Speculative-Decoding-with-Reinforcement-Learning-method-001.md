---
type: "method"
title: "Zhang et al. - 2026 - Learning to Draft Adaptive Speculative Decoding with Reinforcement Learning"
status: "draft"
sources:
  - "[[papers/Zhang-et-al-2026-Learning-to-Draft-Adaptive-Speculative-Decoding-with-Reinforcement-Learning|Zhang et al. - 2026 - Learning to Draft Adaptive Speculative Decoding with Reinforcement Learning]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Zhang-et-al-2026-Learning-to-Draft-Adaptive-Speculative-Decoding-with-Reinforcement-Learning.md"
related_papers:
  - "papers/Zhang-et-al-2026-Learning-to-Draft-Adaptive-Speculative-Decoding-with-Reinforcement-Learning.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-319e569bc6"
---
# Zhang et al. - 2026 - Learning to Draft Adaptive Speculative Decoding with Reinforcement Learning

- Source paper: [[papers/Zhang-et-al-2026-Learning-to-Draft-Adaptive-Speculative-Decoding-with-Reinforcement-Learning|Zhang et al. - 2026 - Learning to Draft Adaptive Speculative Decoding with Reinforcement Learning]]
- Summary: We build our method upon the state-of-the-art Eagle3 framework, training our policies to replace its static heuristics with a dynamic, context-aware decision-making process. • Co-adaptive policy framework: Instead of treating the drafting and verification phases as indepen- dent problems, we propose a jointly trained, co-adaptive policy framework where two policies learn to dynamically coordinate to each phase. To address these limitations, we introduce Learning to Draft (LTD), a novel method that directly optimizes for throughput of each draft-and-verify cycle.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3; p. 2; p. 5
