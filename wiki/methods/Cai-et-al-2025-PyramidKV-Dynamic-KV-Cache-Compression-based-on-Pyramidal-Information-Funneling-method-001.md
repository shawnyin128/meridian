---
type: "method"
title: "Cai et al. - 2025 - PyramidKV Dynamic KV Cache Compression based on Pyramidal Information Funneling"
status: "draft"
sources:
  - "[[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling|Cai et al. - 2025 - PyramidKV Dynamic KV Cache Compression based on Pyramidal Information Funneling]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Cai et al. - 2025 - PyramidKV Dynamic KV Cache Compression based on Pyramidal Information Funneling

- Source paper: [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling|Cai et al. - 2025 - PyramidKV Dynamic KV Cache Compression based on Pyramidal Information Funneling]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: KV-cache tensors, retention or compression budget, decode-time attention state, sequence-length target
- Outputs: compressed or filtered KV-cache representation, memory/latency profile, long-context quality measurements
- Assumptions: retained cache entries preserve the information needed for downstream attention at the tested context length
- Provenance: p. 1; p. 3; p. 4
