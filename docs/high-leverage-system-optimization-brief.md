# High-Leverage System Optimization Brief

Created: 2026-05-21

## Summary

This optimization pass focused on three high-leverage areas instead of adding new modules:

1. Real task-driven synthesis/evolution.
2. Method/concept/claim knowledge consolidation.
3. Prompt/MCP entry validation.

The concrete result is that retrieval v1 now performs better on complex research and coding scenarios, the knowledge layer is less noisy for broad method queries, and MCP/Prompt entries have fresh end-to-end evidence.

## Main Improvements

### Synthesis / Evolution

- Refreshed 8 high-value synthesis pages with denser source-boundary and retrieval contracts.
- The refreshed pages now function as compiled synthesis targets rather than generic scaffolds.
- Synthesis pages remain canonical Markdown artifacts under `wiki/syntheses/`.

### Knowledge Consolidation

- Tagged 239 paper-specific method candidates with consolidation targets.
- Suppressed consolidated candidate records in retrieval unless there is an exact identity match.
- Added 62 concept backlinks to existing concepts.
- Added section-aware handling for compact claim/evidence candidate records.

### Retrieval Optimization

Final run: `eval/runs/high-leverage-system-optimization-r4/summary.md`

| Metric | v0 | optimized v1 | Delta |
| --- | ---: | ---: | ---: |
| required_recall_at_k | 0.681 | 1.000 | +0.319 |
| MRR | 0.410 | 0.595 | +0.185 |
| section_hit_rate | 0.817 | 0.967 | +0.150 |
| evidence_hit_rate | 0.722 | 0.778 | +0.056 |
| source_quality_failure_rate | 0.000 | 0.000 | 0.000 |
| redundancy_rate | 0.104 | 0.000 | -0.104 |
| family_coverage | 0.681 | 1.000 | +0.319 |

All 6 high-leverage eval cases passed under optimized v1.

### Entry Validation

- MCP client-style harness passed.
- Prompt/Skill entry remains the product-facing direct mode.
- MCP entry remains the tool/client integration mode.
- Both entries preserve canonical-corpus retrieval and block internal artifact reads.

## Generalized Fixes

The pass fixed mechanisms rather than individual pages:

- Tightened source-quality query detection to avoid routing ordinary source-paper queries into cleanup mode.
- Packed intent-required sections even when lexical section score is low.
- Added compact virtual sections for claim/evidence candidate pages.
- Suppressed consolidated method candidates during broad retrieval.
- Added concept backlink repair for existing concepts.
- Strengthened synthesis page body contracts.

## Current Residuals

- `knowledge-audit` remains warning-level because 239 compact method candidate records still exist. They are now consolidated and retrieval-suppressed, so this is no longer a retrieval blocker.
- `concept-audit` remains warning-level because prerequisite concept coverage is conservative. No source-quality contamination was found.
- Query intent coverage dipped slightly in the aggregate because context packets now prioritize required page families and sections over broad keyword spread. This tradeoff is acceptable for the high-leverage scenarios.
- A live external MCP client UI registration still needs a user-side config step, though the stdio harness and server tooling pass.

## Conclusion

The system is materially stronger than the previous product-maturity baseline. The biggest improvement is not page count; it is that complex research retrieval now returns a more complete mix of synthesis, method-family, concept, paper, claim, and evidence context with lower candidate noise and no source-quality leakage.

