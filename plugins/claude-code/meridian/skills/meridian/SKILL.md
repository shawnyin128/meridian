---
name: meridian
description: Use when the user wants to initialize Meridian, check Meridian plugin/core/MCP status, repair setup drift, or migrate local Meridian configuration after a plugin update. Do not use for normal Paper Wiki work or Lab idea-graph work; delegate those to wiki and lab.
---

# Meridian Setup

Use this skill for setup, status, and migration. Keep it small: make Meridian
ready to use, initialize missing local scaffolds, then hand the user to `wiki`
or `lab`.

## Entry Boundary

Meridian has three user-facing skills:

- `meridian`: setup, status, updates, and migrations.
- `wiki`: Paper Wiki Update Wiki and Use Wiki work.
- `lab`: research idea graph, Wiki grounding, experiments, and local findings.

If the user asks to ingest, retrieve, answer from papers, add insight, check wiki
health, or write synthesis, hand off to `wiki`. Do not continue the normal work
inside this setup skill after the setup issue is resolved.

If the user asks to place an idea, review feasibility, manage an approach tree,
record research evidence, or prepare a local finding, hand off to `lab`. If the
user asks for code edits, debugging, tests, commits, release, or convergence,
hand off to the normal coding workflow rather than treating Lab as the
developer.

## Workflows

### Framework Check

Use when the user asks whether the Meridian framework itself is healthy, stale,
or drifting after plugin/core updates.

Minimum completion:

- Run or emulate the deterministic check:

```bash
python3 -m meridian framework-check --project-root <meridian-repo>
```

- Include `--library-root` or `--wiki-root` when checking a real Paper Wiki
  workspace.
- Include `--lab-root <research-repo>` when checking Lab readiness for a target
  research repo.
- Report the categories as `pass`, `warn`, or `fail`; preserve the finding's
  severity, fixability, and next action.
- Do not turn this into normal Paper Wiki, Lab, or development work. If the
  check passes and the user wants to ingest or retrieve, hand off to `wiki`; if
  they want idea placement or research evidence management, hand off to `lab`;
  if they want code implementation, debugging, tests, commits, release, or
  convergence, hand off to the normal coding workflow.

### Status Check

Use when the user asks whether Meridian is installed, up to date, or ready.

Minimum completion:

- Check the Python core version with `python3 -m meridian --version`.
- Check the active Paper Wiki workspace with `python3 -m meridian wiki status`.
- Check that the plugin package exposes `meridian`, `wiki`, and `lab` skills.
  When installed plugin files are visible, inspect the Codex or Claude Code
  plugin cache/manifest; otherwise report plugin visibility as unknown, not as a
  hard failure.
- Check MCP readiness with `python3 -m meridian.mcp --help` or a lightweight
  capabilities smoke.
- Check Lab research-space readiness for the current target repo when the user
  asks whether Meridian is fully ready, mentions Lab, or is working in a repo
  that may need idea-graph state. If `.meridian/` is missing in the target
  repo, create the minimal Lab skeleton during setup and report Lab as
  initialized. This is setup initialization, not a Lab workflow.
- Do not report overall `ready` while a requested Lab-ready check is missing
  `.meridian/`. Either initialize the skeleton or, if the target repo path is
  ambiguous, ask for the target repo path first.
- Report Paper Wiki/plugin state as `ready`, `needs_init`, `needs_update`, or
  `needs_migration`; report Lab state separately as `not_checked`,
  `not_needed`, `ready`, `initialized`, `needs_lab_init`, or
  `needs_migration`.
- When a state is not ready, give the smallest next action and stop before
  running normal wiki or lab workflows.

State meanings:

- `ready`: core, active workspace, MCP, required product skills, and any
  requested Lab research-space skeleton are present.
- `needs_init`: no active Paper Wiki workspace is configured.
- `needs_update`: core version and plugin manifest/skill package are visibly out
  of sync.
- `needs_migration`: the workspace or Lab research space exists but misses
  required current-layout files.
- `initialized`: the missing `.meridian/` skeleton was created in this setup
  run.
- `needs_lab_init`: the target repo for Lab readiness is unknown or cannot be
  written yet, so setup cannot initialize `.meridian/`.

### Initialize

Use when Meridian has no active user workspace or the user asks to set it up.

Minimum completion:

- Ask for the Paper Wiki library root before creating user data.
- Initialize the library with:

```bash
python3 -m meridian wiki init --library-root <library-root>
```

- Confirm that the library contains `meridian-wiki.json`, `sources/`, and
  `wiki/`.
- Explain that `wiki` handles Paper Wiki Update/Use workflows and `lab` handles
  research idea-graph state.

### Migration Check

Use after a plugin/core update or when setup behavior looks stale.

Minimum completion:

- Compare the Python core version, plugin manifest version, and visible skill
  files when available.
- Check whether the active Paper Wiki workspace has the current external layout:
  `meridian-wiki.json`, `sources/`, and `wiki/` under one library root.
- Check `meridian-wiki.json` for the current workspace schema when the file is
  readable.
- Check whether a Lab repo that needs idea-graph state has the minimal
  `.meridian/` skeleton.
- If `.meridian/` is missing in the target repo, create the minimal skeleton
  only:
  - `.meridian/state.md`
  - `.meridian/memory.md`
  - `.meridian/threads/index.md`
  - `.meridian/experiments/index.md`
  - `.meridian/proposals/index.md`
- Prefer the installed core helper when available:

```bash
python3 -c "from pathlib import Path; from meridian.lab import initialize_lab_space; initialize_lab_space(Path.cwd())"
```

- Creating this skeleton is non-destructive setup. It must not create thread
  files, experiment files, proposal files, active nodes, or run research work.
- Do not move, delete, publish, or rewrite user data without explicit approval.

## Delegation

- Use `wiki` for ingest, retrieval, health checks, insights, synthesis, and
  Paper Wiki maintenance.
- Use `lab` for idea placement, approach trees, experiment evidence, Wiki
  grounding for ideas, development handoffs, and local finding proposals.
- Use the normal coding workflow for code implementation, debugging, tests,
  commits, release, and convergence.

Canonical examples:

```text
The user says Meridian feels stale after updating the plugin. Check core and
plugin versions, inspect active Paper Wiki workspace config, verify MCP can
start, identify any missing setup files, and ask before applying migrations.
```

```text
The user asks whether Meridian is ready in a research repo. Report Paper Wiki
setup and Lab research-space setup separately; if `.meridian/` is missing in
the target repo, create the minimal Lab skeleton and report Lab as initialized.
Do not defer this to `lab`.
```

```text
The user says to ingest a PDF. If setup is ready, switch to `wiki` instead of
performing the ingest here.
```
