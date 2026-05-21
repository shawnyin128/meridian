# Continuous System Optimization Rounds

Created: 2026-05-21

## Round r0: Baseline

- Run: `eval/runs/continuous-system-optimization-r0`
- Purpose: establish current high-leverage retrieval baseline.
- Result: 6/6 pass.
- Metrics: recall@k 1.000, section hit 0.967, evidence hit 0.778, source-quality failure 0.

## Round r1: Synthesis Growth

- Run: `eval/runs/continuous-system-optimization-r1`
- Change: generated and published 30 additional synthesis pages from high-value method/topic clusters.
- Result: 6/6 pass.
- Finding: synthesis count improved, but audit semantics still overstated method-candidate warnings.

## Round r2: Consolidated Candidate Audit Semantics

- Run: `eval/runs/continuous-system-optimization-r2`
- Change: knowledge/concept audits now treat consolidated method candidates as suppressed candidate records.
- Result: knowledge audit no longer reports consolidated candidates as low-information method-family failures.
- Delta: knowledge findings 539 -> 55 at this stage.

## Round r3: Knowledge Repair and Synthesis Schema Semantics

- Run: `eval/runs/continuous-system-optimization-r3`
- Change: fixed wikilink source extraction, applied low-risk knowledge repair, and treated `syntheses/*.md` as synthesis schema even when `type` is `method-family` or `research-question`.
- Result: high-leverage eval stayed 6/6 pass.
- Delta: knowledge findings 55 -> 37; frontmatter and section gaps went to 0.

## Round r4: Continuous Eval Failure Repair

- Run before fix: `eval/runs/continuous-system-optimization-final`
- New eval: `eval/cases/continuous_system_optimization.jsonl`
- Failure: `continuous_claim_evidence_trace` missed required claim/evidence/concept coverage for a support-check query.
- Generalized fix:
  - evidence-trace intent detection
  - stronger claim/evidence route boost
  - risk-concept preselection
  - failure-mode intent terms for `weak` and `unsupported`
  - write-back provenance role split: all `sources` versus paper-only `source_papers`
- Run after fix: `eval/runs/continuous-system-optimization-r4`
- Result: 6/6 pass.

## Before / After

| Metric | Final before fix | Final after fix |
| --- | ---: | ---: |
| required_recall_at_k | 0.944 | 1.000 |
| MRR | 0.538 | 0.586 |
| section_hit_rate | 0.883 | 0.939 |
| evidence_hit_rate | 0.722 | 0.778 |
| hard_distractor_rate | 0.000 | 0.000 |
| source_quality_failure_rate | 0.000 | 0.000 |
| context_compactness | 0.177 | 0.159 |
| family_coverage | 0.944 | 1.000 |
| decisions | 5 pass / 1 fail | 6 pass |

## Convergence Decision

The loop is converged for this product stage. The remaining findings are visible, low-risk residuals rather than blockers for daily use:

- duplicate aliases need a future consolidation pass,
- one candidate claim still lacks evidence,
- concept coverage can continue to grow as real coding/debug tasks expose gaps.
