# Lab System Optimization Review

Feature: Lab system optimization

## Context/Test Plan

Goal: address the current highest Lab-side system defects without adding a Lab
CLI, MCP server, database, daemon, or workflow engine.

Required evidence:

- Internal Lab validator checks `.meridian/` layout, active pointers, node
  modes, experiment validity, proposal states, and ready-proposal transfer
  gates.
- Local finding proposals have a Wiki Transfer Gate and a transfer packet
  template before Paper Wiki write-back.
- Longitudinal replay eval cases and rubric cover multi-step research arcs.
- Existing Paper Wiki gates remain green.

## Developer Round

Implemented:

- `src/meridian/lab/state.py`
- `src/meridian/templates/research-dev/memory.md`
- `src/meridian/templates/research-dev/wiki-transfer-packet.md`
- `docs/lab-system-optimization.md`
- `eval/cases/research_dev_longitudinal_replay.jsonl`
- `eval/rubrics/research_dev_longitudinal_replay_quality.md`
- Tests for Lab validator and longitudinal eval assets.

Design decisions:

- No Lab product CLI or MCP server was added.
- The validator is internal code for release/debug checks and future tooling.
- Wiki transfer remains proposal-first and user-confirmed.

## Evaluator Round

Validated:

- Targeted Lab tests pass:
  - `test_research_dev_idea_management_assets_parse`
  - `test_research_dev_state_model_assets_parse`
  - `test_lab_state_validator_passes_valid_research_space`
  - `test_lab_state_validator_fails_invalid_modes_and_ready_bridge`
  - `test_research_dev_longitudinal_replay_assets_parse`
- Full unit suite passes: `118 tests`.
- Compile check passes for `src` and `tests`.
- `git diff --check` passes.
- Main wiki gates pass:
  - `meridian wiki lint --wiki-root wiki`: pass with 1 existing finding.
  - `meridian wiki source-audit --wiki-root wiki`: 238 sources, 0 missing,
    0 SHA mismatches, 0 duplicate SHA groups.
  - `meridian wiki catalog --wiki-root wiki`: 236 catalog entries.
- Arbor process-state check passes with 34 feature rows and no findings.
- AGENTS project-map drift hook reports no missing or stale mapped paths.

Adversarial checks:

- No Lab product CLI or MCP server was added.
- Ready local proposals now have deterministic checks for linked experiments,
  target wiki pages, and a transfer gate.
- Longitudinal replay cases cover invalid-evidence retraction, side-idea
  placement, strengthening to ready, thread close, and wiki transfer.

## Convergence Round

Converged.

This pass improves the system-level weak points while preserving the lightweight
Lab boundary. The checker is internal release/debug code, not a user-facing
workflow engine.

## Release Round

Release evidence:

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- Wiki lint/source-audit/catalog: pass.
- Arbor process-state: pass.
- AGENTS drift hook: pass.

Commit pending at the time this review doc was updated.
