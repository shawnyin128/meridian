---
type: "method"
title: "Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models"
status: "draft"
sources:
  - "[[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models|Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models.md"
related_papers:
  - "papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-27eeff54b0"
---
# Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models

- Source paper: [[papers/Sun-et-al-2023-Retentive-Network-A-Successor-to-Transformer-for-Large-Language-Models|Sun et al. - 2023 - Retentive Network A Successor to Transformer for Large Language Models]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 2; p. 1; p. 3
