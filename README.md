# Meridian

Meridian is a Markdown-first research copilot for papers and research ideas. It
keeps a personal Paper Wiki as compiled knowledge, then uses that wiki to ground
reading, retrieval, synthesis, idea feasibility, experiment evidence, and local
findings.

Meridian has two user-facing surfaces:

- `wiki`: build and use a Paper Wiki from PDFs, Zotero exports, notes,
  syntheses, provenance, and reading insights.
- `lab`: manage a research idea graph with Paper Wiki grounding, approach-tree
  exploration, experiment evidence, development handoffs, and local finding
  proposals.

`meridian` is the setup/status skill.

Meridian is intentionally lightweight. It does not try to be an automatic
scientist, a database platform, or a general coding agent. It gives agents a
small set of durable Markdown artifacts and a reliable wiki retrieval substrate.

## Install

Meridian is distributed as Codex and Claude Code plugins. The plugins call the
Python core for wiki operations and the MCP stdio server, so install the core
from the repo first:

```bash
git clone git@github.com:shawnyin128/meridian.git
cd meridian
python3 -m pip install -e .
```

This exposes:

```bash
meridian --version
python3 -m meridian.mcp serve
```

The plugin MCP config starts `python3 -m meridian.mcp serve`. That process uses
the `meridian` Python package importable in the client environment. If MCP
behavior looks stale after a plugin update, update the core checkout with
`git pull`, then rerun `python3 -m pip install -e .` from that checkout.

### Codex

```bash
codex plugin marketplace add shawnyin128/meridian --sparse .agents/plugins --sparse plugins/codex/meridian
codex plugin add meridian@meridian
```

Upgrade or reinstall:

```bash
codex plugin marketplace upgrade meridian
codex plugin remove meridian@meridian
codex plugin add meridian@meridian
```

### Claude Code

Inside Claude Code or from the Claude CLI:

```bash
claude plugin marketplace add shawnyin128/meridian --sparse .claude-plugin plugins/claude-code/meridian
claude plugin install meridian@meridian
```

Upgrade:

```bash
claude plugin update meridian@meridian
```

Then reload or restart the client:

```text
/reload-plugins
```

Plugin package roots:

```text
plugins/codex/meridian/
plugins/claude-code/meridian/
```

## Skills

| Skill | Use It For | Normal Outcome |
|---|---|---|
| `meridian` | setup, status checks, updates, and migrations | ready / needs init / needs update / needs migration |
| `wiki` | Paper Wiki Update Wiki and Use Wiki workflows | canonical pages, retrieval context, provenance, or proposal-first write-back |
| `lab` | idea graph, Wiki-grounded feasibility, experiments, and local findings | `.meridian/` thread/node state, evidence, handoff packet, or local proposal |

Support skills such as paper ingest, retrieval, knowledge, concept, evolution,
and personalization are internal modules the `wiki` skill delegates to. Users
normally do not call them directly.

## Paper Wiki

Initialize a Paper Wiki library through the `meridian` or `wiki` skill. The
library is user state and should live outside the Meridian development repo:

```text
paper-wiki/
  meridian-wiki.json
  sources/
  wiki/
```

`sources/` stores managed raw files. `wiki/` stores canonical Markdown pages.
The generated vault is the source of truth for daily use; debug drafts and
internal validation artifacts are not product output.

Paper ingest is quarantine-first. Direct `wiki ingest`, `wiki ingest-folder`,
and eval ingest runs write draft/source artifacts only. A canonical
`wiki/papers/` page is published through `wiki flow` or gated `publish-run`
only after source-fidelity validation passes; strict health reports historical
canonical pages that lack `validation_state: "source_fidelity_pass"` and
`trust_state: "source_verified"`.

`wiki` has two workflows:

```text
Update Wiki: ingest papers, import Zotero exports, internalize insights,
             propose/publish syntheses, refine pages, audit health
Use Wiki:    retrieve context, read canonical pages, trace evidence,
             answer research/coding questions with provenance
```

CLI commands remain execution primitives for skills, MCP, tests, and advanced
debugging. Normal users should start from `wiki`, not from command lists.

Typical requests:

```text
Ingest this uploaded PDF into my Paper Wiki.
Use my Paper Wiki to answer this research question with evidence.
Check my Paper Wiki health and tell me the top repair priorities.
```

## Lab

Lab is the idea-graph layer. It consumes Paper Wiki context but keeps local
research state in the target repo under `.meridian/`.

The first Lab workflow uses lazy initialization and asks before creating:

```text
.meridian/state.md
.meridian/memory.md
.meridian/threads/index.md
.meridian/experiments/index.md
.meridian/proposals/index.md
```

Lab models exploratory research as:

```text
Research Thread
  -> Approach Tree
       -> Approach Node: unresolved | repairable | supported | dead
       -> Experiment evidence records
  -> Finding Proposal: draft | strengthening | ready | published | rejected | archived
```

Findings stay local until they are `ready`; then `wiki` can transfer them into
Paper Wiki write-back proposals.

Typical request:

```text
Use Lab to place this new idea, ground it in my Paper Wiki, and decide what
evidence I need next.
```

When an idea graph needs implementation, debugging, tests, commits, release, or
convergence, Lab produces a development handoff. The actual code work belongs to
the normal coding workflow, not Lab.

## MCP

The plugin includes MCP config for the Paper Wiki server. Clients can start the
server from the plugin config; users normally do not start it manually.

The MCP surface is workflow-shaped:

```text
Use Wiki:    meridian.context, meridian.read, meridian.trace
Update Wiki: meridian.update, meridian.propose, meridian.apply, meridian.audit
```

MCP wraps the same Meridian core as the skills. It does not replace the Markdown
vault.

## Update

There are two update layers:

| Layer | What Changes | How To Update |
|---|---|---|
| Core | MCP server code, retrieval, ingest, wiki/lab backend behavior | `git pull`, then keep or rerun `python3 -m pip install -e .` |
| Plugin | `meridian`, `wiki`, and `lab` skill text, `.mcp.json`, plugin metadata | upgrade/reinstall the Codex or Claude Code plugin |

After updating either layer, ask `meridian` to run a setup and migration check.

## More Detail

- Workspace config: `docs/wiki-workspace-config.md`
- MCP setup: `docs/wiki-mcp-server-setup.md`
- Plugin distribution: `docs/plugin-distribution.md`
- Product entry contract: `docs/wiki-product-entry-contract.md`
- Release packaging: `docs/release-packaging.md`
- Lab state model: `docs/research-dev-state-model.md`
