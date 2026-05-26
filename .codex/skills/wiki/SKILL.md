---
name: wiki
description: Product-facing entry for Meridian Paper Wiki. Use when the user wants to update the Paper Wiki or use the Paper Wiki for research, coding, paper understanding, retrieval, synthesis, or personalized paper insights.
---

# Meridian Paper Wiki

Use this as the default product-facing skill. It has two workflows.

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
The user gives a new paper PDF. Add it to Meridian Paper Wiki, preserve source provenance, publish the canonical paper page when the flow converges, update index/log/catalog, and report the managed source path and canonical wiki page.
```

```text
The user uploads a PDF from Codex or Claude Code. If no Paper Wiki workspace is configured, ask which library root to use. Then copy the PDF into the managed source store, ingest into the configured wiki, and report the managed source path plus canonical page.
```

```text
The user gives a Zotero export folder such as `My Library`. Recursively ingest the PDFs into the active Paper Wiki workspace, keep sources in the managed source store, publish canonical pages when allowed, and report the batch summary plus any failures.
```

```text
The user shares a reading note about a paper. Match it to the canonical paper, preserve the raw note, normalize the insight, publish it as user insight after lint, and make it retrievable as user-supplied context.
```

```text
The user wants to keep a useful comparison from retrieval. Create a write-back proposal from the context packet, keep source facts and synthesis separate, lint it, and publish the synthesis if it passes.
```

Delegate to specialized skills when needed:

- `paper-ingest` for paper flow quality.
- `wiki-personalize` for user insight.
- `wiki-evolve` for refinement and revision.
- `wiki-knowledge` or `wiki-concept` for compiled knowledge repair.

## Use Wiki

Use this workflow when the user asks a research, paper-understanding, or coding question that should consult the accumulated wiki.

Minimum completion:

- Retrieve canonical Meridian context first.
- Read the highest-value canonical pages or sections.
- Answer with relevant papers, methods, concepts, evidence, and uncertainty.
- Label user insight and synthesis pages as such.
- Create a write-back proposal when the user wants the answer preserved.

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

Default retrieval primitive:

```bash
meridian wiki retrieve "<standalone research intent>" \
  --wiki-root wiki \
  --strategy v1 \
  --out wiki/.drafts/retrieval/<slug>/context.md \
  --json-out wiki/.drafts/retrieval/<slug>/context.json
```

Delegate to `wiki-retrieve` for detailed retrieval discipline.

## Entry Model

Prompt/Skill and MCP are the product entries. CLI commands are execution primitives used by those entries.

For MCP-facing usage, the equivalent tools are:

- Use Wiki: `meridian.context`, `meridian.read`, `meridian.trace`.
- Update Wiki: `meridian.update`, `meridian.propose`, `meridian.apply`, `meridian.audit`.

MCP server entry:

```bash
PYTHONPATH=src python3 -m meridian.mcp serve
```

Workspace setup primitive:

```bash
meridian wiki init --library-root <paper-wiki-library-root>
```

This creates the managed source store and canonical wiki under one library root
and records it as the active user workspace for future Prompt/Skill, CLI, and
MCP usage.
