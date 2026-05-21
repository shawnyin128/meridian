# Final Paper Wiki Entry Implementation Review

## Context/Test Plan

Goal: finish Meridian's two final product entries.

- Prompt/Skill entry remains the agent-facing direct mode.
- MCP entry must be a real stdio server, not only a JSON bridge.
- Both entries expose the same workflows: Update Wiki and Use Wiki.
- Both entries use the same Markdown vault and Meridian core functions.

Planned checks:

- Prompt skill stays concise and workflow-oriented.
- MCP tool registry exposes `capabilities`, `context`, `read`, `trace`, `update`, `propose`, `apply`, and `audit`.
- MCP Use Wiki smoke covers context/read/trace.
- MCP Update Wiki smoke covers update/propose/apply behavior on fixture-safe paths.
- JSON bridge remains available.
- Main wiki gates continue to pass.

## Developer Round

Implementation:

- Added `src/meridian/mcp/server.py`, a dependency-light JSON-RPC stdio MCP server.
- Updated `src/meridian/mcp/__main__.py` so `python3 -m meridian.mcp serve` starts the server and existing JSON bridge commands keep working.
- Extended the JSON bridge with `update`, `propose`, and `apply`.
- Added `meridian-mcp` console script entry.
- Added tests for server initialization, tool listing, context/read/update calls, internal artifact rejection, and apply lint blocking.
- Added MCP setup docs and entry parity eval/rubric artifacts.

Implementation defaults:

- The server implements the required stdio JSON-RPC surface directly instead of adding an external MCP SDK dependency. This keeps the entry stable in offline/local environments while preserving the future option to wrap the same adapter with an SDK.
- Tool results return compact JSON as MCP text content. Large retrieval context remains file-backed.

Developer checks:

- Targeted MCP adapter/server tests passed.

## Evaluator Round

Evaluator checks:

| Check | Expected | Result |
|---|---|---|
| Targeted MCP tests | Adapter and stdio server share canonical corpus and reject internal artifacts | passed: `test_mcp_adapter_context_read_trace_and_propose_use_canonical_corpus`, `test_mcp_stdio_server_registry_and_tool_calls_share_adapter` |
| Full unit suite | Existing behavior remains intact | passed: `Ran 91 tests ... OK` |
| Compile check | Python modules compile | passed: `python3 -m compileall src tests` |
| Diff hygiene | No trailing whitespace or conflict markers | passed: `git diff --check` |
| JSON bridge smoke | `capabilities` and `context` work | passed |
| MCP stdio smoke | server initializes and lists tools | passed: server name `meridian-paper-wiki`, 8 tools |
| Main wiki gates | lint/source-audit/catalog still pass | passed |
| Entry eval artifacts | JSONL cases parse and rubric exists | passed |
| Arbor process state | Feature row and review evidence are consistent | passed |
| AGENTS drift | Project map has no missing/stale mapped paths | passed |

## Convergence Round

Converged. The implementation satisfies the entry contract:

- Prompt/Skill remains the concise agent-facing product entry.
- MCP is now a stdio server entry, not only a design note or JSON bridge.
- The server exposes the same Update Wiki / Use Wiki tool surface as the adapter.
- The server wraps the existing Meridian core; it does not duplicate wiki logic.
- Docs, tests, setup instructions, and eval artifacts point at the same entry model.

## Release Round

Ready for checkpoint commit after final status check.
