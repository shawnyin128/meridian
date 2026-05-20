---
type: "method"
title: "Affinity-Guided Quantization"
status: "draft"
sources:
  - "[[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa|Hu et al. - 2025 - MoEQuant Enhancing Quantization for Mixture-of-Experts Large Language Models via Expert-Balanced Sa]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-002"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
related_papers:
  - "papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-4e357041ed"
---
# Affinity-Guided Quantization

- Source paper: [[papers/Hu-et-al-2025-MoEQuant-Enhancing-Quantization-for-Mixture-of-Experts-Large-Language-Models-via-Expert-Balanced-Sa|Hu et al. - 2025 - MoEQuant Enhancing Quantization for Mixture-of-Experts Large Language Models via Expert-Balanced Sa]]
- Summary: Uses affinities between samples and experts to weight quantization impact, so different experts are calibrated according to the samples that actually affect them.
- Inputs: expert-sample affinities, MoE layer weights, calibration samples
- Outputs: affinity-weighted expert quantization
- Assumptions: sample-expert affinity identifies which calibration examples matter for each expert, expert-specific weighting improves quantization over treating MoE layers as dense layers
- Provenance: p. 1; p. 2; p. 4; p. 6
