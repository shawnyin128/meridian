---
name: wiki-evolve
description: Use when refining, versioning, linting, publishing, reviewing, or retrieving evolved Meridian Paper Wiki canonical pages, including paper, synthesis, topic, method, claim, and evidence pages.
---

# Wiki Evolve

Use this skill when a canonical wiki page should improve after ingest, retrieval, synthesis, or user insight.

## Core Boundary

Refinement is proposal-first. Do not silently rewrite canonical pages.

Preserve the boundary:

- `source fact`: requires source provenance and source re-check for corrections.
- `wiki synthesis`: cross-source interpretation.
- `user insight`: user-supplied interpretation or note.
- `decision`: user's or wiki's action choice.
- `uncertainty`: stale, superseded, conflicting, or needs-source-recheck state.

## Commands

Create a draft refinement:

```bash
meridian wiki propose-refine \
  --wiki-root wiki \
  --target "<canonical page path, title, alias, or query>" \
  --reason "<why refine>" \
  --note "<refinement note>"
```

Use a file:

```bash
meridian wiki propose-refine \
  --wiki-root wiki \
  --target wiki/syntheses/<page>.md \
  --reason "<why refine>" \
  --note-file notes.md
```

Lint and publish:

```bash
meridian wiki refinement-lint wiki/.drafts/refinements/<slug>/refinement.json --wiki-root wiki
meridian wiki publish-refinement wiki/.drafts/refinements/<slug>/refinement.json --wiki-root wiki
```

## Publish Discipline

Publishing creates a snapshot under `.versions/` before changing the canonical page.

The MVP publish path appends a `## Evolution Notes` entry and updates revision frontmatter. It does not rewrite arbitrary source-grounded sections.

If `change_class` is `source_fact_correction`, `source_recheck_required` must be true. A user note alone is not enough to modify source facts.

If the target page changed after proposal creation, lint fails with `stale_target_revision`; regenerate or rebase the proposal.

## Retrieval

Normal retrieval uses latest canonical pages only. `.versions/` snapshots are audit artifacts and must not enter standard retrieval.

When retrieval context shows evolution warnings, carry them into the answer. A stale or source-recheck page can still be useful, but do not use the affected section as settled evidence.
