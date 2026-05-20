# User Insight Personalization MVP

Meridian personalization lets the user attach reading insights, corrections, retrieval hints, and implementation notes to canonical paper pages without pretending those notes are paper source facts.

## Product Goal

The user can write natural language or structured text such as:

- "I think this paper is mainly useful for probe design, not as a baseline."
- "paper.md overstates the evidence; the experiment only supports the long-context setting."
- "Remember this with MagicDec when I work on speculative decoding acceptance rate."
- "For implementation, log routing entropy and expert usage variance."

Meridian should match the note to one canonical paper, preserve the raw user input, create a reviewable draft, lint the boundary, and then publish into the paper page's `## User Insights` section.

## Schema

User insight artifact types:

- `paper-note`
- `paper-correction`
- `research-insight`
- `retrieval-hint`
- `cross-paper-connection`
- `implementation-note`
- `limitation-note`
- `future-question`

Each `insight.json` includes:

- `insight_id`
- `insight_type`
- `target_paper`
- `target_page`
- `source_type: "user_insight"`
- `provenance: "user_supplied"`
- `user_input_raw`
- `normalized_summary`
- `confidence`
- `created_at` / `updated_at`
- `affected_sections`
- `retrieval_impact`
- `publish_state`
- `refinement_proposal`

The invariant is simple: `user_input_raw` is the user's statement; `normalized_summary` is a faithful compressed version; neither is a paper source fact unless source re-check later verifies it.

## Commands

Create a draft insight:

```bash
meridian wiki add-insight \
  --wiki-root wiki \
  --paper "CodeQuant" \
  --note "For my project, this is most useful for routing-stability probes." \
  --insight-type implementation-note
```

Use a note file:

```bash
meridian wiki add-insight \
  --wiki-root wiki \
  --paper "paper about MoE activation outliers" \
  --note-file notes.md
```

Validate and publish:

```bash
meridian wiki insight-lint wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
meridian wiki publish-insight wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
```

## Paper Matching

`--paper` can be:

- canonical path, e.g. `wiki/papers/MoE-PTQ.md`
- relative canonical path, e.g. `papers/MoE-PTQ.md`
- page title
- alias
- `source_id`
- natural-language paper query

Matching uses canonical paper catalog records first. Exact path/title/alias/source-id matches win. If there is no exact match, Meridian uses retrieval v1 over canonical paper records only. Ambiguous or missing matches produce a disambiguation artifact under `wiki/.drafts/insights/` and do not publish.

## Draft Artifacts

Matched insight drafts write:

```text
wiki/.drafts/insights/<slug>/
  insight.md
  insight.json
  target_context.json
  publish_plan.md
```

Ambiguous or no-match attempts write `insight.md`, `insight.json`, and `target_context.json`, but `publish_state` blocks publish.

`insight.md` sections:

- User Input
- Matched Paper
- Normalized User Insight
- Potential Wiki Updates
- Source Fact Boundary
- Retrieval Impact
- Open Questions

## Publish Behavior

`publish-insight` only writes to the target paper page's `## User Insights` section and updates frontmatter:

- `user_insights`
- `personalized: true`
- `updated`

It does not rewrite `What To Remember`, `Mechanism`, `Evidence Map`, or other source-grounded sections. If the user says a source-grounded section is wrong, the insight is recorded as user-supplied and the refinement proposal marks `source_recheck_required: true`.

## Retrieval Behavior

Retrieval indexes `## User Insights` as a section. When a query matches user insight text, the context packet marks:

- `Source types matched: user_insight`
- boundary warning that this is user-supplied context, not paper source fact or scientific evidence

Implementation or idea queries may use user insights as personalized context. Evidence/source-fact queries must not treat them as paper evidence.

## Zotero Adapter Boundary

Zotero is postponed, but the same schema can accept annotations later.

Minimal future adapter:

1. Import Zotero item metadata and annotations.
2. Map Zotero item to `source_id` / canonical paper page using DOI, title, file hash, or source registry path.
3. Preserve highlight text, user comment, page number, Zotero key, and attachment provenance.
4. Emit the same `insight.json` schema with `source_type: "user_insight"` and `provenance: "zotero_annotation"`.
5. Require the same `insight-lint` and `publish-insight` path before canonical mutation.

No Zotero sync is part of the MVP.
