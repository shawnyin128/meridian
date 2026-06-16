---
name: wiki
description: Product-facing entry for Meridian Paper Wiki. Use when the user wants to update the Paper Wiki or use the Paper Wiki for research, coding, paper understanding, retrieval, synthesis, or personalized paper insights.
---

# Meridian Paper Wiki

Use this as the default product-facing skill. It has two workflows.

## Behavior Priority

Start from the user's intent, not from CLI discovery:

- `Update Wiki`: the user gives a source, note, insight, correction, comparison,
  or durable synthesis request.
- `Use Wiki`: the user asks a research, paper-understanding, evidence, or coding
  context question.

Use the active Paper Wiki workspace first. If no workspace exists, ask for a
library root and initialize it before continuing. CLI and MCP calls are
execution primitives for the agent; do not present raw command lists as the
product answer unless the user asks for setup/debug details.

## Update Wiki

Use this workflow when the user gives Meridian something that should become durable wiki state.

Minimum completion:

- Use the active Paper Wiki workspace. If none exists, ask for a library root and initialize it.
- Create or update a durable artifact in the Markdown wiki.
- Preserve source provenance and canonical page paths.
- Keep source facts, wiki synthesis, user insight, and uncertainty labeled.
- Update index/log/catalog when canonical pages change.
- Leave the wiki git-clean after successful ingest when the vault is in a git repo.
- Report the user-facing artifact path and the next review action.

Canonical examples:

```text
The user gives a new paper PDF. Add it to Meridian Paper Wiki, preserve source provenance, run the strict ingest flow, and publish the canonical paper page only after source-fidelity validation passes. If blocked, report the managed source path, source-fidelity packet, and next review action instead of treating the draft as wiki truth.
```

```text
The user uploads a PDF from Codex or Claude Code. If no Paper Wiki workspace is configured, ask which library root to use. Then copy the PDF into the managed source store, run the strict flow, and report the managed source path plus canonical page only when the source-fidelity gate passes.
```

```text
The user gives an HTTP(S) paper URL. Download it to a local PDF first, then treat that PDF as the source for the normal Paper Wiki ingest flow.
```

```text
The user gives a Zotero export folder such as `My Library`. Recursively ingest the PDFs into the active Paper Wiki workspace as draft/source artifacts, keep sources in the managed source store, and report the batch summary plus source-fidelity review work needed before canonical publication.
```

```text
The user shares a reading note about a paper. Match it to the canonical paper, preserve the raw note, normalize the insight, internalize it into non-source-fact canonical interpretation after lint, and make it retrievable as user-supplied context.
```

```text
The user wants to keep a useful comparison from retrieval. Create a write-back proposal from the context packet, keep source facts and synthesis separate, lint it, and publish the synthesis if it passes.
```

Use internal support modes when needed:

- paper ingest mode for paper flow quality.
- personalization mode for user insight.
- evolution mode for refinement and revision.
- knowledge or concept mode for compiled knowledge repair.

### Source Ingest Handoff

For MCP-facing source updates, `meridian.update` with `source_path` prepares a
complete ingest handoff. MCP source update is a handoff, not proof that ingest
has already completed: run the returned `run_command` or `fallback_command`,
then report the managed source path, canonical wiki page only if published,
quality gate, source-fidelity packet/result state, review state, flow status,
and git auto-commit/clean status.

Do not read CLI internals to discover ordinary ingest arguments. For URL
sources, download it to a local PDF first before calling update. If `meridian`
is not on `PATH`, use the existing resolver below and run the fallback command
through `python3 -m meridian`. Pass that local path to `meridian.update` or the
flow command.

Use `meridian wiki health --wiki-root <wiki>` when the user asks whether the
wiki is usable, trustworthy, release-ready, or what should be repaired next.
Use `meridian wiki health-ui --wiki-root <wiki>` when the user wants the HTML
health report's Run Check button to trigger a local health check.

### Health / Repair Triage

When health returns warnings, do not treat them as a request to hand-edit wiki
content. Report the score, hard failures, and top repair buckets, then route the
next action through the support skill that owns the mechanism:

- `knowledge_graph`, `canonical_linking`, or `claim_evidence_traceability`:
  use knowledge repair mode and create a proposal-first repair.
- `concept_coverage`: use concept repair mode and prioritize high-value
  method/probe/debug prerequisite links.
- `context`, `retrieval`, or `explanation`: use retrieval repair mode and
  improve context-packet behavior or durable synthesis, not raw search.
- `trust`, `source`, or `boundary` hard failures: stop publish/apply work and
  run source/lint remediation first.
- `canonical_source_fidelity` or unverified canonical-paper findings: run
  source-fidelity recheck or quarantine before using those pages as evidence.
- `synthesis` or `growth`: create write-back or refinement proposals before
  canonical updates.

Minimum health response:

- health level and score
- hard failure count
- top 3 repair buckets with evidence
- one proposed next action and whether it is safe to publish or proposal-only

## Use Wiki

Use this workflow when the user asks a research, paper-understanding, or coding question that should consult the accumulated wiki.

Minimum completion:

- Resolve Meridian execution before searching files manually.
- Use the active Paper Wiki workspace; if none exists, ask for initialization instead of guessing a local `wiki/`.
- Retrieve canonical Meridian context first.
- Read the highest-value canonical pages or sections.
- Answer with relevant papers, methods, concepts, evidence, and uncertainty.
- Label user insight and synthesis pages as such.
- Create a write-back proposal when the user wants the answer preserved.

### Use Wiki Setup Blocker

If MCP tools are unavailable, try local CLI retrieval only when local Python can
import Meridian, for example `python -c "import meridian"`. Then use the
resolver below and run `meridian wiki context "<standalone research intent>"`.

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
The user asks a research or coding question. Retrieve Meridian context first, read the highest-value canonical pages, then answer with the relevant papers, methods, concepts, evidence, and uncertainties.
```

```text
The user wants to implement a method. Retrieve method pages, prerequisite concept pages, source papers, and evidence records; read implementation hooks and minimal checks before proposing code.
```

```text
The user asks whether a claim is supported. Retrieve claim/evidence records, trace the provenance to source papers, and separate paper evidence from wiki synthesis.
```

Default Use Wiki primitive:

```bash
meridian wiki context "<standalone research intent>"
```

This uses the active workspace and writes `context.md` / `context.json` under
`/private/tmp/meridian-context/<slug>/` by default. If it reports a missing
workspace, ask the user for a library root and run `meridian wiki init
--library-root <paper-wiki-library-root>`.

Agent execution resolver:

1. Try `meridian`.
2. If unavailable and `MERIDIAN_CORE_ROOT` is set, use
   `PYTHONPATH=$MERIDIAN_CORE_ROOT/src python3 -m meridian`.
3. If working inside the Meridian repo, use
   `PYTHONPATH=/Users/shawn/Desktop/meridian/src python3 -m meridian`.

Use `meridian wiki status` to inspect the active wiki root, source root, core
path, and MCP availability. If retrieval fails, use its warnings and failure
report first; do not start with broad `rg` over the vault.

Failure recovery:

- If a Meridian call returns `needs_init`, ask for the Paper Wiki library root
  and initialize through `meridian`; do not guess a repo-local `wiki/`.
- If a Meridian call returns `workspace_index_write_failed`, report the blocked
  path and ask for the smallest permission or environment fix before retrying.
- Only use direct markdown search after Meridian retrieval succeeds or returns a
  non-recoverable product error.

For detailed retrieval discipline, keep the behavior inside this `wiki` entry:
canonical context first, selected reads second, direct file search only as a
fallback after Meridian retrieval or workspace resolution fails.

## Entry Model

Prompt/Skill and MCP are the product entries. CLI commands are execution primitives used by those entries.

For MCP-facing usage, the equivalent tools are:

- Use Wiki: `meridian.context`, `meridian.read`, `meridian.trace`.
- Update Wiki: `meridian.update`, `meridian.propose`, `meridian.apply`, `meridian.audit`.

The plugin manages MCP startup for clients that support it. Workspace setup is
owned by `meridian` when the user explicitly asks for setup, and by this skill
only when an Update Wiki or Use Wiki request discovers that no active workspace
exists.
