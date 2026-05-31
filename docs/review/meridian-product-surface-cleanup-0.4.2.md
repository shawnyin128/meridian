# Meridian Product Surface Cleanup 0.4.2

Feature: Product surface cleanup after Lab idea-graph refocus
Status: implemented
Date: 2026-05-31

## Context / Test Plan

This release records the convergence of the product surface cleanup after the
Lab idea-graph refocus. Tasks 1-3 added release-surface tests, cleaned stale
Lab/Paper Wiki wording, and aligned install/update/MCP docs so the packaged
Codex and Claude Code surfaces describe the same product boundary.

The test plan is intentionally scoped to the changed release and product-surface
contracts: version-surface alignment, plugin marketplace tagline boundaries,
consistent install/update commands, and parity between repo skills and packaged
plugin skill copies.

Framework-check automation was intentionally not expanded in this task. The
existing framework check remains the release readiness primitive; this patch
only records the release version and convergence evidence for 0.4.2.

## Developer Evidence

- Bumped all requested version surfaces to `0.4.2`: `VERSION`,
  `pyproject.toml`, `src/meridian/__init__.py`, Codex plugin manifest, Claude
  Code plugin manifest, and the release-surface unittest expectation.
- Added this review document for the product surface cleanup convergence record.
- Preserved unrelated worktree edits from earlier tasks.

## Evaluator Evidence

Targeted verification:

```text
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_release_version_surfaces_are_aligned \
  tests.test_cli.CliTests.test_plugin_marketplace_taglines_match_lab_boundary \
  tests.test_cli.CliTests.test_install_update_docs_use_consistent_plugin_commands \
  tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills \
  tests.test_cli.CliTests.test_meridian_product_skill_behavior_boundaries
```

Result: pass, 5 tests.

Release gates:

```text
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-product-surface-pycache PYTHONPATH=src python3 -m compileall src tests
git diff --check
PYTHONPATH=src python3 -m meridian wiki lint --wiki-root /Users/shawn/Desktop/paper-wiki/wiki
PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root /Users/shawn/Desktop/paper-wiki/wiki
PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root /Users/shawn/Desktop/paper-wiki/wiki
PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki
python3 /Users/shawn/.codex/plugins/cache/arbor/arbor/1.0.15/skills/arbor/scripts/run_agents_guide_drift_hook.py --root /Users/shawn/Desktop/meridian
```

Results:

- Unit tests: pass.
- Compileall: pass.
- Diff whitespace check: pass.
- Wiki lint: pass, report written; existing wiki findings are non-blocking.
- Source audit: pass, 247 sources, no missing files, no SHA mismatches.
- Catalog: pass, 243 catalog entries.
- Meridian framework-check: pass, 7 categories pass, 0 warn, 0 fail; Lab target repo validation skipped as informational because this release targets the plugin/project surface.
- AGENTS project-map drift hook: pass, no missing or stale mapped paths detected.

Arbor process-state check still reports historical review-evidence gaps in F1
and F37. Those rows predate this release and are not changed by the 0.4.2
product-surface cleanup.

## Convergence Decision

The 0.4.2 cleanup is implemented as a release-surface and documentation
convergence patch. It does not broaden Lab responsibilities or add framework
automation; Lab remains an idea-graph workflow that can use Paper Wiki context,
while release, setup, install/update, and MCP wording are aligned across the
product surface.
