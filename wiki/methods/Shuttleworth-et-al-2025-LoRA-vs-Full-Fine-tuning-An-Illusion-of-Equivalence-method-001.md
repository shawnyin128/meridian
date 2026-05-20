---
type: "method"
title: "Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence"
status: "draft"
sources:
  - "[[papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence|Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence.md"
related_papers:
  - "papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-9d54ffda4f"
---
# Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence

- Source paper: [[papers/Shuttleworth-et-al-2025-LoRA-vs-Full-Fine-tuning-An-Illusion-of-Equivalence|Shuttleworth et al. - 2025 - LoRA vs Full Fine-tuning An Illusion of Equivalence]]
- Summary: Other work has also proposed low rank manipulations to the activations instead of the weights [Wu et al., 2024]. a) We measure the changes to the SVD of the pre-trained weights made during fine-tuning. Low Rank Adaptation (LoRA; Hu et al., 2021), which represents the update to the weights as a product of two low-rank matrices, reduces computation and memory requirements relative to full fine-tuning.
- Inputs: task state, agent policy or prompt, environment feedback, calibration or runtime activations, model weights
- Outputs: planned actions, task outcomes, interaction trace, low-bit quantized model representation, rotation-transformed equivalent model
- Assumptions: the environment, tools, and evaluation protocol expose the planning behavior the paper claims to study
- Provenance: p. 3; p. 11; p. 4
