# Research Dev Idea Management MVP Review

Feature: Research Dev idea management MVP

## Context/Test Plan

Goal: add lightweight idea management to Research Dev without making raw ideas
canonical Paper Wiki pages. Ideas should be captured as dev working state,
grounded with Paper Wiki when relevant, turned into testable hypotheses and
minimal experiments, and written back only through proposal-first wiki paths
when findings become durable.

Required evidence:

- Research Dev skill exposes `Idea Capture / Triage / Evolution`.
- `idea-card.md` template exists and is portable to target repos under
  `.meridian/ideas/<slug>.md`.
- Research Dev docs explain that idea cards are dev state, not Paper Wiki source
  facts or default `wiki/ideas/` pages.
- Eval cases and rubric cover raw capture, wiki grounding, minimal experiment,
  kill/revise/promote decisions, and write-back boundaries.
- Example artifact demonstrates raw idea -> wiki grounding -> minimal test ->
  decision using main-wiki context.
- Full project gates pass.

## Developer Round

Implemented artifacts:

- `.codex/skills/meridian-research-dev/SKILL.md`
- `src/meridian/templates/research-dev/idea-card.md`
- `docs/research-dev-use-cases.md`
- `docs/research-dev-mvp-plan.md`
- `docs/research-coding-framework.md`
- `docs/examples/research-dev-idea-card-example.md`
- `eval/cases/research_dev_idea_management_mvp.jsonl`
- `eval/rubrics/research_dev_idea_management_quality.md`
- `tests/test_cli.py`

Design decisions:

- No `meridian dev` CLI was added.
- No canonical `wiki/ideas/` layer was added.
- Idea Cards default to target repos under `.meridian/ideas/` because they bind
  to code, branches, configs, runs, and experiment evidence.
- Paper Wiki remains the grounding and durable write-back target.

## Evaluator Round

Validated behavior:

- Targeted Research Dev idea tests pass.
- Full unit suite passes: `114 tests`.
- Compile check passes for `src` and `tests`.
- `git diff --check` passes.
- Main wiki gates pass:
  - `meridian wiki lint --wiki-root wiki`: pass, 1 informational finding.
  - `meridian wiki source-audit --wiki-root wiki`: 238 sources, 0 missing,
    0 SHA mismatches, 0 duplicate SHA groups.
  - `meridian wiki catalog --wiki-root wiki`: 236 catalog entries.
- Real wiki grounding example created
  `docs/examples/research-dev-idea-card-example.md` from a KV-cache idea query
  that retrieved synthesis, topic, claim, evidence, and paper context.
- Arbor process-state passes with 34 features and no findings.
- AGENTS project-map drift hook reports no missing or stale mapped paths.

Adversarial checks:

- No `wiki/ideas/` canonical layer was introduced.
- No database, daemon, scheduler, or rigid idea state machine was added.
- Raw ideas remain dev working state; durable write-back remains
  proposal-first.

## Convergence Round

Converged.

The requested MVP is complete as a lightweight Research Dev extension: idea
capture is represented by an Idea Card template and workflow guidance, Paper
Wiki grounding is explicit, and promotion remains bounded by write-back
proposals.

## Release Round

Release evidence:

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- Wiki lint/source-audit/catalog: pass.
- Arbor process-state: pass.
- AGENTS drift hook: pass.

Commit pending at the time this review doc was updated.
