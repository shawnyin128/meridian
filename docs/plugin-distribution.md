# Meridian Plugin Distribution

Meridian is distributed to agents as plugins. The Python package is the
execution core that the plugins call for CLI primitives and MCP tools.

## Packages

Codex plugin:

```text
plugins/codex/meridian-paper-wiki/
```

Claude Code plugin:

```text
plugins/claude-code/meridian-paper-wiki/
```

Both plugin packages include:

- `skills/meridian-paper-wiki/`: product entry for Update Wiki and Use Wiki
- support skills for ingest, retrieval, personalization, evolution, knowledge,
  concepts, and Lab
- `.mcp.json`: starts the Meridian Paper Wiki MCP server with
  `python3 -m meridian.mcp serve`

`llm-wiki` is not published as a product skill. It remains a repository
development skill for maintaining Meridian itself.

## Core Install

Use an existing Python environment:

```bash
python3 -m pip install -e .
```

Then initialize a user-level library:

```bash
meridian wiki init --library-root ~/MeridianPaperWiki
```

The library stores managed sources and the derived wiki under one root:

```text
~/MeridianPaperWiki/
  sources/
  wiki/
  meridian-wiki.json
```

After initialization, the plugin MCP server can use the active workspace:

```bash
python3 -m meridian.mcp serve
```

## Codex

Use the repo-local marketplace manifest:

```text
plugins/codex/marketplace.json
```

The marketplace points at:

```text
plugins/codex/meridian-paper-wiki/
```

## Claude Code

Use the repo-local marketplace manifest:

```text
plugins/claude-code/marketplace.json
```

Claude Code can validate the plugin package with:

```bash
claude plugin validate plugins/claude-code/meridian-paper-wiki
claude plugin validate plugins/claude-code/marketplace.json
```

Register the marketplace with the Claude Code plugin marketplace flow, then
install `meridian-paper-wiki`.

## Product Entry

Users should think in two workflows:

| Workflow | What It Does |
|---|---|
| Update Wiki | ingest papers, add insights, create synthesis, refine pages |
| Use Wiki | retrieve context, read canonical pages, trace evidence |

CLI commands remain execution primitives beneath the plugin and MCP entries.
