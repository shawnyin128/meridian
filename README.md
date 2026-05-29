# Meridian

Meridian is a Markdown-first Paper Wiki for papers, reading notes, retrieval
context, synthesis, and research memory.

## Install

Meridian has one plugin name and three user-facing skills:

```text
Plugin name: meridian
Skills: meridian, wiki, lab
MCP server id: meridian-paper-wiki
```

The plugin is not a standalone bundle yet. It calls the Meridian Python core for
MCP and wiki operations, so install the core first.

Get the repo and install the core:

```bash
git clone git@github.com:shawnyin128/meridian.git
cd meridian
python3 -m pip install -e .
```

If macOS CommandLineTools Python fails with a system `site-packages`
permission error, install through the user site:

```bash
python3 -m pip install --user --upgrade pip setuptools wheel
SETUPTOOLS_USE_DISTUTILS=stdlib python3 -m pip install --user -e .
```

This installs:

- `meridian`: execution primitives
- `meridian-mcp`: MCP stdio server

Then install the matching agent plugin.

### Codex

```bash
codex plugin marketplace add shawnyin128/meridian --sparse .agents/plugins --sparse plugins/codex/meridian
codex plugin add meridian@meridian
```

### Claude Code

```bash
claude plugin marketplace add shawnyin128/meridian --sparse .claude-plugin plugins/claude-code/meridian
claude plugin install meridian@meridian
```

Inside Claude Code, reload plugins after install:

```text
/reload-plugins
```

The plugin provides `meridian`, `wiki`, `lab`, support skills, and `.mcp.json`.
The MCP config starts `python3 -m meridian.mcp serve` when the client needs
tools.

For local development, replace `shawnyin128/meridian --sparse ...` with the
matching local marketplace path:

```bash
codex plugin marketplace add /path/to/meridian
claude plugin marketplace add /path/to/meridian
```

Version metadata is stored in `VERSION`, `pyproject.toml`, and the Codex/Claude
plugin manifests. Codex and Claude Code can show the plugin version from their
plugin details/list surfaces; the core version is visible with:

```bash
meridian --version
```

After install, start from the skills:

```text
meridian
wiki
lab
```

Ask `meridian` to check setup or initialize your Paper Wiki library on first
use.
The library is separate from this development repo: it contains
`meridian-wiki.json`, `sources/`, and `wiki/` under the library root you choose.
This repo should contain Meridian code, plugin assets, tests, docs, and
templates, not your generated Paper Wiki vault.

`lab` uses lazy init in each research repo: the first Lab workflow asks before
creating `.meridian/` and then continues the original idea/debug/experiment
task.

Check the active wiki and Python core binding:

```bash
meridian wiki status
```

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

Then refresh the Codex marketplace snapshot:

```bash
codex plugin marketplace upgrade meridian
```

If the installed plugin still shows old behavior, reinstall it from the refreshed
marketplace:

```bash
codex plugin remove meridian
codex plugin add meridian@meridian
```

Claude Code does have an update command:

```bash
claude plugin update meridian
```

Restart the client or reload plugins, then ask `wiki` to run a small retrieval
or audit smoke.

After a plugin/core update, ask `meridian` to run a setup and migration check.
It should verify core version, visible plugin skills, active Paper Wiki
workspace layout, and MCP readiness before you resume normal `wiki` or `lab`
work.

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
skills/meridian/SKILL.md
skills/wiki/SKILL.md
skills/lab/SKILL.md
```

MCP entry:

Configure the packaged MCP server from the plugin when a client wants tool
access. The `wiki` skill can manage normal use without exposing commands.

## Use Meridian

Use the plugin skills as the product surface:

- `meridian`: initialize Meridian, check plugin/core/MCP status, and migrate
  setup after updates.
- `wiki`: update or use the Paper Wiki.
- `lab`: use Paper Wiki context for research coding.

Typical `meridian` request:

```text
Check my Meridian setup and migrate anything out of date.
```

Typical `wiki` requests:

```text
Initialize my Paper Wiki under ~/MeridianPaperWiki.
```

```text
Ingest this uploaded PDF into my Paper Wiki and tell me the managed source path
and canonical wiki page.
```

Successful ingests create a scoped git commit for the generated wiki/source
artifacts when the wiki lives inside a git repository. Use `--no-auto-commit`
only for advanced debugging.

```text
Ingest this Zotero export folder, My Library, into my Paper Wiki.
```

```text
Use my Paper Wiki to answer this research or coding question with provenance.
```

The `wiki` skill uses the active workspace and creates retrieval context under
`/private/tmp/meridian-context/` by default, so normal idea search does not
pollute the vault with debug artifacts.

```text
Check my Paper Wiki health and tell me the top repair priorities.
```

```text
Remember this insight about CodeQuant: for my work, its real value is routing
stability probe design. Internalize it into the paper page, but keep it marked
as my interpretation, not paper evidence.
```

CLI commands remain execution primitives for skills, MCP, tests, and advanced
debugging; they are not the normal user entry.

Advanced health primitive:

```bash
meridian wiki health --wiki-root <wiki-root> --repair-plan
```

Enable the HTML report button:

```bash
meridian wiki health-ui --wiki-root <wiki-root>
```

## Lab

Lab is the lightweight research-coding copilot layer. It uses Paper Wiki context
for experiment design, method implementation, debugging, evidence recording, and
wiki write-back.

In a research code repo, `lab` uses lazy init. You do not need to run setup
first. The first Lab workflow asks before creating:

```text
.meridian/state.md
.meridian/memory.md
.meridian/threads/index.md
.meridian/experiments/index.md
.meridian/proposals/index.md
```

Lab models research work as a small graph/tree rather than loose notes:

```text
Research Thread
  -> Approach Tree
       -> Approach Node: unresolved | repairable | supported | dead
       -> Experiment evidence records
  -> Finding Proposal: draft | strengthening | ready | published | rejected | archived
```

Use this when research is exploratory:

```text
I have a new idea while debugging this method. Place it in the current research
threads, decide whether it is a root/child/sibling/link, ground it with the
Paper Wiki, and plan the next smallest experiment.
```

```text
This approach failed. Record the experiment evidence, decide whether the node is
repairable or dead, and suggest the next child node only after checking the wiki
for relevant methods, concepts, and failure modes.
```

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
