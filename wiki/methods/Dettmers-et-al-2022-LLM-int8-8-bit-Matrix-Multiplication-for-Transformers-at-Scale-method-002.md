---
type: "method"
title: "Mixed-precision decomposition for outlier features"
status: "draft"
sources:
  - "[[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale|Dettmers et al. - 2022 - LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-002"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale.md"
related_papers:
  - "papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-912bf1e3ec"
consolidation_target: "methods/hardware-aware-quantization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Mixed-precision decomposition for outlier features

- Source paper: [[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale|Dettmers et al. - 2022 - LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale]]
- Summary: Separates sparse high-magnitude outlier feature dimensions into a higher-precision path while using int8 multiplication for the dense majority.
- Inputs: outlier feature threshold, hidden states, projection weights
- Outputs: int8 dense path, FP16 outlier path, combined output
- Assumptions: outlier dimensions are sparse enough that the FP16 path is cheap, the selected threshold preserves model quality across scale
- Provenance: p. 7; p. 1; p. 2
