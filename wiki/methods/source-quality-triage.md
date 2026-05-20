---
type: "method"
title: "source-quality triage"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Download.md"
source_papers:
  - "papers/Download.md"
related_papers:
  - "papers/Download.md"
related_methods:
related_topics:
  - "source text extraction"
  - "paper source quality"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-bb75752703"
---
# source-quality triage

## What It Is

This is a compiled method-family page for `source-quality triage`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Download|Download]]: ### Source-quality triage - Purpose: Stops paper understanding when extracted text is too sparse or looks like a cover/scan placeholder, so the wiki does not convert a bad PDF into false paper knowledge. - Operates on: PDF extraction text;...

## Used By Papers

- [[papers/Download]]

## Implementation Hooks

- [[papers/Download|Download]]: - Run OCR or provide a cleaner PDF, then rerun `meridian wiki ingest` before reviewing paper content. - Use page images only for source triage unless a multimodal/OCR pass is explicitly available. - Record the failure bu...

## Failure Modes

- [[papers/Download|Download]]: - This is not a content limitation of the paper; it is a source-quality limitation of the available PDF. - Retrieval should find this page only for source cleanup or missing-OCR triage, not for research synthesis. Open q...

## Evidence

- [[papers/Download|Download]]: Evidence takeaways: - Evidence is limited to extraction quality; no scientific claim, method, or result should be promoted from this file. Claim candidates: - `claim-001`: Scientific claims are on source-quality hold bec...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
