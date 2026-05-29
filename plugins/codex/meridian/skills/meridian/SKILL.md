---
name: meridian
description: Use when the user wants to initialize Meridian, check Meridian plugin/core/MCP status, repair setup drift, or migrate local Meridian configuration after a plugin update. Do not use for normal Paper Wiki work or Lab research coding; delegate those to wiki and lab.
---

# Meridian Setup

Use this skill for setup, status, and migration. Keep it small: make Meridian
ready to use, then hand the user to `wiki` or `lab`.

## Workflows

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
- Report the state as `ready`, `needs_init`, `needs_update`, or `needs_migration`.

State meanings:

- `ready`: core, active workspace, MCP, and required product skills are visible.
- `needs_init`: no active Paper Wiki workspace is configured.
- `needs_update`: core version and plugin manifest/skill package are visibly out
  of sync.
- `needs_migration`: the workspace or Lab research space exists but misses
  required current-layout files.

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
  research coding state.

### Migration Check

Use after a plugin/core update or when setup behavior looks stale.

Minimum completion:

- Compare the Python core version, plugin manifest version, and visible skill
  files when available.
- Check whether the active Paper Wiki workspace has the current external layout:
  `meridian-wiki.json`, `sources/`, and `wiki/` under one library root.
- Check `meridian-wiki.json` for the current workspace schema when the file is
  readable.
- Check whether a Lab repo that needs Research Dev state has the minimal
  `.meridian/` skeleton.
- Create missing non-destructive files only after user confirmation.
- Do not move, delete, publish, or rewrite user data without explicit approval.

## Delegation

- Use `wiki` for ingest, retrieval, health checks, insights, synthesis, and
  Paper Wiki maintenance.
- Use `lab` for idea placement, approach trees, experiment evidence, research
  code slices, and local finding proposals.

Canonical example:

```text
The user says Meridian feels stale after updating the plugin. Check core and
plugin versions, inspect active Paper Wiki workspace config, verify MCP can
start, identify any missing setup files, and ask before applying migrations.
```
