---
type: "method"
title: "Huang et al. - 2022 - Large Language Models Can Self-Improve"
status: "draft"
sources:
  - "[[papers/Huang-et-al-2022-Large-Language-Models-Can-Self-Improve|Huang et al. - 2022 - Large Language Models Can Self-Improve]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Huang-et-al-2022-Large-Language-Models-Can-Self-Improve.md"
related_papers:
  - "papers/Huang-et-al-2022-Large-Language-Models-Can-Self-Improve.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-000df1092d"
consolidation_target: "methods/survey-synthesis"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Huang et al. - 2022 - Large Language Models Can Self-Improve

- Source paper: [[papers/Huang-et-al-2022-Large-Language-Models-Can-Self-Improve|Huang et al. - 2022 - Large Language Models Can Self-Improve]]
- Summary: We empirically verify our method using a pre-trained PaLM-540B LLM, where our method not only improves training task performances (74.4%→82.1% on GSM8K, 78.2%→83.0% on DROP, 90.0%→94.4% on OpenBookQA, and 63.4%→67.9% on ANLI-A3), but also enhances out-of-domain (OOD) test tasks (AQUA, StrategyQA, MNLI), achiev- ing state-of-the-art performances in many tasks without relying on supervised ground truth answers. Lastly, we conduct preliminary studies on self-generating additional input questions and few-shot CoT prompts, which could further reduce the amount of human effort required for model self- improving, and ablation studies on important hyperparameters of our approach. (2022) where we both propose to ﬁne-tune a model on self-generated CoT data, but our method does not require ground truth labels and shows stronger empirical results with multi-task generalization.
- Inputs: the source paper's target system or dataset, method assumptions from the cited method pages
- Outputs: the proposed analysis, method, or artifact, evaluation results tied to the paper's stated problem
- Assumptions: the page is useful as a synthesis map; individual claims still require checking cited primary evidence
- Provenance: p. 3
