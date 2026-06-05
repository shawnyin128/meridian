# Update Wiki Ingest Handoff Closure

## Context/Test Plan

### Context

User feedback showed a standard paper URL ingest taking too many recovery steps:

1. Agent selected Meridian `Update Wiki`, which was correct.
2. MCP `meridian.update` was tried first, which was also reasonable.
3. URL input had to be downloaded to a local PDF before MCP could accept it.
4. MCP `meridian.update(source_path=...)` returned `ready_for_ingest_flow`
   instead of executing or fully specifying the ingest flow.
5. The suggested primitive omitted the required `--rubric`, so the agent had to
   inspect CLI help and then read `paper-ingest` support guidance.
6. The agent needed additional permission/retry steps for writing the external
   Paper Wiki workspace and validating retrieval afterward.

Local evidence:

- `plugins/codex/meridian/skills/wiki/SKILL.md` says `Update Wiki` minimum
  completion is a durable artifact, provenance, index/log/catalog update, and
  git-clean state when applicable.
- `src/meridian/mcp/adapter.py` currently treats source update as a handoff and
  returns `ready_for_ingest_flow` plus `example_execution_primitive`.
- `src/meridian/cli.py` requires `wiki flow ... --rubric <path>`.
- `docs/release-packaging.md` treats `eval/rubrics/*.md` as release assets.
- `F50` fixed the `python3 -m meridian.cli` silent no-op, so the remaining issue
  is no longer module entrypoint discovery.

### Problem

The product contract says `Update Wiki` completes a durable wiki update, but the
MCP source-update implementation behaves like a partial handoff. Partial handoff
is acceptable only if the returned contract is complete enough for agents to run
the next step without discovery.

The current handoff is not complete because it does not expose:

- accepted input forms, especially URL versus local PDF;
- required/default rubric behavior;
- a complete runnable command for environments without `meridian` on `PATH`;
- whether MCP should execute ingest now or explicitly remain a planner;
- post-ingest verification expectations and permission boundaries.

### Recommendation

Keep MCP conservative, but close the handoff:

- `meridian.update` for a source should either execute a bounded ingest flow or
  return a complete `run_command` packet. For this first feature, prefer the
  lower-risk complete command packet, not broad MCP write execution.
- The packet should include the resolved active wiki root, source root,
  suggested output dir, default rubric path or explicit rubric requirement,
  fallback command using `python3 -m meridian`, and post-ingest checks.
- The product `wiki` skill should state that URL papers must first become local
  source files unless/until URL ingestion is supported.
- The command should not require reading `paper-ingest` support skill for
  routine product ingest. `paper-ingest` remains an internal quality reference,
  not a mandatory discovery hop.

### Rejected Options

- Do not make agents fall back to broad vault `rg` or manual CLI spelunking for
  standard ingest.
- Do not expose all internal paper-ingest rubrics and self-check machinery as
  normal product workflow text.
- Do not silently execute broad write actions from MCP without a clear command,
  artifact, and permission boundary.

### Acceptance Criteria

- MCP `meridian.update(source_path=...)` returns a complete product-facing
  source-update packet: workspace, managed source root, output directory,
  default/required rubric, complete command, fallback command, and post-ingest
  reporting expectations.
- Routine local-PDF ingest no longer requires agents to inspect CLI source or
  help just to discover `--rubric`.
- Product skill guidance for Codex and Claude Code agrees on URL handling,
  local source handling, MCP handoff, CLI resolver, permission boundary, and
  minimum completion.
- The handoff remains conservative: write execution can still happen through
  CLI if MCP direct execution is not implemented.
- Existing `wiki flow` semantics and F50 module entrypoint behavior are not
  regressed.

### Test Plan

- Add/adjust MCP adapter tests for source update response shape.
- Add a regression asserting the returned command includes the required rubric
  or that `wiki flow` has a stable default rubric.
- Add Codex/Claude skill parity checks for URL/local-source handling and
  support-skill boundary language.
- Subprocess smoke:
  - `PYTHONPATH=src python3 -m meridian --version`
  - `PYTHONPATH=src python3 -m meridian.cli --version`
  - a fixture `wiki flow` command from the returned handoff packet.
- Full unit suite.
- `compileall src tests`.
- `git diff --check`.
- `framework-check`.

### Decision Trace Handoff

Key decisions:

- Treat this as a product-contract handoff bug, not a full ingest-quality
  rewrite.
- Keep MCP conservative for now: complete handoff packet first, direct source
  execution only if implementation can stay narrow.
- Keep `python3 -m meridian` as the documented fallback command.
- Keep `paper-ingest` as internal/support guidance, not a required user-facing
  step for ordinary ingest.

Allowed implementation discretion:

- The implementation may choose a default packaged rubric or keep `--rubric`
  explicit, but the returned handoff must be complete and executable.
- The response schema can add fields as long as existing MCP capabilities remain
  backward-compatible.
- The CLI may gain a default rubric if that is cleaner than teaching every
  caller to pass one.

Decision invariants:

- No broad MCP write executor unless scoped and tested.
- No direct mutation of raw sources.
- No exposing draft/debug artifacts as normal product output.
- No dependence on repo-local `wiki/` when an active workspace exists.

## Developer Round 2026-06-05

### RED Evidence

- Added `test_mcp_source_update_returns_complete_ingest_handoff`.
  - Initial failure: `meridian.update(source_path=...)` did not return
    `handoff_type` or the complete CLI ingest contract.
- Extended `test_product_wiki_skill_uses_reliable_context_entry`.
  - Initial failure: product skill text did not explicitly cover HTTP(S) URL
    handling or the MCP source-update handoff boundary.

### Implementation

- `src/meridian/mcp/adapter.py`
  - Added a complete source-ingest handoff packet for local PDF sources.
  - The packet includes active wiki root, managed source root, suggested output
    directory, default packaged rubric path, `run_command`,
    `fallback_command`, shell-rendered commands, input contract, permission
    boundary, minimum completion, and post-ingest checks.
  - Kept MCP conservative: `meridian.update(source_path=...)` prepares an
    executable handoff; the CLI still performs the write operation.
- `src/meridian/mcp/server.py`
  - Clarified the MCP schema and tool description for local source paths and
    URL download-first behavior.
- `plugins/codex/meridian/skills/wiki/SKILL.md` and
  `plugins/claude-code/meridian/skills/wiki/SKILL.md`
  - Added product-facing URL/local-source guidance.
  - Made explicit that MCP source update is a handoff, not proof of completed
    ingest.
  - Told agents to use returned commands and not read CLI internals for
    ordinary ingest arguments.
- `tests/test_cli.py`
  - Added response-shape assertions and a replay that executes the returned
    fallback-style command against a fixture PDF.
  - Added Codex/Claude skill parity checks for URL handling and handoff wording.

### Validation

| Check | Result |
| --- | --- |
| RED targeted tests before implementation | Failed for missing handoff fields and missing skill wording |
| Targeted F51 tests | Passed |
| Related MCP/release tests | Passed, 5 tests |
| Full unit suite | Passed, 163 tests |
| `compileall src tests` | Passed |
| `framework-check` | Passed |
| `python3 -m meridian --version` | Passed, `meridian 0.5.1` |
| `python3 -m meridian.cli --version` | Passed, `meridian 0.5.1` |
| `python3 -m meridian.mcp capabilities --detail full` | Passed |
| `git diff --check` | Passed |

## Evaluator Round 2026-06-05

Verdict: accepted for F51.

Replay evidence:

- The new MCP source-update contract exposes the missing product path without
  requiring CLI source inspection.
- The returned command was executed in a fixture workspace and produced a
  canonical paper page.
- Codex and Claude Code product skill copies agree on URL download-first
  handling, MCP handoff semantics, fallback command usage, and post-ingest
  reporting.

Decision invariants held:

- MCP still does not become a broad write executor.
- Raw source mutation boundaries are unchanged.
- Draft/debug artifacts are not promoted as normal product output.
- Active workspace resolution remains explicit in the handoff packet.

Residual issue:

- The first-run wrong-title/duplicate-page problem from the user trace is not
  solved by F51. It is captured as F52: Paper ingest identity and duplicate
  guard.

## Convergence Round 2026-06-05

Decision: converged locally, not committed or released.

F51 meets the acceptance criteria because routine source ingest now has a
complete product-facing MCP-to-CLI handoff: URL sources are normalized to local
PDFs, local PDF updates return executable commands with the required rubric,
agents get a `python3 -m meridian` fallback, and minimum completion/post-checks
are part of the returned contract and skill text.

F52 remains the next separate bug because identity confidence, wrong inferred
titles/topics, and duplicate canonical pages require changes inside ingest
quality/identity logic rather than the MCP handoff contract.

## Release Round 2026-06-05

Decision: publish patch release `0.5.2`.

Release scope:

- Complete the product-facing MCP-to-CLI handoff for source ingest.
- Synchronize Codex and Claude Code `wiki` skill guidance.
- Preserve F52 identity/duplicate guards as a separate planned feature.

Version surfaces:

- `VERSION`
- `pyproject.toml`
- `src/meridian/__init__.py`
- `plugins/codex/meridian/.codex-plugin/plugin.json`
- `plugins/claude-code/meridian/.claude-plugin/plugin.json`
- release version assertions in `tests/test_cli.py`

Final release checks are rerun after the version bump before commit/push.

Final verification:

| Check | Result |
| --- | --- |
| Version surfaces | Passed, aligned at `0.5.2` |
| Targeted release/F51 tests | Passed, 5 tests |
| Full unit suite | Passed, 163 tests |
| `compileall src tests` | Passed |
| `python3 -m meridian --version` | Passed, `meridian 0.5.2` |
| `python3 -m meridian.cli --version` | Passed, `meridian 0.5.2` |
| `python3 -m meridian.mcp capabilities --detail full` | Passed |
| `git diff --check` | Passed |
| `framework-check` before local cache sync | Warn only: local Codex/Claude plugin caches had not yet installed `0.5.2` |

Release continuation:

- `F51` is done and ready to commit/push as `0.5.2`.
- `.arbor/workflow/features.json` now points the next active feature to `F52`
  for the remaining paper identity/duplicate guard work.
- Local Codex/Claude plugin caches should be updated after the push, then
  `framework-check` should be rerun to confirm plugin cache readiness.
