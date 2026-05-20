---
type: "topic"
title: "learned quantization intervals"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
source_papers:
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
related_papers:
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss.md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
related_methods:
  - "quantization-aware training"
  - "learned quantization intervals"
  - "post-training quantization"
  - "calibration-aware PTQ"
  - "non-uniform weight quantization"
  - "hardware-aware quantization"
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-606cb477fa"
---
# learned quantization intervals

## Scope

This topic page compiles canonical paper pages around `learned quantization intervals`. It is a navigation and synthesis surface; paper-specific source facts remain in the linked pages.

## Key Papers

- [[papers/1808-05779v3]]
- [[papers/1909-13144v2]]
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss]]
- [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks]]

## Method Families

- [[methods/quantization-aware-training|quantization-aware training]]
- [[methods/learned-quantization-intervals|learned quantization intervals]]
- [[methods/post-training-quantization|post-training quantization]]
- [[methods/calibration-aware-PTQ|calibration-aware PTQ]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[methods/hardware-aware-quantization|hardware-aware quantization]]

## Claims

- [[papers/1808-05779v3|1808.05779v3]]: 1808.05779v3: Learns quantization interval parameters jointly with task loss so clipping/pruning and bit assignment are optimized for network accuracy instead of fixed min-max ranges. It operates on full-precision weight...
- [[papers/1909-13144v2|1909.13144v2]]: 1909.13144v2 is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or cache-budget constraint, then checks whether the retained cache still preserves long-context attention...
- [[papers/Jung-et-al-2018-Learning-to-Quantize-Deep-Networks-by-Optimizing-Quantization-Intervals-with-Task-Loss|Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss]]: Jung et al. - 2018 - Learning to Quantize Deep Networks by Optimizing Quantization Intervals with Task Loss: Learns quantization interval parameters jointly with task loss so clipping/pruning and bit assignment are optim...
- [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks]]: Li et al. - 2020 - Additive Powers-of-Two Quantization An Efficient Non-uniform Discretization for Neural Networks is a KV-cache compression method: it decides which cached key/value entries to retain under a memory or c...

## Contradictions

- No contradiction has been asserted automatically. Use knowledge repair proposals or refinement before publishing one.

## Retrieval Hooks

- Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `learned quantization intervals`.
