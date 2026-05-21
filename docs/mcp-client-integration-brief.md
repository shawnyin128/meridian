# MCP Client Integration Brief

- Date: `2026-05-21`
- Status: `client-ready for stdio MCP smoke`
- Server: `PYTHONPATH=src python3 -m meridian.mcp serve --wiki-root wiki`

## What Was Verified

A deterministic MCP client-style JSON-RPC harness now validates:

- `initialize`
- `tools/list`
- `meridian.context`
- `meridian.read`
- `meridian.trace`
- `meridian.propose`
- `meridian.apply` on a fixture-safe proposal
- `meridian.audit`

Harness command:

```bash
PYTHONPATH=src python3 -m meridian.mcp harness --wiki-root wiki --out wiki/.index/mcp-stdio-harness.json
```

Latest result:

- status: `pass`
- tool count: 8
- context result count: 6
- internal `.drafts` read blocked: true
- fixture apply status: `published`
- report: `wiki/.index/mcp-stdio-harness.json`

## Client-Ready Boundary

The server is ready for local stdio MCP clients that can register a command and environment.

The MCP entry remains a wrapper over Meridian core:

- Markdown vault is the source of truth.
- Read tools only expose canonical pages.
- Update tools remain proposal/lint-gated.
- Large context is written to files and returned as paths plus compact summaries.

## Residuals

- This is a lightweight JSON-RPC stdio server, not a full external hosted service.
- The harness validates protocol-shape calls and tool behavior, but each target client may still need config-path adjustment.
- Write operations should continue to use fixture or explicit low-risk proposals for demos.
