---
type: "method"
title: "Massive activation localization and mechanism analysis"
status: "draft"
sources:
  - "[[papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models|Sun et al. - 2024 - Massive Activations in Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models.md"
related_papers:
  - "papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-ecf3175fbc"
---
# Massive activation localization and mechanism analysis

- Source paper: [[papers/Sun-et-al-2024-Massive-Activations-in-Large-Language-Models|Sun et al. - 2024 - Massive Activations in Large Language Models]]
- Summary: Identifies rare but extremely large activation dimensions/tokens across LLMs and studies their role in attention, bias-like behavior, and downstream model quality.
- Inputs: hidden states across layers/tokens, model families, intervention values
- Outputs: massive-activation locations, intervention effects, mechanism hypotheses
- Assumptions: massive activations are a model behavior to analyze, not a quantization method by itself, intervention experiments can reveal whether they are functionally important
- Provenance: p. 2; p. 8; p. 9
