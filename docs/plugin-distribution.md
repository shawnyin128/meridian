# Meridian Plugin Distribution

Meridian is distributed to agents as plugins. The Python package is the
execution core that the plugins call for CLI primitives and MCP tools.

## Packages

Codex plugin:

```text
plugins/codex/meridian/
```

Claude Code plugin:

```text
plugins/claude-code/meridian/
```

Both plugin packages include:

- `skills/wiki/`: product entry for Update Wiki and Use Wiki
- `skills/lab/`: product entry for wiki-grounded research coding
- support skills for ingest, retrieval, personalization, evolution, knowledge,
  and concepts
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

Codex expects the marketplace manifest under `.agents/plugins/` inside the
marketplace root:

```text
.agents/plugins/marketplace.json
```

It points at:

```text
plugins/codex/meridian/
```

Install from GitHub:

```bash
codex plugin marketplace add shawnyin128/meridian --sparse .agents/plugins --sparse plugins/codex/meridian
codex plugin add meridian@meridian
```

Codex can refresh the configured Git marketplace snapshot:

```bash
codex plugin marketplace upgrade meridian
```

If the installed plugin still shows old behavior, reinstall it from the refreshed
marketplace:

```bash
codex plugin remove meridian
codex plugin add meridian@meridian
```

## Claude Code

Claude Code expects the marketplace manifest under `.claude-plugin/` inside
the marketplace root:

```text
.claude-plugin/marketplace.json
```

It points at:

```text
plugins/claude-code/meridian/
```

Claude Code can validate the plugin package with:

```bash
claude plugin validate plugins/claude-code/meridian
claude plugin validate .claude-plugin/marketplace.json
```

Install from GitHub:

```bash
claude plugin marketplace add shawnyin128/meridian --sparse .claude-plugin plugins/claude-code/meridian
claude plugin install meridian@meridian
```

Claude Code can refresh with:

```bash
claude plugin update meridian
```

## Product Entry

Users should think in two product areas:

| Product Area | What It Does |
|---|---|
| Paper Wiki | update and use the durable paper knowledge base |
| Lab | plan, implement, debug, and record research-code slices using Paper Wiki context |

Paper Wiki keeps two workflows:

| Workflow | What It Does |
|---|---|
| Update Wiki | ingest papers, add insights, create synthesis, refine pages |
| Use Wiki | retrieve context, read canonical pages, trace evidence |

CLI commands remain execution primitives beneath the plugin and MCP entries.
