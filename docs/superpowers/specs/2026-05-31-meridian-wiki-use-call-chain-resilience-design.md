# Meridian Wiki Use Call-Chain Resilience Design

Date: 2026-05-31
Status: proposed

## Purpose

Improve Meridian's product-facing Use Wiki and MCP call-chain behavior when the
runtime is partially configured, sandboxed, or missing workspace state.

This pass is not a new product surface. It tightens the existing `wiki` and MCP
entry behavior so agents can recover from common setup and permission failures
without falling back to broad file search or confusing local `wiki/` guesses.

## Evidence

Current checks show:

- `meridian wiki status` resolves the active Paper Wiki workspace correctly.
- `python3 -m meridian.mcp capabilities --detail full` works when a workspace
  exists.
- `meridian wiki context "<query>"` can fail in sandboxed contexts because it
  refreshes catalog files under the active external wiki `.index/`.
- With an empty `MERIDIAN_CONFIG_HOME`, JSON bridge `capabilities` fails before
  returning static tool metadata because it resolves the default workspace too
  early.
- MCP stdio `initialize` and `tools/list` can run without a workspace, but
  `context` falls back to `wiki/papers` and reports a filesystem error instead
  of a setup-oriented `needs_init` result.

## Desired User Experience

When the user asks a research question through `wiki` or an MCP client:

1. Tool discovery should always work, even before the workspace is initialized.
2. Missing workspace should produce an actionable setup message.
3. Permission failures while refreshing indexes should identify the blocked path
   and the smallest next action.
4. MCP tool failures should remain valid MCP responses, not server crashes.
5. Agents should repair setup or permissions before falling back to manual vault
   search.

## Scope

### In Scope

- Make MCP JSON bridge `capabilities` independent from workspace resolution.
- Make MCP stdio default workspace resolution fail as `needs_init` for tool
  calls that require wiki data, not as a silent `Path("wiki")` fallback.
- Return structured MCP tool errors with:
  - `status`
  - `error_code`
  - `message`
  - `next_action`
  - optional `path`
- Improve CLI-facing context failure messages for missing workspace and index
  write permission failures.
- Update the product `wiki` skill so Use Wiki handles these failures before
  manual search fallback.
- Add regression tests for no-workspace capabilities, no-workspace context, and
  permission/index failure shaping where deterministic.

### Out Of Scope

- No new MCP tools.
- No new setup command.
- No change to the active Paper Wiki workspace layout.
- No change to retrieval ranking or catalog schema.
- No broad framework-check expansion.
- No Lab state model changes.

## Design

### Static Tool Discovery

`meridian.mcp capabilities` and MCP `tools/list` are discovery operations. They
must not require a configured Paper Wiki workspace.

The JSON bridge should only resolve the default wiki root for tools that
actually need wiki data: `context`, `read`, `trace`, `update`, `propose`,
`apply`, and `audit`.

### Workspace-Required Tool Calls

For tool calls that require wiki data:

- If `wiki_root` is explicitly provided, use it.
- Else resolve the active workspace.
- If no workspace exists, return a structured `needs_init` error:

```json
{
  "status": "error",
  "error_code": "needs_init",
  "message": "No Paper Wiki workspace is configured.",
  "next_action": "Run meridian wiki init --library-root <paper-wiki-library-root> or initialize through the meridian setup skill."
}
```

The stdio server should keep returning a normal JSON-RPC `result` for
`tools/call`, with `isError: true` inside the MCP tool result. JSON-RPC protocol
errors should remain reserved for malformed JSON-RPC requests.

### Index Write Failure Shaping

Retrieval may refresh catalog/index files before producing context. If the
active wiki is outside the current sandbox or otherwise read-only, the raw
`Operation not permitted` error is not enough.

The CLI and MCP adapter should shape this into:

```json
{
  "status": "error",
  "error_code": "workspace_index_write_failed",
  "message": "Meridian could not refresh the Paper Wiki index.",
  "path": "<blocked-index-or-wiki-path>",
  "next_action": "Grant write access to the Paper Wiki library or run the same request in an environment that can write the wiki .index directory."
}
```

This design does not make retrieval read-only. The current product expects
index/catalog freshness. The improvement is clearer failure and recovery.

### Skill Behavior

The packaged `wiki` skill should instruct agents:

- Resolve Meridian execution first.
- If `needs_init`, ask for a library root and initialize instead of guessing.
- If `workspace_index_write_failed`, report the blocked path and request the
  smallest permission/environment fix.
- Only use direct markdown search after Meridian retrieval has either succeeded
  or returned a non-recoverable product error.

## Testing

Add or update unit tests for:

- JSON bridge `capabilities` works with empty `MERIDIAN_CONFIG_HOME`.
- MCP stdio `initialize`, `tools/list`, and `meridian.capabilities` work with no
  configured workspace.
- MCP stdio `meridian.context` with no configured workspace returns `isError`
  and `error_code: needs_init`.
- JSON bridge `context` with no configured workspace exits with an actionable
  `needs_init` message.
- Existing MCP adapter and server registry tests continue to pass.

If deterministic permission-denial simulation is too brittle, test the error
shaping helper directly and keep a manual smoke note for sandboxed active-wiki
retrieval.

## Release Evidence

Minimum verification after implementation:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-call-chain-pycache PYTHONPATH=src python3 -m compileall src tests
git diff --check
PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki
MERIDIAN_CONFIG_HOME=/private/tmp/meridian-empty-config PYTHONPATH=src python3 -m meridian.mcp capabilities --detail summary
```

Expected result: all gates pass, and the empty-config capabilities smoke returns
tool metadata rather than a workspace error.
