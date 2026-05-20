# Wiki Evolution MVP

Meridian's evolution layer lets canonical wiki pages improve without silent rewrites.

The goal is not to build a CMS. The goal is to make paper pages, synthesis pages, and later topic/method/claim pages refineable, versioned, auditable, and retrieval-aware while preserving the LLM Wiki boundary between source facts, wiki synthesis, user insight, decisions, and uncertainty.

## Artifact Model

Evolution uses proposal-first writes:

```text
canonical page
  -> refinement proposal
  -> refinement lint
  -> version snapshot
  -> canonical revision
  -> index/log/catalog rebuild
```

Draft artifacts live under:

```text
wiki/.drafts/refinements/<slug>/
  refinement.md
  refinement.json
  diff.md
  source_context.json
  publish_plan.md
```

Old canonical page versions live under:

```text
wiki/.versions/<page-directory>/<page-slug>/<revision-id>.md
```

`.versions/` is for audit and rollback. It is not part of normal retrieval.

## Refinement Schema

Every `refinement.json` uses `meridian.wiki_refinement.v1` and records:

- `refinement_id`
- `refinement_type`
- `target_page`
- `target_type`
- `target_revision_before`
- `reason`
- `user_note_raw`
- `from_insight`
- `proposed_changes`
- `affected_sections`
- `change_class`
- `provenance_inputs`
- `source_recheck_required`
- `confidence`
- `publish_state`
- `created_at` / `updated_at`

Allowed change classes:

- `source_fact_correction`
- `wiki_synthesis_update`
- `user_insight_integration`
- `retrieval_metadata_update`
- `structure_cleanup`
- `stale_claim_update`
- `crosslink_update`
- `decision_update`

## Commands

Create a refinement proposal:

```bash
meridian wiki propose-refine \
  --wiki-root wiki \
  --target wiki/papers/<paper>.md \
  --reason "method section is too shallow" \
  --note "Clarify the implementation mechanism before using this for ablations."
```

Use a note file:

```bash
meridian wiki propose-refine \
  --wiki-root wiki \
  --target wiki/syntheses/<synthesis>.md \
  --reason "new papers changed this comparison" \
  --note-file notes.md
```

Refine from a published user insight:

```bash
meridian wiki propose-refine \
  --wiki-root wiki \
  --target wiki/papers/<paper>.md \
  --from-insight insight-2026-05-20-abc123 \
  --reason "integrate the user insight into retrieval behavior" \
  --change-class user_insight_integration
```

Lint and publish:

```bash
meridian wiki refinement-lint wiki/.drafts/refinements/<slug>/refinement.json --wiki-root wiki
meridian wiki publish-refinement wiki/.drafts/refinements/<slug>/refinement.json --wiki-root wiki
```

## Publish Behavior

Publishing a lint-passing refinement:

- creates a pre-publish snapshot in `.versions/`
- appends a canonical `## Evolution Notes` entry
- updates frontmatter:
  - `revision_id`
  - `revision_count`
  - `previous_revision`
  - `evolution_state`
  - `evolution_markers`
  - `last_refinement_id`
  - `updated`
- rebuilds `wiki/index.md`
- rebuilds paper/synthesis catalog as appropriate
- appends a parseable `wiki/log.md` entry

The MVP publish path intentionally appends a reviewed evolution note rather than trying to rewrite arbitrary paper prose. This is conservative and auditable. Future versions can add section-specific patching once rewrite quality is evaluated.

## Boundary Rules

Source facts require source provenance. A `source_fact_correction` must set `source_recheck_required: true`; lint blocks it otherwise.

User insight integration cannot become source fact. If a user says the paper page is wrong, Meridian can record and propose the correction, but it cannot rewrite source-grounded sections without a source re-check.

Synthesis updates must stay synthesis. Decisions belong in decision/evolution notes, not in paper-authored evidence.

Source-quality holds cannot be promoted as scientific evidence through refinement.

## Retrieval Behavior

Retrieval continues to use only canonical latest pages from:

- `wiki/papers/*.md`
- `wiki/syntheses/*.md`

Normal retrieval does not scan `.versions/`.

Catalog records include revision/evolution fields. Context packets show:

- `Revision`
- `evolution_state`
- evolution warnings for `stale`, `superseded`, `conflicting_synthesis`, or `needs_source_recheck`

This lets agents use the latest page while seeing whether the page has unresolved evolution state.

## Current MVP Scope

Fully supported:

- paper page refinement
- synthesis page refinement
- snapshot creation
- stale target revision blocking
- revision/evolution retrieval metadata

Minimal/safe support:

- method/topic/claim/evidence target matching and refinement artifacts

Future extensions:

- source-backed section patching
- rollback command
- revision history mode in retrieval
- automatic stale-claim lint over the full wiki
