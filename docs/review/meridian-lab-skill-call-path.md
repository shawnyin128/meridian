# Meridian Lab Skill Call Path

## Context/Test Plan

### Context

The user reported a post-0.4.7 runtime symptom:

```text
Lab skill 文件路径这次仍然不可读，我按它的工作流语义继续...
```

Loaded evidence:

- Source packages contain the Lab skill:
  - `plugins/codex/meridian/skills/lab/SKILL.md`
  - `plugins/claude-code/meridian/skills/lab/SKILL.md`
- Installed Codex cache contains a readable `0.4.7` Lab skill:
  - `/Users/shawn/.codex/plugins/cache/meridian/meridian/0.4.7/skills/lab/SKILL.md`
- Installed Claude Code cache contains a readable `0.4.7` Lab skill:
  - `/Users/shawn/.claude/plugins/cache/meridian/meridian/0.4.7/skills/lab/SKILL.md`
- `claude plugin list` reports `meridian@meridian` version `0.4.7` enabled.
- `codex plugin list` reports `meridian@meridian` version `0.4.7` enabled.

This means the immediate issue is not "the release package is missing Lab".
The likely defect is in the call path exposed to agents: a stale path, a
development-repo path used outside the Meridian repo, a session cache path, or
a target-project sandbox that cannot read plugin cache paths.

### Problem Statement

Make Meridian's Lab skill call path robust enough that Codex and Claude Code
agents do not need to guess workflow semantics when the skill file is present
but the path they tried is unreadable.

### Non-Goals

- Do not change Lab idea-graph semantics.
- Do not weaken the 0.4.7 Research Prior Gate.
- Do not add a Lab MCP, daemon, database, or CLI product surface.
- Do not expose internal support skills as product plugin skills.
- Do not hard-code only this machine's installed cache path as the product
  contract.

### Hidden Decisions

| Decision | Default | Reason |
| --- | --- | --- |
| Treat source/package presence as enough? | No | The reported failure happens after presence checks pass. |
| Add a deterministic path resolver? | Yes, if kept diagnostic-only | The agent needs a stable way to report the actual readable skill path. |
| Prefer plugin cache path over development repo path for product use? | Yes | End users may not have `/Users/shawn/Desktop/meridian`. |
| Handle unreadable cache as setup drift? | Yes | It is a setup/call-path issue, not a Lab workflow decision. |
| Publish as patch release? | Yes if a fix changes skill/setup/framework behavior | This is a runtime usability defect. |

### Recommended Feature

Implement one small repair: `Lab skill call-path diagnostics`.

The repair should make setup/framework checks and product guidance identify the
actual installed `lab/SKILL.md` path for Codex and Claude Code when visible,
distinguish missing from unreadable from stale-session cache, and tell agents
to stop and route to `meridian` setup/status when Lab cannot be loaded instead
of silently continuing from remembered semantics.

### Acceptance Criteria

- Meridian setup/framework checks can report whether the source package,
  Codex installed cache, and Claude Code installed cache contain readable
  `skills/lab/SKILL.md` when those paths are visible.
- The report distinguishes:
  - source package missing
  - installed cache missing
  - installed cache unreadable
  - version drift
  - unknown because the runtime cannot inspect that client cache
- The `meridian` setup skill says that unreadable Lab skill paths are setup
  drift and should be checked with `meridian`, not bypassed with remembered Lab
  semantics.
- The `lab` skill says that if its own file cannot be loaded by the runtime,
  the agent should stop and use `meridian` setup/status instead of pretending
  Lab loaded.
- Regression tests cover readable source/plugin cache fixtures and unreadable
  or missing Lab skill path fixtures.
- Existing product boundaries remain intact: Lab still manages idea graph
  state only, and normal coding/release work stays outside Lab.

### Verification Plan

- Targeted tests for plugin skill package/copy/frontmatter behavior.
- New tests for a deterministic Lab skill path/readability diagnostic helper or
  framework-check category output.
- `PYTHONPATH=src python3 -m unittest discover -s tests`
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-lab-call-path-pycache PYTHONPATH=src python3 -m compileall src tests`
- `git diff --check`
- `PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki`
- External Paper Wiki lint/source-audit/catalog before release if version is
  bumped.

### Decision Trace Handoff

- The observed bug is different from the 0.4.4 YAML-frontmatter discovery bug:
  the 0.4.7 files are readable in both installed caches.
- The likely failure class is runtime path resolution or cache visibility, so
  implementation should start from setup/framework diagnostics rather than
  changing Lab workflow text alone.
- Do not rely on `/Users/shawn/Desktop/meridian/plugins/...` as the user-facing
  product path. Product users should rely on installed plugin skills.
- If a client runtime cannot expose cache paths, the correct state is
  `unknown`, not a hard failure.

## Developer Round

Implemented a diagnostic-only repair for the Lab call path.

Code changes:

- Added `lab_skill_path_diagnostics()` in `src/meridian/framework_check.py`.
- The helper checks source Codex, source Claude Code, current Codex cache,
  current Claude Code cache, marketplace roots when visible, and latest visible
  cache version drift.
- Framework check now surfaces Lab skill path states in the Plugin Bundle
  category as readable, missing, unreadable, unknown, or version drift.
- `meridian` setup skills for Codex and Claude Code now classify unreadable
  `lab/SKILL.md` as setup drift and direct agents away from remembered Lab
  semantics.
- `lab` skills for Codex and Claude Code now state a runtime load boundary:
  if the actual skill file did not load, stop and use `meridian` setup/status.

Tests added:

- Readable source/cache fixture for Lab skill diagnostics.
- Unreadable current cache and stale latest cache fixture.
- Product skill wording checks for the new setup and Lab runtime boundary.

## Evaluator Round

Verification passed:

- `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_framework_check_reports_stable_categories tests.test_cli.CliTests.test_lab_skill_path_diagnostics_reports_readable_source_and_caches tests.test_cli.CliTests.test_lab_skill_path_diagnostics_reports_unreadable_missing_and_version_drift tests.test_cli.CliTests.test_meridian_setup_skill_exists tests.test_cli.CliTests.test_meridian_product_skill_behavior_boundaries tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills`
- `PYTHONPATH=src python3 -m unittest discover -s tests`
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-lab-call-path-pycache PYTHONPATH=src python3 -m compileall src tests`
- `git diff --check`
- `PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki`

Framework check result:

- `Framework status: pass`
- `Categories: 7 pass, 0 warn, 0 fail`
- Plugin Bundle reported readable Lab skill paths for source Codex, source
  Claude Code, current Codex cache, and current Claude Code cache.

Residual risk:

- A running client session can still hold stale skill discovery state until the
  user restarts or reloads the plugin. The repair makes that state diagnosable;
  it does not add a dynamic reload mechanism.

## Convergence Round

Decision: converged, release pending.

The original failure mode is now handled at the right layer:

- If Lab is missing from the plugin package, framework check reports package
  drift.
- If the installed cache is unreadable, framework check reports setup drift.
- If the active runtime cannot inspect a cache, framework check reports
  `unknown` instead of inventing a failure.
- If an agent reaches Lab without actually loading `lab/SKILL.md`, the Lab
  skill contract says to stop and run `meridian` setup/status rather than
  continuing from remembered semantics.

No Lab idea-graph behavior, Research Prior semantics, MCP surface, CLI surface,
or coding/release workflow boundary was changed.

## Release Round: 0.4.8

Release action:

- Finalize F46 as Meridian `0.4.8`.
- Commit convention target: `fix(lab): diagnose unreadable lab skill paths`.

Version surfaces:

- `VERSION`: `0.4.8`
- `pyproject.toml`: `0.4.8`
- Python package version: `0.4.8`
- Codex plugin manifest: `0.4.8`
- Claude Code plugin manifest: `0.4.8`

Release evidence:

- Targeted version/plugin tests: pass.
- Version smoke: `PYTHONPATH=src python3 -m meridian --version` returned
  `meridian 0.4.8`.
- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass, 157 tests.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-0.4.8-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: pass, 6 findings.
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: pass, 247 sources, 0 missing, 0 SHA mismatches, 0 duplicate SHA groups.
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: pass, 243 catalog entries.

Framework check note:

- Source/package framework check is functionally ready.
- Before local plugin cache update, framework check reports a release-middle
  warning because `0.4.8` is not yet installed in Codex/Claude caches. The
  expected post-commit release action is to update local plugin caches and
  rerun framework check.
