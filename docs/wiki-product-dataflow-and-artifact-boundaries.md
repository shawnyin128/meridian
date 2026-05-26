# Wiki Product Dataflow and Artifact Boundaries

This document defines the product boundary for Meridian Paper Wiki artifacts. In
the product path, a user-level library root contains both the managed source
store and the canonical Obsidian vault. Legacy project-local usage may still use
`wiki/` directly. Ingest, validation, and debug files exist to make that wiki
auditable, but they are not the product reading surface.

## Product Dataflow

```text
input PDF
  -> managed source PDF in <library-root>/sources/papers/
  -> ingest run artifacts in <library-root>/wiki/.drafts/ingests/<run>/
  -> canonical paper page in <library-root>/wiki/papers/<paper>.md
  -> catalog/index/log updates
  -> retrieval context packets from canonical corpus
  -> optional write-back proposal
  -> canonical synthesis/method/topic pages after publish
```

The important invariant is that retrieval and Obsidian reading use canonical wiki pages, not draft ingest candidates. Drafts remain available for audit, replay, and quality debugging.

## Artifact Taxonomy

### Source Artifacts

User-facing for provenance, immutable for content:

- `wiki/raw/sources/papers/*.pdf`: managed source PDFs.
- `wiki/raw/sources/sources.jsonl`: source registry with original path, managed path, `source_id`, SHA, title, and timestamps.
- `wiki/raw/sources/index.md`: Obsidian-readable source audit index.

For configured workspaces, the same source artifacts live under
`<library-root>/sources/` and `wiki/` is `<library-root>/wiki/`.

The managed source path is the stable file reference for wiki pages. Arbitrary desktop/download paths are preserved as registry metadata, not used as retrieval targets.

### Canonical Wiki Artifacts

User-facing and retrieval-visible:

- `wiki/papers/*.md`: canonical paper pages.
- `wiki/syntheses/*.md`: published synthesis/comparison/method-family/decision/research-question pages.
- `wiki/topics/*.md`, `wiki/methods/*.md`, `wiki/claims/*.md`, `wiki/evidence/*.md`: canonical graph support pages.
- `wiki/index.md`: Obsidian navigation index.
- `wiki/log.md`: append-only wiki activity log.
- `wiki/.index/papers.jsonl` and `wiki/.index/syntheses.jsonl`: generated retrieval catalogs for canonical corpus pages.

These are the normal product outputs. A user should be able to open `wiki/` in Obsidian and work primarily from these files.

### Draft Proposal Artifacts

User-facing only during review/write-back:

- `wiki/.drafts/proposals/<proposal>/proposal.md`
- `wiki/.drafts/proposals/<proposal>/proposal.json`
- `wiki/.drafts/proposals/<proposal>/source_context.json`
- `wiki/.drafts/proposals/<proposal>/publish_plan.md`

Proposals are not canonical knowledge until `proposal-lint` passes and `publish-proposal` writes a canonical synthesis page.

### Ingest Run Artifacts

Internal, replayable, and audit-facing:

- `wiki/.drafts/ingests/<run>/paper.md`: internal canonical paper candidate. It is not the final wiki page.
- `wiki/.drafts/ingests/<run>/claims.jsonl`
- `wiki/.drafts/ingests/<run>/methods.jsonl`
- `wiki/.drafts/ingests/<run>/evidence.jsonl`
- `wiki/.drafts/ingests/<run>/extraction/`
- `wiki/.drafts/ingests/<run>/run.json`
- `wiki/.drafts/ingests/<run>/flow.json`

`paper.md` is kept for backward-compatible pipeline code, but manifests and CLI output describe it as `paper_candidate`. The canonical page is `wiki/papers/<paper>.md`.

### Eval / Debug Artifacts

Internal validation artifacts:

- `review.md`
- `judge-packet.md`
- `reader-check.md`
- `quality-self-check.json`
- `structural-self-check.json`
- `self-check/`
- eval run manifests and judge packets under `eval/runs/`

These files are useful for debugging ingest quality and convergence, but they should not be linked from the main Obsidian index as normal reading entries.

### Retrieval Artifacts

User-facing as temporary context, not canonical knowledge:

- `wiki/.drafts/retrieval/<slug>/context.md`
- `wiki/.drafts/retrieval/<slug>/context.json`

A retrieval context packet is a ranked reading plan over canonical pages. It may lead to a write-back proposal when the query produces durable synthesis.

## Manifest Role Fields

`run.json` and `flow.json` expose artifact roles explicitly:

- `source_artifacts`: managed source PDF, source registry, source ID, SHA.
- `product_artifacts`: canonical wiki page, index, log, managed source reference.
- `canonical_artifacts`: backward-compatible canonical publish paths.
- `internal_artifacts`: draft candidate, candidate records, extraction directory, run manifest.
- `debug_artifacts`: review packet and extraction inspection files.
- `validation_artifacts`: judge, reader, quality, structural, and convergence files created by `flow`.
- `retrieval_visibility`: canonical corpus policy, included/excluded globs, and whether the draft candidate is indexed.

Default CLI output should summarize `source_artifacts`, `product_artifacts`, quality/review state, and the internal artifact root. It should not list every debug file unless `--verbose-artifacts` is provided.

## Retrieval Boundary

Retrieval uses the canonical wiki corpus:

- include `wiki/papers/*.md`
- include `wiki/syntheses/*.md`
- exclude `wiki/.drafts/ingests/**`
- exclude `review.md`, self-check packets, judge packets, and extraction files

Context packets must mark `result_type` and `canonical_path` so agents know whether they are reading source-level paper pages or higher-level synthesis pages.

## Obsidian Boundary

The Obsidian vault root is `wiki/`. The main navigation should point to canonical pages, source index, syntheses, methods, topics, and logs. `.drafts/` is intentionally present for auditability but should be treated as an internal workspace, not the daily reading surface.

When in doubt:

- Read `wiki/papers/<paper>.md` for paper understanding.
- Read `wiki/.drafts/ingests/<run>/run.json` for pipeline audit.
- Read `review.md` / self-check files only when debugging the ingest mechanism.
- Use retrieval contexts as temporary reading plans and publish durable insights through proposals.
