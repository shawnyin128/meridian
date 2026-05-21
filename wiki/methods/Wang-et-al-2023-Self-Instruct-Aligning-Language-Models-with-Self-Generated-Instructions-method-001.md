---
type: "method"
title: "Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions"
status: "draft"
sources:
  - "[[papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions|Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions.md"
related_papers:
  - "papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-fef833a41e"
consolidation_target: "methods/instruction-tuning"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions

- Source paper: [[papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions|Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions]]
- Summary: We introduce SELF-INSTRUCT, a framework for improving the instruction-following capabilities of pre- trained language models by bootstrapping off their own generations. Applying our method to the vanilla GPT3, we demonstrate a 33% abso- lute improvement over the original model on SUPER-NATURALINSTRUCTIONS, on par with the performance of InstructGPT001,1 which was trained with private user data and human annotations. In this work, we introduce SELF-INSTRUCT, a semi-automated process for instruction-tuning a pretrained LM using instructional signals from the model itself.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 2; p. 9; p. 1
