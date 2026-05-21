# Meridian MCP Server Setup

Meridian exposes the Paper Wiki through a stdio MCP server. The MCP server wraps the same core functions used by the Prompt/Skill entry and CLI execution primitives.

## Start Command

From the repository root:

```bash
PYTHONPATH=src python3 -m meridian.mcp serve --wiki-root wiki
```

The server reads JSON-RPC messages from stdin and writes JSON-RPC responses to stdout. The Markdown vault remains the source of truth.

## Claude Desktop Style Config

```json
{
  "mcpServers": {
    "meridian-paper-wiki": {
      "command": "python3",
      "args": ["-m", "meridian.mcp", "serve", "--wiki-root", "/Users/shawn/Desktop/meridian/wiki"],
      "env": {
        "PYTHONPATH": "/Users/shawn/Desktop/meridian/src",
        "MERIDIAN_WIKI_ROOT": "/Users/shawn/Desktop/meridian/wiki"
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
    "args": ["-m", "meridian.mcp", "serve", "--wiki-root", "wiki"],
    "env": {
      "PYTHONPATH": "/Users/shawn/Desktop/meridian/src"
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
PYTHONPATH=src python3 -m meridian.mcp context --wiki-root wiki --query "KV-cache compression debugging prerequisites"
```

The server help should also work:

```bash
PYTHONPATH=src python3 -m meridian.mcp serve --help
```
