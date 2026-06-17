# Meridian

Meridian is a Markdown-first research copilot for papers and research ideas. It
keeps a personal Paper Wiki as compiled knowledge, then uses that wiki to ground
reading, retrieval, synthesis, idea feasibility, experiment evidence, and local
findings.

Meridian has two user-facing surfaces:

- `wiki`: build and use a Paper Wiki from PDFs, Zotero exports, notes,
  syntheses, provenance, and reading insights.
- `lab`: provide Lab-first research/dev preflight in Meridian-initialized repos,
  then manage a research idea graph with Paper Wiki grounding, approach-tree
  exploration, experiment evidence, research grounding injection, and local
  finding proposals.

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
python -m pip install -e .
```

This exposes:

```bash
meridian --version
python -m meridian.mcp serve
```

The plugin MCP config starts `python -m meridian.mcp serve`. That process uses
the `meridian` Python package importable in the client environment. If MCP
behavior looks stale after a plugin update, update the core checkout with
`git pull`, then rerun `python -m pip install -e .` from that checkout.

After installing or updating either the core or plugin, ask the `meridian` skill
to run setup doctor, or run it directly:

```bash
python -m meridian setup doctor --client all
```

If the doctor reports `repair_available`, apply the client-specific MCP repair
only after approval:

```bash
python -m meridian setup repair-mcp --client <codex|claude> --apply
```

Restart the affected Codex or Claude Code session after repair so plugin and
MCP configuration is reloaded.

### Codex

```bash
codex plugin marketplace add shawnyin128/meridian --ref master --sparse .agents/plugins --sparse plugins/codex/meridian
codex plugin add meridian@meridian
```

Upgrade or reinstall:

```bash
codex plugin marketplace upgrade meridian
codex plugin remove meridian@meridian
codex plugin add meridian@meridian
```

If a previous local install registered the Meridian marketplace against an old
branch or release ref, `marketplace upgrade` will keep following that old ref.
Reset the marketplace source to `master`, then reinstall:

```bash
codex plugin remove meridian@meridian
codex plugin marketplace remove meridian
codex plugin marketplace add shawnyin128/meridian --ref master --sparse .agents/plugins --sparse plugins/codex/meridian
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
| `lab` | Lab-first research/dev preflight, idea graph, Wiki-grounded feasibility, experiments, and local findings | `.meridian/` thread/node state, evidence, Research Grounding Injection, or local proposal |

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

When a target repo already has `.meridian/`, Lab is the default preflight for
research and research-development requests. The agent should route by project
state first: research direction, method choice, experiment design, ablations,
probes, metrics, baselines, failure interpretation, paper grounding, evidence,
and durable local findings start in Lab. Pure mechanical engineering may skip
Lab and go straight to the normal coding workflow.

The first Lab workflow uses lazy initialization and asks before creating:

```text
.meridian/state.md
.meridian/threads/index.md
.meridian/experiments/index.md
.meridian/proposals/index.md
```

Lazy initialization also injects or refreshes a guarded research-agent contract
block in the target repo's `AGENTS.md`. User text outside the managed block is
preserved.

### Research-agent contract

Meridian uses three layers to keep research-development agents from silently
downgrading hard implementation requirements:

```text
~/.meridian/research-agent-principles.md   detailed user-level contract
~/.meridian/coding-style.md                compact research-code style profile
~/.meridian/code-ref/                      optional coding-style reference examples
AGENTS.md                                  project-local pointer and hard rule
```

The project-local `AGENTS.md` block is delimited by:

```text
<!-- MERIDIAN RESEARCH AGENT CONTRACT START -->
...
<!-- MERIDIAN RESEARCH AGENT CONTRACT END -->
```

Inside that block, agents are told to read the user-level contract before
research-development code changes and not to silently substitute legacy
behavior, fallback-only behavior, stubs, task-marker comments, no-op
implementations, swallowed errors, or partial implementations for the requested
current behavior.

Code-style distillation updates the user-level files through a structured merge:
update an existing matching principle when possible, add a distinct new
principle only when needed, and keep repo-local conventions out of the global
profile unless the user promotes them. Agents should not create new project
`AGENTS.md` sections for distilled user coding style. They may consider adding
or referencing compact examples under `~/.meridian/code-ref/` when a reusable
example would help future agents, but `code-ref` is optional reference material,
not a hard gate.

Lab adds task-specific constraints through the Research Grounding Injection. For
implementation/debug/test/release/convergence work, that injection includes an
`Implementation Integrity Gate` that names required current behavior, forbidden
shortcuts, blocker reporting, and validation expectations. Lab prepares this
context; normal coding still owns the code change.

Check a repo's Lab readiness and contract block with:

```bash
python -m meridian framework-check --lab-root <repo>
```

Initialize or migrate the setup-owned Lab readiness files with:

```bash
python -m meridian setup init-lab --lab-root <repo>
```

This creates or migrates the user-level contract files, initializes the minimal
`.meridian/` skeleton when missing, injects or refreshes only the guarded
Meridian block in `AGENTS.md`, and then reruns readiness validation. It does not
silently rewrite existing research thread content; if a thread is structurally
invalid, the command reports the remaining blockers and exits non-zero.

If the Lab State category reports `agents_contract_missing`,
`agents_contract_stale`, `agents_contract_malformed`, or
`agents_contract_duplicate`, run `python -m meridian setup init-lab --lab-root
<repo>`. The helper refreshes only the guarded Meridian block and leaves other
`AGENTS.md` content alone.

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
convergence, Lab injects relevant Paper Wiki and implementation grounding into
the coding context. The actual code work belongs to the normal coding workflow,
not Lab.

Live Lab routing and grounding checks are explicit because they call real
Codex sessions and may use external model access:

```powershell
python -m meridian eval codex-lab-grounding `
  eval/cases/lab_grounding_injection_live.jsonl `
  --out-dir eval/runs/lab-grounding-live-<stamp> `
  --repo-root . `
  --overwrite
```

Run this without `--limit` for release confidence. The report records
eval-only `path_rationale` so routing failures can be debugged without adding
that diagnostic field to the shipped product skills.

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
| Core | MCP server code, retrieval, ingest, wiki/lab backend behavior | `git pull`, then keep or rerun `python -m pip install -e .`; run `python -m meridian setup doctor --client all` |
| Plugin | `meridian`, `wiki`, and `lab` skill text, `.mcp.json`, plugin metadata | upgrade/reinstall the Codex or Claude Code plugin; run setup doctor and restart the client |

After updating either layer, ask `meridian` to run a setup and migration check.
When setup doctor reports MCP repair is available, approve and run
`python -m meridian setup repair-mcp --client <codex|claude> --apply`, then
restart the affected client session.

## More Detail

- Workspace config: `docs/wiki-workspace-config.md`
- MCP setup: `docs/wiki-mcp-server-setup.md`
- Plugin distribution: `docs/plugin-distribution.md`
- Product entry contract: `docs/wiki-product-entry-contract.md`
- Release packaging: `docs/release-packaging.md`
- Lab state model: `docs/research-dev-state-model.md`
