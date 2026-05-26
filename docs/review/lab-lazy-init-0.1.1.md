# Lab Lazy Init 0.1.1 Review

Feature: Lab lazy init and 0.1.1 release

## Context/Test Plan

Goal: make Lab usable without a remembered setup command while keeping it
skill-only. First Lab use in a repo should ask before creating `.meridian/`,
create only the minimal state/memory/index skeleton, then continue the original
idea/debug/experiment workflow.

Required evidence:

- Lab skill documents lazy init.
- Packaged Codex and Claude Code Lab skills match the product behavior.
- Internal helper can create the minimal skeleton without adding CLI or MCP.
- Minimal skeleton passes the Lab validator.
- Version surfaces align at `0.1.1`.

## Developer Round

Implemented:

- Added `initialize_lab_space` as an internal helper in `meridian.lab`.
- Updated repo and packaged Lab skills with the lazy-init contract.
- Updated README and Research Dev docs to describe lazy init.
- Added a lazy-init eval case and rubric dimension.
- Bumped package and plugin versions to `0.1.1`.

Boundary:

- No Lab product CLI, MCP server, daemon, database, or route engine was added.
- Thread, experiment, and proposal files remain workflow-created artifacts, not
  part of the initial skeleton.

## Evaluator Round

Targeted validation:

- `test_release_version_surfaces_are_aligned`: pass.
- `test_research_dev_mvp_assets_exist`: pass.
- `test_research_dev_state_model_assets_parse`: pass.
- `test_lab_lazy_init_creates_minimal_valid_research_space`: pass.
- Existing Lab validator pass/fail fixture tests: pass.

## Convergence Round

Converged for `0.1.1`. Lab now behaves like a research copilot surface: the
user can start with an idea, failure, or experiment, and Lab creates repo-local
state only after confirmation.

## Release Round

Release evidence:

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- Codex plugin validation: pass.
- Claude Code plugin validation: pass.
- Wiki lint/source-audit/catalog: pass.
- Arbor process-state: pass.
- AGENTS drift hook: pass.
