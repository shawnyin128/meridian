# Research Dev State Model Review

Feature: Research Dev state model refactor

## Context/Test Plan

Goal: replace loose Idea Card-centered Research Dev state with a lightweight
`.meridian/` research space while keeping the Lab skill-only and preserving
Paper Wiki as the grounding and write-back substrate.

Required evidence:

- Lab skill exposes state workflows for idea placement, approach tree
  exploration, experiment evidence, and finding proposals.
- Templates exist for `.meridian/state.md`, thread, experiment, proposal, and
  directory indexes.
- Docs define thread/node/experiment/proposal boundaries and mark Idea Cards as
  legacy compatibility.
- Eval cases and rubric cover placement, repairable/dead confirmation,
  experiment evidence, invalid-evidence retraction, proposal strengthening, and
  thread close summary.
- Full project gates pass.

## Developer Round

Implemented artifacts:

- `.codex/skills/lab/SKILL.md`
- `docs/research-dev-state-model.md`
- `docs/research-dev-mvp-plan.md`
- `docs/research-dev-use-cases.md`
- `docs/research-coding-framework.md`
- `src/meridian/templates/research-dev/`
- `eval/cases/research_dev_state_model.jsonl`
- `eval/rubrics/research_dev_state_model_quality.md`
- `tests/test_cli.py`

Design decisions:

- No Research Dev MCP or CLI was added.
- The target repo `.meridian/` research space is the dev state home.
- Index files are navigation artifacts, not source of truth.
- Idea Card remains as a legacy compatibility template.
- Same-node factual updates can be automatic; structure/path changes require
  user confirmation.

## Evaluator Round

Validated behavior:

- Targeted Research Dev asset tests pass.
- Full unit suite passes: `115 tests`.
- Compile check passes for `src` and `tests`.
- `git diff --check` passes.
- Main wiki gates pass:
  - `meridian wiki lint --wiki-root wiki`: pass, 1 informational finding.
  - `meridian wiki source-audit --wiki-root wiki`: 238 sources, 0 missing,
    0 SHA mismatches, 0 duplicate SHA groups.
  - `meridian wiki catalog --wiki-root wiki`: 236 catalog entries.
- Arbor process-state check passes with 34 feature rows and no findings.
- AGENTS project-map drift hook reports no missing or stale mapped paths.

Adversarial checks:

- No Research Dev MCP, CLI, daemon, database, or route engine was introduced.
- The old Idea Card template remains but is marked legacy.
- Local experiment evidence remains dev state and cannot directly publish to
  canonical Paper Wiki.

## Convergence Round

Converged.

The implementation matches the requested lightweight state model: Research Dev
now centers on `.meridian/` threads, experiments, and finding proposals while
keeping Paper Wiki as the grounding and proposal-first write-back substrate.

## Release Round

Release evidence:

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- Wiki lint/source-audit/catalog: pass.
- Arbor process-state: pass.
- AGENTS drift hook: pass.

Commit pending at the time this review doc was updated.
