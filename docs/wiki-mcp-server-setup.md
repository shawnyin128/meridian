# Meridian MCP Server Setup

Meridian exposes the Paper Wiki through a stdio MCP server. The MCP server wraps the same core functions used by the Prompt/Skill entry and CLI execution primitives.

## Start Command

From the repository root:

```bash
PYTHONPATH=src python3 -m meridian.mcp serve
```

The server reads JSON-RPC messages from stdin and writes JSON-RPC responses to stdout. The Markdown vault remains the source of truth.

By default the server uses the active user Paper Wiki workspace from
`~/.meridian/paper-wiki-workspaces.json`. Create one with:

```bash
meridian wiki init --library-root ~/MeridianPaperWiki
```

You can still pass `--wiki-root` or set `MERIDIAN_WIKI_ROOT` for a specific
vault.

## Claude Desktop Style Config

```json
{
  "mcpServers": {
    "meridian-paper-wiki": {
      "command": "python3",
      "args": ["-m", "meridian.mcp", "serve"],
      "env": {
        "PYTHONPATH": "/Users/shawn/Desktop/meridian/src",
        "MERIDIAN_LIBRARY_ROOT": "/Users/shawn/MeridianPaperWiki"
      }
    }
  }
}
```

## Generic Stdio MCP Client Config

```json
{
  "name": "meridian-paper-wiki",
  "transport": {
    "type": "stdio",
    "command": "python3",
    "args": ["-m", "meridian.mcp", "serve"],
    "env": {
      "PYTHONPATH": "/Users/shawn/Desktop/meridian/src",
      "MERIDIAN_LIBRARY_ROOT": "/Users/shawn/MeridianPaperWiki"
    }
  }
}
```

## Tool Surface

Use Wiki:

- `meridian.context`: retrieve compact canonical context for a research or coding intent.
- `meridian.read`: read selected sections from a canonical page.
- `meridian.trace`: return provenance, evidence, and trust state.

Update Wiki:

- `meridian.update`: prepare source ingest or add a user insight draft.
- `meridian.propose`: create a lintable write-back proposal.
- `meridian.apply`: lint and publish a proposal when safe.
- `meridian.audit`: return wiki health commands and report paths.

## Local Smoke Tests

The JSON bridge is useful before registering the server:

```bash
PYTHONPATH=src python3 -m meridian.mcp capabilities --detail full
PYTHONPATH=src python3 -m meridian.mcp context --query "KV-cache compression debugging prerequisites"
```

The server help should also work:

```bash
PYTHONPATH=src python3 -m meridian.mcp serve --help
```

Run the deterministic client-style harness before release or client setup:

```bash
PYTHONPATH=src python3 -m meridian.mcp harness --wiki-root wiki --out wiki/.index/mcp-stdio-harness.json
```

The harness sends MCP-shaped JSON-RPC requests for `initialize`, `tools/list`,
`context`, `read`, `trace`, `propose`, `apply`, and `audit`. It uses the main
wiki for read-only calls and a disposable fixture wiki for `apply`, so it does
not mutate the user's canonical vault.

Expected summary:

- `status: pass`
- `tool_count: 8`
- internal `.drafts` read is blocked as a structured tool error
- fixture proposal is linted and published successfully
