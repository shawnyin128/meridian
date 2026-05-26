# Wiki Workspace Config Review

Feature: user-level Paper Wiki workspace config

## Context/Test Plan

The product needs a stable user-level place for both raw sources and canonical
wiki artifacts. This supports the common flow where a user uploads a PDF into an
agent window and asks Meridian to ingest it without repeatedly passing vault
paths.

## Change Summary

## Developer Round

- Added `src/meridian/wiki/workspace.py` for library-level
  `meridian-wiki.json` plus user-level active workspace config.
- Extended `meridian wiki init --library-root <dir>` to create:
  - `<dir>/sources/`
  - `<dir>/wiki/`
  - `<dir>/meridian-wiki.json`
  - `~/.meridian/paper-wiki-workspaces.json`
- Updated ingest/flow to use the active workspace when `--wiki-root` and
  `--out` are omitted.
- Updated source registration/audit/lint to use configured source roots while
  preserving legacy `wiki/raw/sources/` behavior.
- Updated MCP defaults and docs so the server can use the active workspace.
- Updated Prompt/Skill and product docs to ask for a library root on first use.

## Validation Plan

Implemented:

- User workspace config module and source-root resolution.
- CLI `wiki init --library-root` plus active-workspace ingest defaults.
- Source registration/audit/lint support for configured source roots.
- MCP defaults that use the active workspace when no `wiki_root` is supplied.
- Prompt/Skill, README, MCP setup, dataflow, and AGENTS updates.
- Unit coverage for workspace init, active-workspace ingest, and source-audit.

## Evaluator Round

- Unit tests for workspace init, active workspace ingest, and source-audit.
- Full Python unit suite.
- Compileall over `src` and `tests`.
- `git diff --check`.
- Main wiki lint/source-audit/catalog.
- Arbor process-state and AGENTS project-map drift checks.

Evidence:

- Targeted workspace/MCP tests passed.
- Full unit suite passed: `119 tests`.
- Compileall over `src` and `tests` passed.
- `git diff --check` passed.
- Main wiki lint/source-audit/catalog passed.
- AGENTS project-map drift hook reported no missing or stale mapped paths.

## Convergence Round

Converged.

The change adds a user-level configuration layer while preserving existing
`--wiki-root` commands. Product-facing usage can now initialize one library root
and rely on it from Prompt/Skill, CLI, and MCP.

## Release Round

Release notes:

This is a compatibility-preserving product path change. Existing `--wiki-root`
commands still work. New Prompt/Skill/MCP usage can rely on the active
workspace, which keeps managed source PDFs and wiki artifacts under one user
chosen library root.
