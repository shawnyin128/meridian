# System Evaluation Agent MVP Review

Feature: System evaluation agent MVP

## Context/Test Plan

Goal: build a system-level evaluator that can score a real Meridian Paper Wiki use case, generate a judge packet, and assign mechanism-level repair buckets for continuous optimization.

Validation scope:

- rubric and case parseability
- `meridian wiki system-evaluate` artifact generation
- output schema fields
- hard fail detection for debug artifact leakage
- hard fail detection for source-quality contamination
- repair bucket assignment for retrieval/context/provenance/synthesis failures
- wiki lint/source-audit/catalog
- unit tests and compile checks
- Arbor process-state and AGENTS drift hooks

## Developer Round

Implementation artifacts:

- `src/meridian/wiki/system_eval.py`
- `meridian wiki system-evaluate`
- `eval/rubrics/system_evaluation_agent_quality.md`
- `eval/cases/system_evaluation_agent_mvp.jsonl`
- `docs/system-evaluation-agent-mvp.md`

The evaluator is deterministic in MVP form and emits `judge-packet.md` for Codex/Claude/API/local judge review.

## Evaluator Round

Evaluator evidence:

- Targeted system-evaluation tests passed:
  - schema/judge-packet artifact generation
  - debug artifact leakage hard fail
  - source-quality contamination hard fail
  - retrieval repair bucket assignment
  - rubric/case parseability
- Full unit suite passed: 104 tests.
- Real retrieval smoke passed against `eval/runs/continuous-system-optimization-final-rerun/continuous_claim_evidence_trace/context.v1.json`.
  - Output: `eval/runs/system-evaluation-agent-smoke/`
  - Decision: `pass`
  - Weighted score: `4.934`
  - Hard failures: `0`
  - Findings: `1` medium provenance-schema residual.

## Convergence Round

Converged for MVP because:

- The evaluator accepts real retrieval context, emits machine-readable JSON, readable Markdown, and a judge packet.
- Hard product-boundary failures are caught deterministically.
- Findings map to repair buckets and generalized fixes, making the artifact usable by the continuous optimization loop.
- The remaining smoke finding is a useful residual signal rather than a blocker: some compiled claim/evidence pages in the sampled context still lack complete provenance fields.

## Release Round

Release gate evidence:

- Unit suite: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m unittest discover -s tests` passed, 104 tests.
- Compile: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` passed.
- Diff hygiene: `git diff --check` passed.
- Wiki lint: `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki` passed.
- Source audit: `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki` passed with 238 sources, 0 missing, 0 SHA mismatch, 0 duplicate SHA groups.
- Catalog: `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki` passed with 236 paper entries and synthesis/knowledge catalogs rebuilt.
- System-evaluate smoke: passed with `decision=pass`.
- Arbor process-state: pass.
- AGENTS project-map drift hook: no update needed.
