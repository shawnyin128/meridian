# Lab Idea Graph Boundary 0.4.0 Review

Feature: Lab idea graph boundary 0.4.0

Goal: refocus Meridian Lab as a lightweight idea graph manager that uses Paper
Wiki for grounding and hands implementation/debug/test/release work to the
normal coding workflow.

## Context/Test Plan

- Lab should own idea placement, approach tree exploration, experiment evidence,
  local finding proposals, Wiki grounding, and development handoff packets.
- Lab should not own code implementation, debugging execution, tests, commits,
  release, or convergence.
- Paper Wiki remains the knowledge substrate and MCP surface.
- Existing `.meridian/` state layout remains valid.

Planned checks:

- product skill copy parity
- Lab boundary wording checks
- eval JSONL/rubric parse checks
- full unit suite
- compileall
- diff check
- external Paper Wiki lint/source-audit/catalog
- framework check

## Developer Round

- Refactored the Lab product skill to center `Idea Placement`,
  `Wiki-Grounded Feasibility Review`, `Approach Tree Exploration`,
  `Experiment Evidence Recording`, `Finding Proposal / Wiki Write-back`, and
  `Development Handoff`.
- Updated setup skill delegation so code work goes to the normal coding
  workflow rather than Lab.
- Updated README and Lab docs to treat previous Research Dev coding language as
  superseded by the idea graph boundary.
- Added `development-handoff-packet.md` and adjusted context/write-back
  templates toward Lab-owned state and handoff artifacts.
- Rewrote Research Dev MVP eval cases/rubric around Lab idea graph behavior.

## Evaluator Round

- Targeted skill/eval tests passed:
  `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_release_version_surfaces_are_aligned ... test_research_dev_eval_assets_parse`.
- Full unit suite passed:
  `PYTHONPATH=src python3 -m unittest discover -s tests`.
- Compile check passed:
  `PYTHONPYCACHEPREFIX=/private/tmp/meridian-040-pycache PYTHONPATH=src python3 -m compileall src tests`.
- Diff hygiene passed: `git diff --check`.
- Framework check passed:
  `PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki`.
- Active Paper Wiki gates passed:
  - lint: pass, 6 findings
  - source-audit: pass, 247 sources, 0 missing, 0 SHA mismatches
  - catalog: pass, 243 entries

## Convergence Round

Converged for 0.4.0. The implementation matches the new product boundary:
Lab is an idea graph and Wiki-grounding tool, while code implementation,
debugging, tests, commits, release, and convergence are handoff destinations.

## Release Round

Release pending commit, tag, push, and local plugin refresh.

Known residual: Arbor process-state still reports historical F1/F37 review
evidence findings outside this feature. F44 itself is represented as `done`
with this review document.
