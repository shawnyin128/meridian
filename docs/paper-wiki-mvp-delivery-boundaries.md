---
type: architecture_note
title: "Paper Wiki MVP Delivery Boundaries"
status: current
created: 2026-05-20
updated: 2026-05-20
tags:
  - paper-wiki
  - obsidian
  - mcp
  - zotero
  - writeback
confidence: medium
---

# Paper Wiki MVP Delivery Boundaries

## Purpose

This note defines what Meridian should deliver for the current Paper Wiki MVP and what remains intentionally deferred. The goal is a usable Paper Wiki workflow, not a Research Dev Agent and not a generic RAG platform.

## Current MVP Surfaces

The MVP has four local surfaces:

1. Ingest: `meridian wiki flow` turns a PDF into draft and canonical-draft wiki artifacts with self-check packets.
2. Wiki management: `init`, `publish-run`, `source-audit`, `rebuild-index`, and `lint` maintain the Markdown vault.
3. Retrieval: `catalog`, `retrieve`, `retrieval-eval`, and `retrieval-eval-summary` produce context packets and evaluate retrieval behavior.
4. Query write-back: `propose-writeback` creates draft synthesis/comparison/decision/idea proposals under `.drafts/proposals`.

Canonical mutation remains conservative. Ingest can publish canonical draft paper pages; query write-back creates proposals only.

## Query Write-Back Contract

`propose-writeback` is the MVP bridge from retrieval to compounding wiki state:

```bash
meridian wiki retrieve "<research query>" \
  --wiki-root wiki \
  --out wiki/.drafts/retrieval/context.md \
  --json-out wiki/.drafts/retrieval/context.json

meridian wiki propose-writeback \
  --wiki-root wiki \
  --query "<research query>" \
  --context wiki/.drafts/retrieval/context.json \
  --title "<draft synthesis title>" \
  --proposal-type synthesis
```

The proposal must keep these sections separate:

- source facts to preserve;
- wiki synthesis draft;
- user ideas or decisions;
- uncertainty and gaps;
- publish proposal.

This is intentionally a draft-only flow. Canonical publish of synthesis pages should come after review because query outputs can mix source facts, wiki inference, and user intent.

## Obsidian CLI Boundary

Obsidian is the live reading and navigation surface, not the source of truth. Meridian writes Markdown and JSON directly so changes stay git-auditable.

Current boundary:

- Meridian owns deterministic writes to `wiki/`.
- Obsidian CLI is optional for live search, read, backlink inspection, screenshots, or UI checks when Obsidian is open.
- Do not make core ingest, retrieval, source audit, or proposal creation depend on Obsidian being open.

Future minimal integration:

- `obsidian search` as a secondary navigation check after `meridian wiki retrieve`.
- `obsidian read` for human-visible page inspection.
- `obsidian backlinks` for graph-health diagnostics.

## MCP Boundary

MCP is a delivery surface, not the source of truth. The current MVP should not be blocked on an MCP server.

Minimal future tool surface:

- `paper_wiki.search_context(query, top_k)`: returns the same context-packet semantics as `meridian wiki retrieve`.
- `paper_wiki.read_page(page_id)`: reads a canonical page by stable page id.
- `paper_wiki.source_audit()`: returns source registry health.
- `paper_wiki.propose_writeback(query, context_id, title, body)`: writes a draft proposal.
- `paper_wiki.apply_proposal(proposal_id)`: future reviewed write operation, not part of the current MVP.

Implement read-only MCP first. Add write tools only with propose/apply separation and explicit provenance.

## Zotero And User Notes Boundary

Zotero sync is deferred. The current schema should still be ready for user insight:

```yaml
annotation_sources:
  - zotero://...
user_insights:
  - id: user-insight-001
    source: "zotero annotation | chat | manual note"
    claim: "..."
    relation_to_paper: "supports | questions | extends | contradicts"
```

Rules:

- Zotero annotations and user notes are not paper source facts.
- User insights may guide emphasis, hypotheses, and future synthesis.
- Any page that mixes paper facts and user insight must label them separately.

## Release Gates

Before calling the Paper Wiki MVP usable:

- Ingest, source audit, publish, catalog, retrieve, retrieval-eval, and propose-writeback tests pass.
- Retrieval smoke has no deterministic hard failures on representative canonical pages.
- At least one retrieval-to-writeback flow creates a draft proposal without canonical synthesis mutation.
- `source-audit` and `lint` run on the target wiki with no unaccepted errors.
- Obsidian, MCP, and Zotero boundaries are documented so the product does not overpromise integration.

Before calling retrieval stable:

- Run at least 50 retrieval cases across the real library.
- Record LLM-as-Judge results and sampled human calibration.
- Keep `required_recall_at_5 >= 0.90`, `section_hit_rate >= 0.85`, and zero source-quality hard failures.
