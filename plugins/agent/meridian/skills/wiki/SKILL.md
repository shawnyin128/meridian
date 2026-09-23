---
name: wiki
description: Product-facing entry for Meridian Paper Wiki. Use when the user wants to update the Paper Wiki or use the Paper Wiki for research, coding, paper understanding, retrieval, synthesis, or personalized paper insights.
---

# Meridian Paper Wiki

Use this as the default product-facing skill. It has two workflows.

## What owns the Wiki

The Meridian App owns paper ingest, aggregation structure (topics, methods,
memberships, columns), and every edit to a page's body. A coding agent (this
skill, via MCP or CLI) never imports a paper, never creates or restructures
an aggregation, and never edits a body. The one thing an agent may add is a
**conclusion**: a settled finding a project actually found and summarised,
submitted as a proposal the user reviews in the App. If the user gives you a
paper, a note, or a body edit to make, tell them to do it in the App; do not
try to write it through MCP or the CLI.

## Behavior Priority

Start from the user's intent, not from CLI discovery:

- `Use Wiki`: the user asks a research, paper-understanding, evidence, or coding
  context question.
- `Update Wiki`: a project you are working on found and summarised a result
  worth keeping. Propose it as a conclusion; do not invent one.

Use the active Paper Wiki workspace first. If no workspace exists, ask the
user to open or create a library in the Meridian App, then register it (see
Setup Blocker below). CLI and MCP calls are execution primitives for the
agent; do not present raw command lists as the product answer unless the user
asks for setup/debug details.

## Use Wiki

Use this workflow when the user asks a research, paper-understanding, or coding question that should consult the accumulated wiki.

Minimum completion:

- Resolve Meridian execution before searching files manually.
- Use the active Paper Wiki workspace; if none exists, ask the user to open
  or create one in the App instead of guessing a local `wiki/`.
- Retrieve canonical Meridian context first (`meridian.context`).
- Read the highest-value canonical pages with `meridian.read` (frontmatter,
  including memberships and claims, generated regions, and body).
- Trace provenance, evidence, and conflicts with `meridian.trace` when a
  decision depends on where a conclusion came from.
- Answer with the relevant papers, aggregations, conclusions, and open
  conflicts; do not present an unresolved conflict as settled.

### Use Wiki Setup Blocker

If MCP tools are unavailable, try local CLI retrieval only when local Python can
import Meridian, for example `python -c "import meridian"`. Then use the
resolver below and run `python -m meridian wiki status` to find the active
wiki root, then read pages with the MCP JSON bridge
(`python -m meridian.mcp read --page <page>`) once a workspace is configured.

If MCP tools are unavailable and local Python cannot import Meridian, do not
answer from web search or broad file search. Return a setup blocker instead:

```text
Use Wiki blocked: Meridian MCP tools are unavailable and local Python cannot import meridian.
Repair: python -m meridian setup doctor --client all
If repair_available: python -m meridian setup repair-mcp --client <codex|claude> --apply
Restart the affected client session after repair.
```

Canonical examples:

```text
The user asks a research or coding question. Retrieve Meridian context first, read the highest-value canonical pages, then answer with the relevant papers, aggregations, conclusions, evidence, and open conflicts.
```

```text
The user wants to implement a method. Retrieve the method's aggregation page and its member papers, read the table and conclusions, then check evidence and open conflicts before proposing code.
```

```text
The user asks whether a claim is supported. Read the aggregation page's claims, trace each claim's evidence back to its source paper or experiment, and say plainly when a claim has an open conflict.
```

Default Use Wiki primitives:

```bash
python -m meridian.mcp context --query "<standalone research intent>"
python -m meridian.mcp read --page <page id, e.g. topics/speculative-decoding>
python -m meridian.mcp trace --page <page id>
```

Agent execution resolver:

1. Try `meridian`.
2. If unavailable and `MERIDIAN_CORE_ROOT` is set, use
   `PYTHONPATH=$MERIDIAN_CORE_ROOT/src python3 -m meridian`.
3. If working inside the Meridian repo, use
   `PYTHONPATH=<repo>/src python3 -m meridian`.

Use `python -m meridian wiki status` to inspect the active wiki root, source root, core
path, and MCP availability. If retrieval fails, use its warnings first; do not
start with broad `rg` over the vault.

Failure recovery:

- If a Meridian call returns `needs_init`, ask the user to open or create a
  Paper Wiki library in the App; do not guess a repo-local `wiki/`.
- If a Meridian call returns `workspace_index_write_failed`, report the blocked
  path and ask for the smallest permission or environment fix before retrying.
- Only use direct markdown search after Meridian retrieval succeeds or returns a
  non-recoverable product error.

## Update Wiki

Use this workflow only when a project you are working on (Lab or otherwise)
has found and summarised a settled result. This is the entire Update Wiki
surface an agent has: no ingest, no restructuring, no body edits.

Minimum completion:

- Confirm the finding is settled, not a hunch: it needs at least one
  `experiment` evidence item naming the project (and node, when there is
  one). A `source` or `wiki` item may be added as supporting evidence, but
  cannot stand in for the experiment item.
- Pick the aggregation page (`topics/...` or `methods/...`) the conclusion
  belongs on; use `meridian.context`/`meridian.trace` to find it and to check
  whether it revises, conflicts with, or duplicates an existing claim.
- Submit `meridian.wiki_propose` with claim ops only: `addClaim` for a new
  conclusion, `reviseClaim` for an update to an existing one, `addEvidence`
  to attach more support without changing the text, `markConflict` /
  `resolveConflict` for a contradiction, `retractClaim` to withdraw one.
  Never send any other kind of op; the tool rejects it.
- Report the returned key and tell the user the conclusion is queued for
  their review in the App, not yet part of the wiki.
- Use `meridian.wiki_proposal_status` (or `python -m meridian wiki
  proposal-status --key <key>`) if the user asks whether it was applied.

Canonical example:

```text
A Lab project just confirmed that draft-tree width stops paying off past 6 for single-request decoding. Propose it: wiki_propose with title "单请求场景下宽度 6 处出现拐点", trigger {project, node}, ops=[{op: addClaim, page: "topics/speculative-decoding", claim: {id: "knee", text: "...", evidence: [{kind: experiment, project, node}]}}]. Tell the user it is queued for review.
```

CLI equivalent (only when MCP is unavailable):

```bash
python -m meridian wiki propose ops.json --title "<one sentence>" --project <id> [--node <id>]
python -m meridian wiki proposal-status --key <key>
```

### Audit / Signals

`meridian.audit` reads the App's deterministic lint findings
(`wiki-signals.json`): `unfiled-paper`, `thin-aggregation`, `single-child`,
`duplicate-name`, `broken-link`, `broken-membership`, `broken-claim-ref`,
`cell-missing-anchor`, `claim-without-evidence`, `open-conflict`,
`missing-generated-region`. An agent cannot repair or restructure the wiki, so
when the user asks what needs attention, report the signals and let them
decide; do not attempt a structural fix yourself. If it reports `not_run`,
tell the user the App has not run against this vault yet.

## Entry Model

Prompt/Skill and MCP are the product entries. CLI commands are execution primitives used by those entries.

For MCP-facing usage, the equivalent tools are:

- Use Wiki: `meridian.context`, `meridian.read`, `meridian.trace`.
- Update Wiki: `meridian.wiki_propose`, `meridian.wiki_proposal_status`, `meridian.audit`.

The plugin manages MCP startup for clients that support it. Workspace setup is
owned by `meridian` when the user explicitly asks for setup, and by this skill
only when an Update Wiki or Use Wiki request discovers that no active workspace
exists.
