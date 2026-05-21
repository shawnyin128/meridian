---
type: "method"
title: "LongRoPE context-window extension"
status: "draft"
sources:
  - "[[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
related_papers:
  - "papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-b0eb905a07"
consolidation_target: "methods/RoPE-scaling"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# LongRoPE context-window extension

- Source paper: [[papers/Ding-et-al-2024-LongRoPE-Extending-LLM-Context-Window-Beyond-2-Million-Tokens|Ding et al. - 2024 - LongRoPE Extending LLM Context Window Beyond 2 Million Tokens]]
- Summary: Searches and progressively extends RoPE scaling factors so an LLM can move from its original context window to very long contexts while preserving short-context quality.
- Inputs: RoPE dimensions, target context length, extension/search schedule, long-context calibration/evaluation data
- Outputs: extended-context LLM, RoPE scaling configuration
- Assumptions: positional interpolation/extrapolation quality can be preserved by staged scaling, short-context regression and long-context retrieval must both be evaluated
- Provenance: p. 1; p. 2; p. 3; p. 4
