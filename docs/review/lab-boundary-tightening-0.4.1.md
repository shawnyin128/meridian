# Lab Boundary Tightening 0.4.1

Feature: Lab boundary tightening after the 0.4.0 idea-graph release
Status: implemented
Date: 2026-05-31

## Context / Test Plan

User feedback clarified the intended product split:

- Lab should be a pure idea graph manager.
- Lab may retrieve and reason over Paper Wiki context while discussing ideas,
  feasibility, approach nodes, experiments, and findings.
- Code implementation, debugging, tests, commits, release, and convergence
  belong to the normal development workflow, not Lab.

The defect review checked shipped skills, product docs, eval assets, and tests
for stale Research Dev / coding-agent routing.

## Developer Evidence

- Tightened `meridian` setup skill routing so framework/status checks hand off
  Paper Wiki work to `wiki`, idea/evidence management to `lab`, and code work to
  the normal coding workflow.
- Mirrored the skill change in Codex and Claude Code plugin bundles.
- Updated the project `llm-wiki` skill so Lab is described as the Wiki-grounded
  idea graph layer rather than a Research Dev Agent.
- Updated active architecture docs to mark older development-agent material as
  legacy background and route adaptive code execution to the normal coding
  workflow.
- Added an eval case for the setup-ready code boundary.
- Added regression assertions that prevent setup skill text from routing code to
  `wiki` or `lab`.

## Evaluator Evidence

Targeted checks:

```text
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_meridian_setup_skill_exists \
  tests.test_cli.CliTests.test_meridian_product_skill_behavior_boundaries \
  tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills \
  tests.test_cli.CliTests.test_meridian_skill_behavior_eval_assets_parse
```

Result: pass.

Release gate results:

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass, 146 tests.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-041-pycache2 PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- `PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki`: pass, 7 categories pass.
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: pass with 6 existing findings.
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: pass, 247 sources, 0 missing, 0 SHA mismatches.
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: pass, 243 entries.
- AGENTS project-map drift hook: pass, no missing top-level candidates or stale mapped paths.
- Arbor process-state: fail on historical F1/F37 review-evidence issues, not introduced by this patch.

## Convergence Decision

The 0.4.1 change is a boundary patch, not a new Lab feature. It keeps Wiki usage
inside Lab for idea grounding while removing any implication that Lab is
responsible for executing code work.
