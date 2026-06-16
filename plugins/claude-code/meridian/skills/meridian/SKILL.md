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
- `lab`: Lab-first research/dev preflight, idea graph, Wiki grounding,
  experiments, research grounding injections, and local findings.

If the user asks to ingest, retrieve, answer from papers, add insight, check wiki
health, or write synthesis, hand off to `wiki`. Do not continue the normal work
inside this setup skill after the setup issue is resolved.

If the user asks to place an idea, review feasibility, manage an approach tree,
record research evidence, prepare a local finding, or do research-development
work in a repo with `.meridian/`, hand off to `lab` for Lab-first preflight. If
Lab decides the next action is code edits, debugging, tests, commits, release,
or convergence, the normal coding workflow performs that work from the Lab
Research Grounding Injection rather than treating Lab as the developer.

## Workflows

### Framework Check

Use when the user asks whether the Meridian framework itself is healthy, stale,
or drifting after plugin/core updates.

Minimum completion:

- Run or emulate the deterministic check:

```bash
python -m meridian framework-check --project-root <meridian-repo>
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

- Check the Python core version and path with `python -m meridian --version`
  and `python -m meridian wiki status`.
- Check that the plugin package exposes `meridian`, `wiki`, and `lab` skills.
  When installed plugin files are visible, inspect the Codex or Claude Code
  plugin cache/manifest; otherwise report plugin visibility as unknown, not as a
  hard failure.
- Treat an unreadable `lab/SKILL.md` path as Meridian setup drift. Report the
  attempted path, distinguish missing from unreadable from unknown cache
  visibility, diagnose plugin path drift, and do not tell the agent to continue
  from remembered Lab semantics.
- Check MCP readiness with `python -m meridian.mcp --help` or a lightweight
  capabilities smoke, and report stale behavior as possible core/plugin drift.
- Check the user research-agent contract files:
  - `~/.meridian/coding-style.md`
  - `~/.meridian/research-agent-principles.md`
  If either is missing, create the starter file during setup; if either is stale,
  migrate without deleting user text.
- Confirm that the coding-style profile is only a compact preference source for
  the Coding Style Feedback Gate and Lab Research Grounding Injections. It is not a
  Paper Wiki workspace and it is not a coding workflow.
- Check Lab research-space readiness for the current target repo when the user
  asks whether Meridian is fully ready, mentions Lab, or is working in a repo
  that may need idea-graph state. If `.meridian/` is missing in the target
  repo, create the minimal Lab skeleton during setup and report Lab as
  initialized. This is setup initialization, not a Lab workflow.
- Do not report overall `ready` while a requested Lab-ready check is missing
  `.meridian/`. Either initialize the skeleton or, if the target repo path is
  ambiguous, ask for the target repo path first.
- When Lab readiness is initialized for a target repo, ensure the project
  `AGENTS.md` contains the guarded Meridian Research Agent Contract block.
  The block must point to the user-level files and state:
  `Do not silently substitute` legacy, fallback-only, stub, no-op, swallowed-error,
  or partial behavior for requested current behavior.
- Report Paper Wiki/plugin state as `ready`, `needs_init`, `needs_update`, or
  `needs_migration`; report Lab state separately as `not_checked`,
  `not_needed`, `ready`, `initialized`, `needs_lab_init`, or
  `needs_migration`.
- When a state is not ready, give the smallest next action and stop before
  running normal wiki or lab workflows.

### Setup Doctor

Use after the Status Check when plugin visibility, MCP startup, or runtime
resolution looks stale or blocked.

Minimum completion:

- Run the deterministic doctor for both supported clients:

```bash
python -m meridian setup doctor --client all
```

- Preserve blocker codes and repair state from the doctor output. Treat
  `skill_visible_but_mcp_unavailable` and `no_valid_meridian_runtime` as hard
  setup blockers.
- If the doctor reports `repair_available`, ask before applying any repair. On
  approval, run the client-specific repair command:

```bash
python -m meridian setup repair-mcp --client <codex|claude> --apply
```

- After repair, tell the user to restart the affected Codex or Claude Code
  session so the client reloads plugin/MCP configuration.
- Do not continue normal Wiki or Lab work while
  `skill_visible_but_mcp_unavailable` or `no_valid_meridian_runtime` remains
  unresolved. Report the setup blocker and stop.

State meanings:

- `ready`: core, active workspace, MCP, required product skills, and any
  requested Lab research-space skeleton are present.
- `needs_init`: no active Paper Wiki workspace is configured.
- `needs_update`: core version and plugin manifest/skill package are visibly out
  of sync.
- `needs_migration`: the workspace or Lab research space exists but misses
  required current-layout files, or the coding-style profile has an older
  schema.
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
python -m meridian wiki init --library-root <library-root>
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
- Check visible `lab/SKILL.md` paths in source packages and installed plugin
  caches when possible. If the active client cannot read Lab, route back to this
  setup skill instead of continuing the Lab workflow from memory.
- Check whether the active Paper Wiki workspace has the current external layout:
  `meridian-wiki.json`, `sources/`, and `wiki/` under one library root.
- Check `meridian-wiki.json` for the current workspace schema when the file is
  readable.
- Check the user research-agent contract files:
  - `~/.meridian/coding-style.md`
  - `~/.meridian/research-agent-principles.md`
  If either is missing, create the starter file during setup; if either is stale,
  migrate without deleting user text.
- Check whether a Lab repo that needs idea-graph state has the minimal
  `.meridian/` skeleton.
- If `.meridian/` is missing in the target repo, create the minimal skeleton
  only:
  - `.meridian/state.md`
  - `.meridian/threads/index.md`
  - `.meridian/experiments/index.md`
  - `.meridian/proposals/index.md`
- Prefer the installed core helper when available:

```bash
python -c "from pathlib import Path; from meridian.lab import initialize_lab_space; initialize_lab_space(Path.cwd())"
```

- Creating this skeleton is non-destructive setup. It must not create thread
  files, experiment files, proposal files, active nodes, or run research work.
- When Lab readiness is initialized for a target repo, ensure the project
  `AGENTS.md` contains the guarded Meridian Research Agent Contract block.
  The block must point to the user-level files and state:
  `Do not silently substitute` legacy, fallback-only, stub, no-op, swallowed-error,
  or partial behavior for requested current behavior.
- Do not move, delete, publish, or rewrite user data without explicit approval.

## Delegation

- Use `wiki` for ingest, retrieval, health checks, insights, synthesis, and
  Paper Wiki maintenance.
- Use `lab` by default for research and research-development requests in repos
  with `.meridian/`; Lab handles preflight, idea placement, approach trees,
  experiment evidence, Wiki grounding for ideas, Research Grounding Injections,
  and local finding proposals.
- Use the normal coding workflow for code implementation, debugging, tests,
  commits, release, and convergence after Lab preflight when the task is
  research-bearing, or directly when the task is pure mechanical engineering.

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
