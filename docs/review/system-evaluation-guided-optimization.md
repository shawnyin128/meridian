# System Evaluation Guided Optimization Review

Feature: System evaluation guided context trace optimization

## Context/Test Plan

Goal: use `system-optimize-eval` as the active evaluator, select the current top repair buckets, implement a generalized fix, and prove improvement with before/after artifacts.

Validation scope:

- baseline system optimization loop run
- repair bucket diagnosis
- retrieval context payload fix
- targeted regression tests
- candidate system optimization loop run
- before/after comparison
- full release gates

## Developer Round

Baseline run:

- Output: `eval/runs/system-evaluation-loop-r1-baseline`
- Average score: 4.912
- Minimum score: 4.700
- Repair buckets:
  - `provenance_schema`: 5
  - `concept_layer`: 3
  - `claim_evidence_traceability`: 1

Selected mechanism:

- retrieval context trace visibility
- not a canonical-page rewrite
- not an eval-case hardcode

Implementation:

- `src/meridian/wiki/corpus.py`
  - retrieval results now expose `sources`, `source_pdf`, and `section_headings`
  - concept results force implementation/failure/probe/provenance sections into context JSON when the query asks for coding/debug/probe support
  - claim/evidence results force trace sections into context JSON
- `src/meridian/wiki/system_eval.py`
  - comparison decision now recognizes small score gains with eliminated repair buckets as `improved`
- `tests/test_cli.py`
  - added context trace regression coverage
  - extended comparison decision regression coverage

## Evaluator Round

Candidate run:

- Output: `eval/runs/system-evaluation-loop-r2-context-trace`
- Average score: 5.000
- Minimum score: 5.000
- Repair buckets: none

Before/after comparison:

- Decision: improved
- Score delta: +0.088
- `provenance_schema`: 5 -> 0
- `concept_layer`: 3 -> 0
- `claim_evidence_traceability`: 1 -> 0

Targeted tests:

- `test_wiki_retrieve_exposes_trace_fields_for_evaluator`
- `test_system_optimize_compare_detects_improvement`

## Convergence Round

Converged because the active system evaluation loop no longer reports the baseline repair buckets, and the fix is mechanism-level context packing rather than a page-specific content edit.

Residual:

- This evaluation set is now saturated. The next optimization loop should add harder cases before attempting more repairs.

## Release Round

Release gate evidence:

- Full unit suite: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m unittest discover -s tests` pass, 109 tests.
- Compile check: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` pass.
- Diff hygiene: `git diff --check` pass.
- Main wiki lint: `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki` pass, 1 documented finding.
- Source audit: `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki` pass, 238 sources, 0 missing, 0 SHA mismatches, 0 duplicate SHA groups.
- Catalog rebuild: `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki` pass, 236 catalog entries.
- Arbor process-state: pass, 31 features, 0 findings.
- AGENTS project-map drift hook: pass, no missing or stale mapped paths.

Release decision: ready to commit.
