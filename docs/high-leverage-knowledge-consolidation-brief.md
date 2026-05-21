# High-Leverage Knowledge Consolidation Brief

Created: 2026-05-21

## Goal

This pass targeted the main knowledge-layer bottleneck: method, concept, claim, and evidence records existed at scale, but method/probe/design retrieval could still be distracted by paper-specific method candidates and miss prerequisite concept context.

## What Changed

- Published method consolidation metadata for 239 paper-specific method candidate pages.
- Each consolidated method candidate now records:
  - `consolidation_target`
  - `candidate_scope`
  - `retrieval_visibility`
- Retrieval v1 now suppresses consolidated paper-specific method candidates unless the query has an exact identity match.
- Concept-layer repair now creates backlinks to existing concepts, not only newly proposed concepts.
- Published 62 low-risk method/topic/paper backlinks to existing concepts.
- Retrieval context now supports compact claim/evidence candidate pages by virtualizing source, support, reliability, and provenance sections.

## Before / After

| Area | Before | After |
| --- | ---: | ---: |
| Method candidates with consolidation target | 0 | 239 |
| Method candidates tagged for exact-identity-only retrieval | 0 | 239 |
| Concept backlinks added in this pass | 0 | 62 |
| Source-quality contamination findings | 0 | 0 |

## Retrieval Impact

The main functional change is not that pages disappeared. The canonical pages remain available and auditable. The change is that broad method/probe/design queries should now prefer method-family pages, prerequisite concepts, and supporting evidence over low-information paper-specific candidates.

The high-leverage retrieval eval confirms this effect: the method-family PTQ probe and speculative decoding probe cases moved from fail to pass under v1.

## Residuals

- `knowledge-audit` still reports 239 low-information method candidate pages. They are intentionally retained as provenance-bearing candidate records, but now have consolidation metadata and retrieval suppression.
- Concept audit still reports 96 warning findings because coverage is conservative. This is acceptable for MVP as long as concept pages are source-grounded and not low-information stubs.
- Claim/evidence records remain compact in many cases. Retrieval now handles them better, but future work should promote high-value recurring claims into richer canonical claim pages.

