# Meridian Wiki Use Call-Chain Resilience

Date: 2026-05-31
Status: implemented

## Context / Test Plan

This pass improves the Wiki Use and MCP call chains when workspace state is
missing or index refresh fails. It follows the approved Superpowers spec in
`docs/superpowers/specs/2026-05-31-meridian-wiki-use-call-chain-resilience-design.md`.

## Developer Evidence

- JSON bridge `capabilities` no longer requires workspace resolution.
- MCP stdio server no longer falls back to repo-local `wiki/` when no active
  workspace exists.
- Missing workspace returns `needs_init` with a setup next action.
- Permission/index write failures are shaped as
  `workspace_index_write_failed`.
- Packaged `wiki` skills explain recovery behavior.

## Evaluator Evidence

Focused tests:

```text
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_mcp_json_bridge_capabilities_does_not_require_workspace \
  tests.test_cli.CliTests.test_mcp_json_bridge_context_reports_needs_init_without_workspace \
  tests.test_cli.CliTests.test_mcp_stdio_server_context_reports_needs_init_without_workspace \
  tests.test_cli.CliTests.test_mcp_adapter_shapes_index_write_failure \
  tests.test_cli.CliTests.test_mcp_stdio_server_registry_and_tool_calls_share_adapter \
  tests.test_cli.CliTests.test_mcp_adapter_context_read_trace_and_propose_use_canonical_corpus \
  tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills
```

Result: pass, 7 tests.

Release gates:

```text
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-call-chain-pycache PYTHONPATH=src python3 -m compileall src tests
git diff --check
PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki
MERIDIAN_CONFIG_HOME=/private/tmp/meridian-empty-config PYTHONPATH=src python3 -m meridian.mcp capabilities --detail summary
```

Results:

- Unit tests: pass, 152 tests.
- Compileall: pass.
- Diff whitespace check: pass.
- Meridian framework-check: pass, 7 categories pass, 0 warn, 0 fail; Lab target repo validation skipped as informational because no Lab repo was provided.
- Empty-config MCP capabilities smoke: pass; returned tool metadata without workspace resolution.
- Empty-config MCP context smoke: returned `needs_init` with a setup next action.
- Empty-config CLI `wiki context` smoke: returned `needs_init` with a setup next action.

## Convergence Decision

The call-chain resilience pass is complete when focused tests, full unit tests,
compileall, diff check, framework-check, and empty-config MCP capabilities smoke
all pass.
