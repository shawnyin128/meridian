# Continuous System Optimization Brief

Created: 2026-05-21

## Verdict

Meridian Paper Wiki completed a continuous high-leverage optimization loop. The system is not perfect, but current residuals are no longer MVP blockers: retrieval, write-back provenance, knowledge audits, concept audits, MCP entry, and source management all have current passing or documented-warning evidence.

## What Improved

1. **Audit quality is more truthful.**
   - Consolidated paper-specific method records are no longer treated as failed method-family pages.
   - Knowledge audit findings dropped from 539 to 37.
   - Low-information pages, section gaps, and frontmatter gaps are now 0.

2. **Support-check retrieval is stronger.**
   - A new continuous eval exposed a claim/evidence/concept failure.
   - Retrieval now recognizes evidence-trace intent and preserves claim/evidence/concept slots.
   - Continuous eval improved from 5/6 pass to 6/6 pass.

3. **Write-back provenance is cleaner.**
   - `sources` now means all retrieved canonical sources.
   - `source_papers` now means paper pages only.
   - This preserves a cleaner provenance chain for future synthesis/evolution/retrieval.

4. **Synthesis layer is larger and more useful.**
   - Canonical syntheses increased to 60.
   - Retrieval can now return synthesis + method/topic/concept/claim/evidence/paper context for mixed research intents.

## Current Metrics

Final continuous eval after repair: `eval/runs/continuous-system-optimization-r4/summary.md`

| Metric | Value |
| --- | ---: |
| required_recall_at_k | 1.000 |
| MRR | 0.586 |
| section_hit_rate | 0.939 |
| evidence_hit_rate | 0.778 |
| hard_distractor_rate | 0.000 |
| source_quality_failure_rate | 0.000 |
| context_compactness | 0.159 |
| redundancy_rate | 0.021 |
| family_coverage | 1.000 |
| decisions | 6 pass / 0 fail |

## Current Residuals

- `knowledge-audit`: warn with 37 findings.
- `duplicate_method_topic_alias_groups`: 35.
- `claims_without_evidence`: 1.
- `paper_without_outbound_links`: 1.
- `concept-audit`: pass, with info-only prerequisite coverage hints.
- External MCP client registration has harness evidence; live user-client registration remains a setup task.

## Next Highest Levers

1. Merge or suppress duplicate method/topic aliases where they create retrieval ambiguity.
2. Promote the highest-value claim/evidence chains into richer canonical claim pages.
3. Use real coding/debug tasks to grow prerequisite concept coverage instead of bulk-generating broad concepts.
