---
type: "method"
title: "Block-wise rounding search for LVLM PTQ"
status: "draft"
sources:
  - "[[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
related_papers:
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-82abf3127c"
---
# Block-wise rounding search for LVLM PTQ

- Source paper: [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al. - 2025 - Q-VLM Post-training Quantization for Large Vision-Language Models]]
- Summary: Searches quantized rounding functions block by block for large vision-language models, using output quantization error to keep multimodal reasoning accurate under low-bit weights/activations.
- Inputs: LVLM blocks, calibration multimodal samples, candidate rounding functions
- Outputs: low-bit LVLM, selected rounding functions, memory/speed reduction
- Assumptions: block output error is a useful proxy for downstream multimodal reasoning quality, the calibration set covers vision-language activation behavior
- Provenance: p. 1; p. 2; p. 6; p. 7
