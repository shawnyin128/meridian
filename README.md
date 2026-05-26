# Meridian

Meridian is a Markdown-first Paper Wiki for papers, reading notes, retrieval
context, synthesis, and research memory.

## Install

Meridian has one plugin name and two user skills:

```text
Plugin name: meridian
Skills: wiki, lab
MCP server id: meridian-paper-wiki
```

Use an existing Python environment. From the Meridian repo:

```bash
cd /path/to/meridian
python3 -m pip install -e .
```

This installs:

- `meridian`: execution primitives
- `meridian-mcp`: MCP stdio server

Then install the matching agent plugin.

### Codex

The local Codex marketplace is:

```text
/path/to/meridian/plugins/codex
```

Install:

```bash
codex plugin marketplace add /path/to/meridian/plugins/codex
codex plugin add meridian@meridian
```

If `codex` is not on your macOS `PATH`:

```bash
/Applications/Codex.app/Contents/Resources/codex plugin marketplace add /path/to/meridian/plugins/codex
/Applications/Codex.app/Contents/Resources/codex plugin add meridian@meridian
```

### Claude Code

The local Claude Code marketplace is:

```text
/path/to/meridian/plugins/claude-code
```

Install:

```bash
claude plugin marketplace add /path/to/meridian/plugins/claude-code
claude plugin install meridian@meridian
```

Inside Claude Code, reload plugins after install:

```text
/reload-plugins
```

The plugin provides `wiki`, `lab`, support skills, and `.mcp.json`. The MCP
config starts `python3 -m meridian.mcp serve` when the client needs tools.

After install, start from the skills:

```text
wiki
lab
```

Ask `wiki` to initialize your Paper Wiki library on first use.

## Update

Meridian has two update layers:

| Layer | What Changes | How To Update |
|---|---|---|
| Core | MCP server code, retrieval, ingest, wiki/lab backend behavior | update the repo/package, then keep or rerun `python3 -m pip install -e /path/to/meridian` |
| Plugin | `wiki` and `lab` skill text, support skills, `.mcp.json`, plugin metadata | reinstall or refresh the Codex/Claude Code plugin package from `plugins/.../meridian/` |

If the core was installed editable with `pip install -e`, changes under
`src/meridian/` are picked up from the repo. Restart or reload the MCP client so
it launches the new server code.

If a release changes both Python code and skills, update both layers:

```bash
cd /path/to/meridian
git pull
python3 -m pip install -e .
```

Then refresh the plugin from the same marketplace:

```bash
codex plugin remove meridian
codex plugin add meridian@meridian
```

or:

```bash
claude plugin update meridian
```

Restart the client or reload plugins, then ask `wiki` to run a small retrieval
or audit smoke.

MCP startup is managed by the client through the plugin config; you normally do
not start it manually.

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
