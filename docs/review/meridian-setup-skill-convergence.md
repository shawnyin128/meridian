# Meridian Setup Skill Convergence

## Context/Test Plan

Goal: add a product-facing `meridian` skill for setup, status checks, and
migration checks after plugin/core updates.

Acceptance criteria:

- The skill is concise and maintenance-only.
- It covers initialization, setup status, MCP readiness, and migration drift.
- It delegates normal Paper Wiki work to `wiki` and Research Dev work to `lab`.
- Codex and Claude Code plugin packages include the same skill.
- README, plugin distribution docs, release packaging docs, and tests recognize
  the third user-facing skill.
- The skill does not add a new CLI, MCP server, daemon, database, or background
  workflow.

Test plan:

- Targeted tests for the setup skill and plugin package assets.
- Full unit suite.
- Compile check.
- `git diff --check`.
- Manual review of the skill for scope creep and migration safety.

## Developer Round

Implemented:

- Added `.codex/skills/meridian/SKILL.md`.
- Synced `plugins/codex/meridian/skills/meridian/SKILL.md`.
- Synced `plugins/claude-code/meridian/skills/meridian/SKILL.md`.
- Updated README and distribution docs to expose `meridian`, `wiki`, and `lab`.
- Updated plugin manifest descriptions/default prompts.
- Added release tests checking the setup skill and packaged plugin copies.

Initial developer finding:

- The first version named the three workflows but left `ready`,
  `needs_init`, `needs_update`, and `needs_migration` underdefined.
- Plugin visibility checks were too vague for Codex/Claude installs.
- Migration checks did not mention workspace schema validation.

Developer correction:

- Added state meanings.
- Clarified plugin cache/manifest inspection with unknown-as-nonfatal behavior.
- Added workspace schema check for `meridian-wiki.json`.

## Evaluator Round

Reviewed the skill against product boundaries:

- Pass: `meridian` remains setup/status/migration only.
- Pass: normal Paper Wiki work delegates to `wiki`.
- Pass: Research Dev state delegates to `lab`.
- Pass: destructive operations require explicit approval.
- Pass: no external plugin/framework coupling was introduced.
- Pass: no new runtime surface was added.

Residual risk:

- The skill is still an agent-facing checklist, not a deterministic migration
  runner. That is acceptable for this release because the current need is
  plugin-level setup guidance and drift detection, not unattended migration.

## Convergence Round

Developer and evaluator evidence agree. The skill satisfies the setup-entry
goal, stays bounded, and has test/docs/package coverage. No further correction
loop is required before release finalization.

Release evidence:

- `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_meridian_setup_skill_exists tests.test_cli.CliTests.test_plugin_release_assets_exist tests.test_cli.CliTests.test_release_manifest_excludes_private_runtime_state`: pass.
- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-setup-skill-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
