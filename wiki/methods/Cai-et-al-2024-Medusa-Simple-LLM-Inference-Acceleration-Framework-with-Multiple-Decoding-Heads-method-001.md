---
type: "method"
title: "Cai et al. - 2024 - Medusa Simple LLM Inference Acceleration Framework with Multiple Decoding Heads"
status: "draft"
sources:
  - "[[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads|Cai et al. - 2024 - Medusa Simple LLM Inference Acceleration Framework with Multiple Decoding Heads]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
related_papers:
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-05434cbcdd"
---
# Cai et al. - 2024 - Medusa Simple LLM Inference Acceleration Framework with Multiple Decoding Heads

- Source paper: [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads|Cai et al. - 2024 - Medusa Simple LLM Inference Acceleration Framework with Multiple Decoding Heads]]
- Summary: To address this, we propose gener- ating multiple candidate continuations using the MEDUSA heads and verifying them concurrently through a simple adjustment to the attention mask. 2 MEDUSA: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads achieved by MEDUSA heads, (2) is realized by tree attention, and since MEDUSA heads are on top of the original model, the logits calculated in (2) can be used for substep (1) for the next decoding step. MEDUSA: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads Tianle Cai * 1 2 Yuhong Li * 3 Zhengyang Geng 4 Hongwu Peng 5 Jason D.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 5; p. 2; p. 3
