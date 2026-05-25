# Research Dev MVP Review

Feature: Research Dev MVP

## Context/Test Plan

Goal: create a lightweight Research Dev MVP that is heavy on Paper Wiki
retrieval and light on agent restrictions. The deliverable is an agent-facing
skill, Markdown templates, evaluation assets, planning docs, and a retrieval
smoke example. The feature must not introduce a new daemon, database, or rigid
route machine.

Required evidence:

- Research Dev MVP plan exists.
- Product skill exists and exposes the three MVP workflows.
- Markdown templates exist.
- Evaluation cases and rubric exist.
- A real main-wiki retrieval smoke produces a Research Dev context packet example.
- Full project gates pass.

## Developer Round

Implemented artifacts:

- `docs/research-dev-use-cases.md`
- `docs/research-dev-mvp-plan.md`
- `.codex/skills/lab/SKILL.md`
- `src/meridian/templates/research-dev/`
- `eval/cases/research_dev_mvp.jsonl`
- `eval/rubrics/research_dev_mvp_quality.md`

Design decisions:

- No `meridian dev` CLI in the MVP. The skill and templates provide enough
  structure without constraining the agent path.
- Paper Wiki remains the memory substrate and is consumed through MCP or
  equivalent local primitives.
- Dev write-back remains proposal-first.

## Evaluator Round

Validated behavior:

- Research Dev asset tests pass:
  `tests.test_cli.CliTests.test_research_dev_mvp_assets_exist` and
  `tests.test_cli.CliTests.test_research_dev_eval_assets_parse`.
- Full unit suite passes: `113 tests`.
- Compile check passes for `src` and `tests`.
- Main wiki gates pass:
  - `meridian wiki lint --wiki-root wiki`: pass, 1 informational finding.
  - `meridian wiki source-audit --wiki-root wiki`: 238 sources, 0 missing,
    0 SHA mismatches, 0 duplicate SHA groups.
  - `meridian wiki catalog --wiki-root wiki`: 236 catalog entries.
- MCP harness passes with 8 tools, 6 context results, internal read blocked, and
  fixture apply published.
- Real Research Dev retrieval smoke produced
  `docs/examples/research-dev-context-packet-example.md`, using the main wiki
  to retrieve KV-cache concept, method, synthesis, and claim context for a
  coding/probe/debug style request.
- Arbor process-state passes with 33 features and no findings.
- AGENTS project-map drift hook reports no missing or stale mapped paths.

Adversarial checks:

- The MVP does not add a `meridian dev` command or routing daemon.
- Research Dev write-back remains proposal-first through Paper Wiki mechanisms.
- Templates keep user intent, wiki context, repo context, evidence identity,
  uncertainty, next action, and checkpoint recommendation explicit.

## Convergence Round

Converged.

The requested MVP is complete as a lightweight product entry: the skill defines
the three priority workflows, templates provide portable artifacts, evaluation
assets define quality expectations, and the retrieval smoke demonstrates that
Paper Wiki context can drive a research-code slice without a heavy agent state
machine.

## Release Round

Release evidence:

- `git diff --check`: pass.
- Full unit suite: pass.
- Compile check: pass.
- Wiki lint/source-audit/catalog: pass.
- MCP harness: pass.
- Arbor process-state: pass.
- AGENTS drift hook: pass.

Commit pending at the time this review doc was updated.
