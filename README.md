# Meridian

Meridian is a Markdown-first Paper Wiki for papers, reading notes, retrieval
context, synthesis, and research memory.

## Install Core

```bash
python3 -m pip install -e .
```

This installs:

- `meridian`: execution primitives
- `meridian-mcp`: MCP stdio server

## Product Packages

Meridian is meant to be used as an agent plugin. The repo ships two package
shapes:

```text
plugins/codex/meridian/
plugins/claude-code/meridian/
```

Each plugin contains both product skills, support skills, and MCP config. The
Python package above is the shared execution core those plugins call.

## Product Entries

| Entry | Update Wiki | Use Wiki |
|---|---|---|
| Prompt/Skill | ingest PDFs, add insights, write back synthesis, refine pages | retrieve context, read pages, trace evidence, answer with provenance |
| MCP | `meridian.update`, `meridian.propose`, `meridian.apply`, `meridian.audit` | `meridian.context`, `meridian.read`, `meridian.trace` |

Prompt/Skill entry inside each plugin:

```text
skills/wiki/SKILL.md
skills/lab/SKILL.md
```

MCP entry:

```bash
PYTHONPATH=src python3 -m meridian.mcp serve
```

## Core Usage

Create a user-level Paper Wiki workspace:

```bash
meridian wiki init --library-root ~/MeridianPaperWiki
```

This creates:

```text
~/MeridianPaperWiki/
  sources/
  wiki/
  meridian-wiki.json
```

Ingest a PDF:

```bash
meridian wiki ingest /path/to/paper.pdf --publish-mode auto
```

Ingest a Zotero export folder:

```bash
meridian wiki ingest-folder "/path/to/My Library" --publish-mode auto
```

Retrieve wiki context:

```bash
meridian wiki retrieve "research or coding question" \
  --wiki-root ~/MeridianPaperWiki/wiki \
  --strategy v1
```

Run health checks:

```bash
meridian wiki lint --wiki-root ~/MeridianPaperWiki/wiki
meridian wiki source-audit --wiki-root ~/MeridianPaperWiki/wiki
meridian wiki catalog --wiki-root ~/MeridianPaperWiki/wiki
```

## Lab

Lab is the lightweight research-coding copilot layer. It uses Paper Wiki context
for experiment design, method implementation, debugging, evidence recording, and
wiki write-back.

```text
skills/lab/SKILL.md
```

## More Detail

- Workspace config: `docs/wiki-workspace-config.md`
- MCP setup: `docs/wiki-mcp-server-setup.md`
- Plugin distribution: `docs/plugin-distribution.md`
- Product entry contract: `docs/wiki-product-entry-contract.md`
- Release packaging: `docs/release-packaging.md`
- Lab state model: `docs/research-dev-state-model.md`
