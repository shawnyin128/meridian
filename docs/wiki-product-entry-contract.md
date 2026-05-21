# Paper Wiki Product Entry Contract

Meridian Paper Wiki has two product entries and two user workflows.

| Entry | Update Wiki | Use Wiki |
|---|---|---|
| Prompt/Skill | ingest, insight, write-back, refine, audit | retrieve, read, trace, answer |
| MCP | update/propose/apply/audit tools | context/read/trace tools |

The CLI remains the execution layer. Users and agents should think in workflows, not in individual commands.

## Product Entries

### Prompt/Skill

The Prompt/Skill entry is for Codex, Claude Code, and similar coding agents that can read project instructions and run local commands. The product-facing skill is:

```text
.codex/skills/meridian-paper-wiki/SKILL.md
```

It exposes two workflows:

- `Update Wiki`: add or improve durable wiki knowledge.
- `Use Wiki`: retrieve compiled wiki context before answering or coding.

Specialized skills remain available as implementation support for ingest, retrieval, knowledge repair, concepts, personalization, and evolution.

### MCP

The MCP entry is a small scenario-facing surface over the same Markdown vault and Meridian core. It does not replace `wiki/`.

Use Wiki tools:

- `meridian.context`: retrieve compact canonical context for a research or coding intent.
- `meridian.read`: read selected sections from a canonical wiki page.
- `meridian.trace`: return source/evidence/provenance chain for a page or claim.

Update Wiki tools:

- `meridian.update`: add a paper source or user insight through the right workflow.
- `meridian.propose`: create a lintable write-back/refinement proposal.
- `meridian.apply`: lint and publish an approved proposal.
- `meridian.audit`: return health summaries and maintenance actions.

The current implementation provides both:

- a Python adapter under `src/meridian/mcp/adapter.py` for direct calls and JSON bridge smoke tests;
- a stdio MCP server under `src/meridian/mcp/server.py` for MCP client registration.

Both surfaces wrap the same Meridian core functions.

## Workflow Completion Criteria

### Update Wiki

Minimum completion:

- A source, note, synthesis, or refinement request becomes a durable artifact.
- Source provenance and canonical page paths are preserved.
- Index, log, and catalog are updated when canonical pages change.
- Source facts, wiki synthesis, and user insight remain labeled in the artifact.
- The user sees the managed source path, canonical page, proposal path, or next review action.

Canonical example:

```text
The user gives a new paper PDF. Add it to Meridian Paper Wiki, preserve source provenance, publish the canonical paper page when the flow converges, update index/log/catalog, and report the managed source path and canonical wiki page.
```

Canonical example:

```text
The user shares a reading note about a paper. Match it to the canonical paper, preserve the raw note, normalize the insight, publish it as user insight after lint, and make it retrievable as user-supplied context.
```

Canonical example:

```text
The user asks to preserve a comparison discovered during retrieval. Create a write-back proposal from the context packet, keep source facts and synthesis separate, lint it, and publish the synthesis if it passes.
```

### Use Wiki

Minimum completion:

- Retrieval runs against canonical pages.
- The agent reads the highest-value pages or sections from the context packet.
- The answer identifies relevant papers, methods, concepts, evidence, and uncertainty.
- User insight and synthesis pages are labeled as such.
- A durable write-back proposal is created when the user asks to preserve the result.

Canonical example:

```text
The user asks a research or coding question. Retrieve Meridian context first, read the highest-value canonical pages, then answer with the relevant papers, methods, concepts, evidence, and uncertainties.
```

Canonical example:

```text
The user wants to implement a method. Retrieve method pages, prerequisite concept pages, source papers, and evidence records; read implementation hooks and minimal checks before proposing code.
```

Canonical example:

```text
The user asks whether a claim is supported. Retrieve claim/evidence records, trace the provenance to source papers, and separate paper evidence from wiki synthesis.
```

## Execution Layer

CLI commands stay stable because they are easy to test and compose:

- `meridian wiki flow`
- `meridian wiki retrieve`
- `meridian wiki propose-writeback`
- `meridian wiki add-insight`
- `meridian wiki propose-refine`
- `meridian wiki knowledge-audit`
- `meridian wiki concept-audit`

They are execution primitives for Prompt/Skill and MCP entries. The product entry should choose the workflow and call only the commands, adapter functions, or MCP tools needed for the current request.
