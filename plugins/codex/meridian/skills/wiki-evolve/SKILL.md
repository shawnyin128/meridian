---
name: wiki-evolve
description: Use when refining, versioning, linting, publishing, reviewing, or retrieving evolved Meridian Paper Wiki canonical pages, including paper, synthesis, topic, method, claim, and evidence pages.
---

# Wiki Evolve

Use this skill when a canonical wiki page should improve after ingest, retrieval, synthesis, or user insight.

For product-facing usage, start from the `wiki` skill and choose `Update Wiki`. This skill is the evolution/revision support module.

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

Final-product quality fields should travel with evolution:

- `quality_state`: product-level trust bucket.
- `validation_state`: what has been validated.
- `trust_state`: how downstream agents may use the page.
- `evolution_state`: latest revision health.
- `evolution_markers`: section/page-level warnings such as stale, superseded, conflicting synthesis, or needs source re-check.

If refinement changes these fields, keep the old version in `.versions/` and make the reason explicit in `Evolution Notes`.

## Knowledge Layer Repair

For broad structural issues across method/topic/claim/evidence/synthesis pages, prefer knowledge repair over many direct refinements:

```bash
meridian wiki knowledge-audit --wiki-root wiki
meridian wiki propose-knowledge-repair --wiki-root wiki --out wiki/.drafts/knowledge-repair/<slug>/
meridian wiki knowledge-repair-lint wiki/.drafts/knowledge-repair/<slug>/repair.json --wiki-root wiki
meridian wiki publish-knowledge-repair wiki/.drafts/knowledge-repair/<slug>/repair.json --wiki-root wiki
```

Publishing a knowledge repair creates snapshots before updating existing canonical knowledge pages. It is only for low-risk structural repairs; contradiction declarations, claim confidence changes, and synthesis rewrites still require proposal/refinement review.
