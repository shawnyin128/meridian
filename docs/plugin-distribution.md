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
  `python -m meridian.mcp serve`

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
python -m pip install -e .
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
python -m meridian.mcp serve
```

The plugin MCP config starts `python -m meridian.mcp serve`. That process uses
the `meridian` Python package importable in the client environment. If MCP
behavior looks stale after a plugin update, update the core checkout with
`git pull`, then rerun `python -m pip install -e .` from that checkout.

After installing or updating either the Python core or plugin package, run the
setup doctor:

```bash
python -m meridian setup doctor --client all
```

For research repos that should be Lab-ready after an update, run the setup-owned
Lab readiness initializer:

```bash
python -m meridian setup init-lab --lab-root <repo>
```

This creates or migrates `~/.meridian/coding-style.md` and
`~/.meridian/research-agent-principles.md`, initializes the minimal `.meridian/`
skeleton when missing, injects or refreshes only the guarded Meridian block in
`AGENTS.md`, and reports any remaining research-thread blockers without
silently rewriting thread content.

`~/.meridian/code-ref/` is optional user-level coding-style reference material.
Style distillation may propose adding or referencing compact examples there, but
setup readiness must not fail just because no code-ref exists.

If the report shows `repair_available`, ask before applying the MCP config
repair, then run the matching client command:

```bash
python -m meridian setup repair-mcp --client <codex|claude> --apply
```

Restart the affected Codex or Claude Code session after repair so the client
reloads plugin and MCP configuration.

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
codex plugin marketplace add shawnyin128/meridian --ref master --sparse .agents/plugins --sparse plugins/codex/meridian
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

If a local marketplace source was originally registered against an old branch or
release ref, `marketplace upgrade` preserves that ref. Reset the marketplace
source to `master` before reinstalling:

```bash
codex plugin remove meridian@meridian
codex plugin marketplace remove meridian
codex plugin marketplace add shawnyin128/meridian --ref master --sparse .agents/plugins --sparse plugins/codex/meridian
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

After refresh, run `python -m meridian setup doctor --client all`; if
`repair_available` is reported, run
`python -m meridian setup repair-mcp --client claude --apply` after approval and
restart Claude Code.

## Product Entry

Users should think in two product areas:

| Product Area | What It Does |
|---|---|
| Paper Wiki | update and use the durable paper knowledge base |
| Lab | place ideas, ground feasibility, manage approach trees, record evidence, and prepare Research Grounding Injections |

Paper Wiki keeps two workflows:

| Workflow | What It Does |
|---|---|
| Update Wiki | ingest papers, add insights, create synthesis, refine pages |
| Use Wiki | retrieve context, read canonical pages, trace evidence |

CLI commands remain execution primitives beneath the plugin and MCP entries.

Setup doctor is the default route for MCP/runtime blockers. Product skills
should stop normal Wiki or Lab work while MCP is unavailable and no local
Meridian runtime can be imported. Run:

```bash
python -m meridian setup doctor --client all
```

Then use `repair-mcp` only when the doctor reports an available repair.

Setup is a separate maintenance entry:

| Skill | What It Does |
|---|---|
| `meridian` | initialize user workspace, check plugin/core/MCP status, and migrate setup drift |
| `wiki` | update or use the Paper Wiki |
| `lab` | manage a wiki-grounded research idea graph |
