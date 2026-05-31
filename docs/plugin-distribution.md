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

- `skills/meridian/`: setup entry for initialization, status checks, and
  migration checks after plugin/core updates
- `skills/wiki/`: product entry for Update Wiki and Use Wiki
- `skills/lab/`: product entry for wiki-grounded idea graph management
- `.mcp.json`: starts the Meridian Paper Wiki MCP server with
  `python3 -m meridian.mcp serve`

Only `meridian`, `wiki`, and `lab` are published as plugin skills. Ingest,
retrieval, personalization, evolution, knowledge, and concept behavior are
internal support modes inside `wiki`, not separate user-facing plugin entries.

`llm-wiki` is not published as a product skill. It remains a repository
development skill for maintaining Meridian itself. The repository may keep
additional development support skills under `.codex/skills/`, but those are not
part of the plugin skill surface.

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

The plugin MCP config starts `python3 -m meridian.mcp serve`. That process uses
the `meridian` Python package importable in the client environment. If MCP
behavior looks stale after a plugin update, update the core checkout with
`git pull`, then rerun `python3 -m pip install -e .` from that checkout.

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
codex plugin remove meridian@meridian
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
claude plugin update meridian@meridian
```

## Product Entry

Users should think in two product areas:

| Product Area | What It Does |
|---|---|
| Paper Wiki | update and use the durable paper knowledge base |
| Lab | place ideas, ground feasibility, manage approach trees, record evidence, and prepare development handoffs |

Paper Wiki keeps two workflows:

| Workflow | What It Does |
|---|---|
| Update Wiki | ingest papers, add insights, create synthesis, refine pages |
| Use Wiki | retrieve context, read canonical pages, trace evidence |

CLI commands remain execution primitives beneath the plugin and MCP entries.

Setup is a separate maintenance entry:

| Skill | What It Does |
|---|---|
| `meridian` | initialize user workspace, check plugin/core/MCP status, and migrate setup drift |
| `wiki` | update or use the Paper Wiki |
| `lab` | manage a wiki-grounded research idea graph |
