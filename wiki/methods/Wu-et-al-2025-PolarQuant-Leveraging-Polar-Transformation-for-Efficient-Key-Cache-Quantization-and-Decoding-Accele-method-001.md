---
type: "method"
title: "Wu et al. - 2025 - PolarQuant Leveraging Polar Transformation for Efficient Key Cache Quantization and Decoding Accele"
status: "draft"
sources:
  - "[[papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele|Wu et al. - 2025 - PolarQuant Leveraging Polar Transformation for Efficient Key Cache Quantization and Decoding Accele]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
related_papers:
  - "papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-c8486b6e6c"
---
# Wu et al. - 2025 - PolarQuant Leveraging Polar Transformation for Efficient Key Cache Quantization and Decoding Accele

- Source paper: [[papers/Wu-et-al-2025-PolarQuant-Leveraging-Polar-Transformation-for-Efficient-Key-Cache-Quantization-and-Decoding-Accele|Wu et al. - 2025 - PolarQuant Leveraging Polar Transformation for Efficient Key Cache Quantization and Decoding Accele]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 3; p. 11; p. 1
