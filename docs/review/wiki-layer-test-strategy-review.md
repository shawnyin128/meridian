---
type: review
title: "Wiki Layer Test Strategy Review"
status: done
created: 2026-05-20
updated: 2026-05-20
tags:
  - arbor
  - paper-wiki
  - evaluation
---

# Wiki Layer Test Strategy Review

## Context/Test Plan

Goal: design test schemes for the Paper Wiki layer after the full source/canonical/retrieval foundation landed.

Acceptance criteria:

- Define deterministic tests for source management, canonical wiki management, artifact schemas, and CLI flows.
- Define scenario-based retrieval evaluation that uses plausible standalone research requests.
- Define LLM-as-Judge rubric coverage for retrieval context packets.
- Define human calibration and release gates.
- Add durable project artifacts that can guide later implementation.

Verification scope:

- Documentation structure and project map.
- JSONL example parseability.
- Rubric output schema.
- Existing unit test suite.
- Arbor process-state and diff hygiene.

## Developer Round 1

Implemented:

- Added `docs/wiki-layer-test-strategy.md` with the layered test strategy, source/canonical/retrieval test families, deterministic metrics, judge inputs, human calibration, artifacts, release gates, and implementation plan.
- Added `eval/cases/wiki_retrieval_quality.example.jsonl` with realistic retrieval scenarios for idea/design, implementation/probe, evidence, scope, and source-quality cleanup.
- Added `eval/rubrics/wiki_retrieval_quality_v0.md` with weighted judge dimensions, hard-fail rules, decision policy, and result schema.
- Updated project navigation docs to point at the new test strategy and retrieval rubric.

Developer checks:

| Check | Expected | Result |
| --- | --- | --- |
| JSONL parse check | Example retrieval cases parse as JSON objects | Passed |
| `git diff --check` | No whitespace errors | Passed |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | Existing CLI/wiki tests pass | Passed, 37 tests |
| `python3 /Users/shawn/.codex/plugins/cache/arbor/arbor/0.5.0/skills/arbor/scripts/run_agents_guide_drift_hook.py --root /Users/shawn/Desktop/meridian` | Project map has no missing/stale entries | Passed |
| `python3 /Users/shawn/.codex/plugins/cache/arbor/arbor/0.5.0/skills/arbor/scripts/check_process_state.py --root /Users/shawn/Desktop/meridian` | Arbor workflow state is internally consistent | Passed |

## Evaluator Round 1

Evaluation findings:

- The test strategy covers both deterministic correctness and research-usefulness quality, which is necessary because retrieval can be syntactically valid while still useless for research.
- Retrieval scenario cases avoid the earlier target-paper-aware anti-pattern: queries are standalone and describe realistic user intent before the target page is known.
- The rubric correctly judges context packets rather than final answer fluency.
- The release gates are measurable enough for future automation while leaving room for human-calibrated expected page families.

Decision: pass for design scope, pending final command verification.

## Convergence Round 1

Developer and evaluator evidence agree that the testing scheme is ready to guide implementation.

Status: converged.

## Release Round 1

Checkpoint evidence:

- Planned commit scope: test strategy doc, retrieval scenario examples, retrieval judge rubric, README/AGENTS links, and Arbor workflow metadata.
- Verification before release: JSONL parse, unit suite, diff hygiene, Arbor process-state.
- No push, tag, or external publish requested.
