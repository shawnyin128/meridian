---
type: "method"
title: "Wu 等 - 2025 - LONGMEMEVAL BENCHMARKING CHAT ASSIST- ANTS ON LONG-TERM INTERACTIVE MEMORY"
status: "draft"
sources:
  - "[[papers/Wu-2025-LONGMEMEVAL-BENCHMARKING-CHAT-ASSIST-ANTS-ON-LONG-TERM-INTERACTIVE-MEMORY|Wu 等 - 2025 - LONGMEMEVAL BENCHMARKING CHAT ASSIST- ANTS ON LONG-TERM INTERACTIVE MEMORY]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Wu 等 - 2025 - LONGMEMEVAL BENCHMARKING CHAT ASSIST- ANTS ON LONG-TERM INTERACTIVE MEMORY

- Source paper: [[papers/Wu-2025-LONGMEMEVAL-BENCHMARKING-CHAT-ASSIST-ANTS-ON-LONG-TERM-INTERACTIVE-MEMORY|Wu 等 - 2025 - LONGMEMEVAL BENCHMARKING CHAT ASSIST- ANTS ON LONG-TERM INTERACTIVE MEMORY]]
- Summary: We introduce LONGMEMEVAL, a comprehensive benchmark designed to evaluate five core long-term memory abilities of chat assistants: information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention. We then present a unified framework that breaks down the long-term memory design into three stages: indexing, retrieval, and reading. Built upon key experimental insights, we propose several memory design optimizations including session decomposition for value granularity, fact-augmented key expansion for indexing, and time-aware query expansion for refining the search scope.
- Inputs: long sequence tokens, positional encoding or attention state
- Outputs: extended-context model behavior or evaluation results
- Assumptions: quality must be checked at the target context lengths, not inferred from short-context behavior
- Provenance: p. 10; p. 1
