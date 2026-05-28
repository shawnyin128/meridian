# Lab Zero-Candidate Idea Placement Review

Feature: Lab zero-candidate idea placement repair
Release target: 0.3.3

## Context/Test Plan

Goal: fix a Research Dev workflow defect where an agent could see an existing
`.meridian/` space with only `threads/index.md`, find no attachable thread, and
continue as direct implementation instead of creating a research thread seed.

Required evidence:

- Lab skill states that a new durable research idea needs a thread seed.
- Zero existing thread candidates must present `root` as the safe placement.
- Direct coding without a thread seed is allowed only for pure engineering
  chores or when the user explicitly says not to record Lab state.
- State model docs, MVP plan, use-case docs, eval cases, and rubric all reflect
  the zero-candidate root-seed behavior.
- A replay-style unit test locks the failure mode.

## Developer Round

Changed artifacts:

- `.codex/skills/lab/SKILL.md`
- `plugins/codex/meridian/skills/lab/SKILL.md`
- `plugins/claude-code/meridian/skills/lab/SKILL.md`
- `docs/research-dev-state-model.md`
- `docs/research-dev-mvp-plan.md`
- `docs/research-dev-use-cases.md`
- `eval/cases/research_dev_state_model.jsonl`
- `eval/rubrics/research_dev_state_model_quality.md`
- `tests/test_cli.py`
- `.arbor/workflow/features.json`

Root cause:

The Lab skill had the correct high-level placement flow, but it did not name the
zero-candidate case. The Lazy Init language also said to create files only when
the workflow needs them, which let an agent incorrectly treat "no existing
thread" as permission to skip the thread seed. The missing eval case allowed the
drift to survive release.

Fix:

- Added an explicit zero-candidate rule to Lazy Init and New Idea Placement.
- Clarified that zero candidates means `root` is the safe placement, not a
  direct-coding bypass.
- Added a new eval case, rubric hard fail, and replay unit test for
  `.meridian/` with only `threads/index.md`.
- Synchronized the Lab skill into both plugin packages.

## Evaluator Round

Replay evidence:

- Targeted replay tests passed:
  `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_research_dev_state_model_assets_parse tests.test_cli.CliTests.test_research_dev_zero_candidate_idea_replay_contract`
- Eval JSONL parse check passed for `eval/cases/research_dev_state_model.jsonl`
  with 9 cases including `state-new-idea-no-thread-candidates`.

Adversarial checks:

- The fix does not add a Lab CLI, MCP server, daemon, database, or router.
- The fix does not require thread creation for pure engineering chores.
- The fix keeps user confirmation before creating a thread seed or switching
  active thread/node.

## Convergence Round

Converged.

Developer and evaluator evidence agree that the reported failure mode is now
covered by skill guidance, docs, eval assets, rubric hard fail, and a deterministic
unit replay. The result remains aligned with the Research Dev state model: Lab
is still skill-only, lightweight, and Paper Wiki remains the grounding/write-back
substrate.

## Release Round

Release evidence:

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: pass.
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: 241 sources, 0 missing, 0 SHA mismatches, 0 duplicate SHA groups.
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: 237 catalog entries.
- Arbor process-state: pass, 36 feature rows, 0 findings.
- AGENTS project-map drift hook: pass, no missing or stale mapped paths.
- Version surfaces updated to `0.3.3`: `VERSION`, `pyproject.toml`,
  `src/meridian/__init__.py`, Codex plugin manifest, Claude Code plugin
  manifest, and release version test.
