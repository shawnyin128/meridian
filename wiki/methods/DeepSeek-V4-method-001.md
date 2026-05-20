---
type: "method"
title: "DeepSeek_V4"
status: "draft"
sources:
  - "[[papers/DeepSeek-V4|DeepSeek_V4]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# DeepSeek_V4

- Source paper: [[papers/DeepSeek-V4|DeepSeek_V4]]
- Summary: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, memory, and latency tradeoff at target context lengths.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 4; p. 2; p. 5
