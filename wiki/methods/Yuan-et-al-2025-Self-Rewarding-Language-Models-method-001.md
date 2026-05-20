---
type: "method"
title: "Yuan et al. - 2025 - Self-Rewarding Language Models"
status: "draft"
sources:
  - "[[papers/Yuan-et-al-2025-Self-Rewarding-Language-Models|Yuan et al. - 2025 - Self-Rewarding Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Yuan-et-al-2025-Self-Rewarding-Language-Models.md"
related_papers:
  - "papers/Yuan-et-al-2025-Self-Rewarding-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-1b118b2a19"
---
# Yuan et al. - 2025 - Self-Rewarding Language Models

- Source paper: [[papers/Yuan-et-al-2025-Self-Rewarding-Language-Models|Yuan et al. - 2025 - Self-Rewarding Language Models]]
- Summary: 1 Introduction Aligning Large Language Models (LLMs) using human preference data can vastly improve the instruction following performance of pretrained models [Ouyang et al., 2022, Bai et al., 2022a]. In both cases, the approach is bottlenecked by the size and quality of the human preference data, and in the case of RLHF the quality of the frozen reward model trained from them as well. The key to such an approach is to develop an agent that possesses all the abilities desired during training, rather than separating them out into distinct models such as a reward model and a language model.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 4
