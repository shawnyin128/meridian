---
type: "method"
title: "Wang et al. - 2023 - Self-Consistency Improves Chain of Thought Reasoning in Language Models"
status: "draft"
sources:
  - "[[papers/Wang-et-al-2023-Self-Consistency-Improves-Chain-of-Thought-Reasoning-in-Language-Models|Wang et al. - 2023 - Self-Consistency Improves Chain of Thought Reasoning in Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Wang-et-al-2023-Self-Consistency-Improves-Chain-of-Thought-Reasoning-in-Language-Models.md"
related_papers:
  - "papers/Wang-et-al-2023-Self-Consistency-Improves-Chain-of-Thought-Reasoning-in-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-820df5a579"
---
# Wang et al. - 2023 - Self-Consistency Improves Chain of Thought Reasoning in Language Models

- Source paper: [[papers/Wang-et-al-2023-Self-Consistency-Improves-Chain-of-Thought-Reasoning-in-Language-Models|Wang et al. - 2023 - Self-Consistency Improves Chain of Thought Reasoning in Language Models]]
- Summary: In this paper, we propose a new decoding strategy, self-consistency, to replace the naive greedy decoding used in chain-of-thought prompting. We ﬁrst prompt the language model with chain-of-thought prompting, then instead of greedily decoding the optimal reasoning path, we propose a “sample-and-marginalize” decoding procedure: we ﬁrst sample from the language model’s decoder to generate a diverse set of reasoning paths; each reasoning path might lead to a different ﬁnal answer, so we determine the optimal answer by marginalizing out the sampled reasoning paths to ﬁnd the most consistent answer in the ﬁnal answer set. We propose that such a process can be simulated in language models via sampling from the language model’s decoder.
- Inputs: the source paper's target system or dataset, method assumptions from the cited method pages
- Outputs: the proposed analysis, method, or artifact, evaluation results tied to the paper's stated problem
- Assumptions: the paper's stated setting and evaluation protocol are the right scope for reusing the method
- Provenance: p. 1; p. 2
