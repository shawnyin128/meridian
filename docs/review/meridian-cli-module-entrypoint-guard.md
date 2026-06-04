# Meridian CLI Module Entrypoint Guard

## Context

User feedback exposed a common failure path during Paper Wiki use:

1. The runtime cannot find `meridian` on `PATH`.
2. The agent correctly tries to fall back to a Python module entrypoint.
3. The agent guesses `python3 -m meridian.cli`.
4. That command exits with code 0 but prints nothing, because `src/meridian/cli.py`
   defines `main()` but does not call it when executed as a module.
5. The agent then spends extra steps reading CLI internals before discovering
   the correct command is `python3 -m meridian`.

Local evidence:

- `plugins/codex/meridian/skills/wiki/SKILL.md` already tells agents to prefer
  `meridian`, then `PYTHONPATH=$MERIDIAN_CORE_ROOT/src python3 -m meridian`,
  then the repo-local `PYTHONPATH=/Users/shawn/Desktop/meridian/src python3 -m
  meridian`.
- `src/meridian/__main__.py` correctly calls `meridian.cli.main()`.
- `src/meridian/cli.py` lacks a module execution guard, so
  `python3 -m meridian.cli` is a silent no-op.

## Problem

This is a general entrypoint resilience problem, not only an Update Wiki issue.
Any agent that misses the preferred resolver path can hit the same silent
success when trying to inspect status, run context retrieval, ingest, or check
help.

The bad behavior is specifically the silent success. If the command failed
loudly, or executed the CLI, the agent would recover quickly. Returning 0 with
no output is the worst case because it looks like an empty successful command.

## Recommendation

Support `python3 -m meridian.cli` as an alias for the normal CLI entrypoint by
adding the standard module guard at the bottom of `src/meridian/cli.py`:

```python
if __name__ == "__main__":
    raise SystemExit(main())
```

Keep the product skill resolver wording as-is: `python3 -m meridian` remains the
documented fallback. The `.cli` alias is only a defensive compatibility guard for
agent mistakes and user shell habits.

## Rejected Option

Reject making `python3 -m meridian.cli` print an error telling users to use
`python3 -m meridian`. That avoids duplicate entrypoints, but it still makes a
reasonable Python-module guess fail. Since `meridian.cli` already owns `main()`,
executing it is simpler and more useful.

## Acceptance Criteria

- `PYTHONPATH=src python3 -m meridian.cli --version` prints the same version
  shape as `PYTHONPATH=src python3 -m meridian --version`.
- `PYTHONPATH=src python3 -m meridian.cli wiki --help` displays the wiki command
  help instead of returning empty output.
- `PYTHONPATH=src python3 -m meridian --version` still works.
- Product skill resolver wording still prefers `python3 -m meridian`, not
  `python3 -m meridian.cli`.
- The fix does not change CLI command semantics.

## Test Plan

### Targeted Tests

- Add subprocess tests that execute both module paths:
  - `python3 -m meridian --version`
  - `python3 -m meridian.cli --version`
  - `python3 -m meridian.cli wiki --help`
- Assert the `.cli` module path returns non-empty stdout and exit code 0.

### Regression Checks

- Existing release version surface test.
- Existing wiki status/context tests.
- Skill wording check to keep resolver documentation pointed at
  `python3 -m meridian`.

### Release Gates

- Full unit suite.
- `compileall` over `src` and `tests`.
- `git diff --check`.
- `framework-check`.

## Decision Trace Handoff

Key decisions:

- Treat this as a defensive entrypoint alias, not a new product command.
- Keep docs and skills focused on `python3 -m meridian`.
- Test the behavior through subprocess execution because direct `main()` tests
  cannot catch module-level no-op behavior.

Allowed implementation discretion:

- The implementation may place the guard at the end of `src/meridian/cli.py`
  without refactoring CLI structure.
- Tests may use the current Python executable and `PYTHONPATH=src`.

Decision invariants:

- No broad resolver rewrite.
- No change to MCP entrypoints.
- No manual vault search fallback changes.
- No release/version bump unless the user later asks to publish the fix.

## Developer Round 2026-06-04

### RED Evidence

Added `CliTests.test_python_module_entrypoints_execute_cli_main` to execute the
real module entrypoints through subprocess:

- `python3 -m meridian --version`
- `python3 -m meridian.cli --version`
- `python3 -m meridian.cli wiki --help`

The first RED run failed as expected because `python3 -m meridian.cli
--version` returned exit code 0 with empty stdout instead of the current
`meridian <version>` output.

### Implementation

Added the standard module execution guard at the bottom of `src/meridian/cli.py`:

```python
if __name__ == "__main__":
    raise SystemExit(main())
```

This keeps the documented entrypoint unchanged while making the guessed
`meridian.cli` module path execute the same CLI surface.

### Validation

| Check | Result |
| --- | --- |
| Targeted entrypoint/release/skill tests | pass, 4 tests |
| Full unit suite | pass, 162 tests |
| `compileall src tests` | pass |
| `git diff --check` | pass |
| `meridian framework-check` | pass, 8 categories pass |

## Convergence Round 2026-06-04

Decision: converged.

The implementation satisfies the acceptance criteria without changing command
semantics or resolver documentation. The `.cli` module path is now a defensive
compatibility alias for agent mistakes and shell habits; product-facing skills
continue to teach `python3 -m meridian` as the fallback.

Release boundary before publish: this fix was implemented and verified locally,
but had not yet been committed, pushed, version-bumped, or published in a plugin
cache.

## Release Round 2026-06-04

Decision: publish patch release `0.5.1`.

Version management source:

- `VERSION`
- `pyproject.toml`
- `src/meridian/__init__.py`
- `plugins/codex/meridian/.codex-plugin/plugin.json`
- `plugins/claude-code/meridian/.claude-plugin/plugin.json`
- release surface assertions in `tests/test_cli.py`

Release evidence:

| Check | Result |
| --- | --- |
| Full unit suite | pass, 162 tests |
| `compileall src tests` | pass |
| `python3 -m meridian --version` | `meridian 0.5.1` |
| `python3 -m meridian.cli --version` | `meridian 0.5.1` |
| `python3 -m meridian.mcp capabilities --detail full` | pass |
| `framework-check` before cache sync | warn only because `0.5.1` plugin cache was not installed yet |
| Codex cache sync | `0.5.1` plugin manifest and Lab skill installed |
| Claude Code cache sync | `0.5.1` plugin manifest and Lab skill installed |
| `framework-check` after cache sync | pass, 8 categories pass |
| `git diff --check` | pass |

The full unit suite regenerated `docs/knowledge-layer-quality-audit.md` as a
test side effect. That file was restored to the committed fixture state and is
not part of the release diff.
