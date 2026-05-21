# Continuous System Bottleneck Map

Created: 2026-05-21

## Current Snapshot

- Main wiki: `wiki/`
- Papers: 236
- Syntheses: 60
- Methods: 302
- Topics: 91
- Concepts: 24
- Claims: 1135
- Evidence pages: 2737
- Source audit: clean, 238 managed sources, 0 missing, 0 SHA mismatch, 0 duplicate SHA groups
- MCP harness: pass

## Bottleneck Map

| Area | Current state | Evidence | Product impact |
| --- | --- | --- | --- |
| Retrieval | Passes high-leverage and continuous eval after r4/rerun | Continuous eval v1: 6/6 pass, recall@k 1.000, section hit 0.939 | Usable for research/coding context; remaining quality is mostly corpus density rather than ranking failure |
| Synthesis | Grew from 30 to 60 pages | `wiki/syntheses/`, synthesis catalog | Stronger compiled context, but some pages remain scaffold-like and should evolve through real use |
| Knowledge layer | Warn with 37 findings | `wiki/.index/knowledge-audit.json` | No hard source-boundary failure; residual duplicate aliases and one unsupported claim remain |
| Concept layer | Pass with info-only coverage hints | `wiki/.index/concept-audit.json` | Concepts are source-grounded and useful; prerequisite coverage remains conservative |
| Provenance schema | Fixed source role separation for write-back | Tests and knowledge audit | `sources` can include compiled pages; `source_papers` now means paper pages only |
| Entry/MCP | Harness pass | `wiki/.index/mcp-continuous-harness.json` | Ready for client-style use; live external UI registration remains a user-side step |
| Evaluation | Added continuous optimization cases | `eval/cases/continuous_system_optimization.jsonl` | Better coverage of synthesis, claim/evidence trace, concepts, domain generality, and product entry boundaries |

## Top 3 Levers Chosen

1. **Audit signal quality for consolidated method records**
   - Why: 239 compact method records were counted as low-information canonical method failures even after consolidation.
   - Fix: Treat consolidated/suppressed method candidates as candidate records, not failed compiled method-family pages.
   - Evidence: Knowledge audit findings dropped from 539 to 37; low-information and required-section gaps are 0.

2. **Claim/evidence trace retrieval robustness**
   - Why: The new continuous eval exposed a real failure where a support-check query missed required claim/evidence/concept coverage.
   - Fix: Add evidence-trace intent routing, stronger claim/evidence boost, risk-concept slotting, and `weak` / `unsupported` failure-mode intent terms.
   - Evidence: Continuous eval improved from 5/6 to 6/6; recall@k 0.944 -> 1.000; section hit 0.883 -> 0.939.

3. **Write-back provenance role separation**
   - Why: Synthesis write-back could treat non-paper compiled pages as `source_papers`, weakening downstream trace semantics.
   - Fix: Separate all retrieved `sources` from paper-only `source_papers`; add tests and audit normalization support.
   - Evidence: Regression test enforces paper-only `source_papers`; knowledge audit reports 0 syntheses with non-paper `source_papers`.

## Residuals

- `duplicate_method_topic_alias_groups`: 35. This is a consolidation quality issue, not an immediate retrieval blocker.
- `claims_without_evidence`: 1. It should remain visible as a candidate for contradiction/stale review.
- `paper_without_outbound_links`: 1, currently the STS paper. This is low risk and can be fixed in the next ingestion/evolution pass.
- Concept prerequisite coverage is intentionally conservative: 31 of 63 non-candidate method pages have prerequisite concepts.

