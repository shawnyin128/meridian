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

Configure the packaged MCP server from the plugin when a client wants tool
access. The `wiki` skill can manage normal use without exposing commands.

## Use Meridian

Use the plugin skills as the product surface:

- `wiki`: update or use the Paper Wiki.
- `lab`: use Paper Wiki context for research coding.

Typical `wiki` requests:

```text
Initialize my Paper Wiki under ~/MeridianPaperWiki.
```

```text
Ingest this uploaded PDF into my Paper Wiki and tell me the managed source path
and canonical wiki page.
```

```text
Ingest this Zotero export folder, My Library, into my Paper Wiki.
```

```text
Use my Paper Wiki to answer this research or coding question with provenance.
```

CLI commands remain execution primitives for skills, MCP, tests, and advanced
debugging; they are not the normal user entry.

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
