# System Evaluation Optimization Loop Review

Feature: System evaluation optimization loop

## Context/Test Plan

Goal: connect the System Evaluation Agent to a batch optimization loop that runs realistic use-wiki cases, aggregates repair buckets, selects top leverage candidates, and supports before/after comparison.

Validation scope:

- `system-optimize-eval` per-case artifact generation
- aggregate `summary.json`, `summary.md`, `repair-buckets.json`, `optimization_plan.md`, and aggregate `judge-packet.md`
- hard failure propagation into run summary
- before/after comparison
- eval case parseability
- full unit suite and compile checks
- wiki lint/source-audit/catalog
- Arbor process-state and AGENTS drift hook

## Developer Round

Implementation artifacts:

- `src/meridian/wiki/system_eval.py`
  - `run_system_optimization_eval`
  - `compare_system_optimization_runs`
  - repair bucket aggregation
  - top leverage candidate selection
  - optimization plan rendering
- `meridian wiki system-optimize-eval`
- `meridian wiki system-optimize-compare`
- `eval/cases/system_evaluation_optimization_loop.jsonl`
- `docs/system-evaluation-optimization-loop.md`

The runner reuses the existing retrieval v1 and `system-evaluate` implementation. It does not mutate canonical wiki pages.

## Evaluator Round

Targeted test evidence:

- `test_system_optimize_eval_writes_summary_repair_buckets_and_plan`
- `test_system_optimize_eval_propagates_hard_failures_to_summary`
- `test_system_optimize_compare_detects_improvement`
- `test_system_optimization_cases_are_parseable`

Real main-wiki smoke:

- Command: `PYTHONPATH=src python3 -m meridian wiki system-optimize-eval --wiki-root wiki --cases eval/cases/system_evaluation_optimization_loop.jsonl --out-dir eval/runs/system-evaluation-optimization-smoke --rubric eval/rubrics/system_evaluation_agent_quality.md --top-k 8 --strategy v1 --overwrite`
- Total cases: 7
- Decisions: 7 pass / 0 needs_refine / 0 fail
- Average score: 4.912
- Minimum score: 4.700
- Top repair buckets:
  - `provenance_schema`: 5 findings
  - `concept_layer`: 3 findings
  - `claim_evidence_traceability`: 1 finding
- Before/after comparison smoke wrote `comparison.json` and `comparison.md`.

## Convergence Round

Converged for MVP because:

- The loop now runs realistic use-wiki cases end to end: retrieval, context packet, selected pages, system evaluation, aggregation.
- It writes all required per-case and aggregate artifacts.
- Hard failures are preserved as summary data without preventing the batch runner from completing.
- The generated optimization plan points to mechanism-level fixes rather than page-level opinions.
- Before/after comparison can detect score, hard-failure, repair-bucket, dimension, and case-level deltas.

Residual:

- The loop recommends fixes but does not apply them automatically. That is intentional for MVP because wiki mutation should still go through proposal/lint/evolution paths.

## Release Round

Release gate evidence:

- Full unit suite: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m unittest discover -s tests` pass, 108 tests.
- Compile check: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` pass.
- Diff hygiene: `git diff --check` pass.
- Main wiki lint: `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki` pass, 1 documented finding.
- Source audit: `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki` pass, 238 sources, 0 missing, 0 SHA mismatches, 0 duplicate SHA groups.
- Catalog rebuild: `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki` pass, 236 catalog entries.
- Arbor process-state: pass, 30 features, 0 findings.
- AGENTS project-map drift hook: pass, no missing or stale mapped paths.

Release decision: ready to commit.
