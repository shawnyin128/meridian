---
type: "method"
title: "Source-quality triage"
status: "draft"
sources:
  - "[[papers/Download|Download]]"
confidence: "high"
review_state: "source_text_insufficient"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Download.md"
related_papers:
  - "papers/Download.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-768cc98fe1"
---
# Source-quality triage

- Source paper: [[papers/Download|Download]]
- Summary: Stops paper understanding when extracted text is too sparse or looks like a cover/scan placeholder, so the wiki does not convert a bad PDF into false paper knowledge.
- Inputs: PDF extraction text, page images, page-level word counts
- Outputs: source-quality hold, request for OCR or a cleaner PDF before knowledge promotion
- Assumptions: a retrieval-ready paper page requires enough source text or a later OCR/multimodal pass
- Provenance: p. 1
