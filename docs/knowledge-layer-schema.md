# Knowledge Layer Schema

Meridian's knowledge layer is the compiled wiki layer above individual paper pages. It keeps Markdown as the source of truth while making methods, topics, claims, evidence, syntheses, and decisions retrievable as first-class pages.

## Canonical Page Types

- `paper`: source-grounded paper model under `wiki/papers/`.
- `method`: cross-paper method family or candidate method record under `wiki/methods/`.
- `topic`: research topic/navigation surface under `wiki/topics/`.
- `claim`: source-grounded or candidate claim under `wiki/claims/`.
- `evidence`: paper-local evidence item under `wiki/evidence/`.
- `synthesis`: query write-back or comparison under `wiki/syntheses/`.
- `decision`: future decision page or synthesis subtype.

## Frontmatter Contract

Compiled knowledge pages should expose:

- `type`, `title`, `status`, `created`, `updated`
- `aliases`, `sources`, `source_papers`
- `related_papers`, `related_methods`, `related_topics`
- `supports`, `contradicts`, `supersedes`, `superseded_by`
- `confidence`, `review_state`, `evolution_state`, `revision_id`

Compact candidate claim/evidence records may keep a lighter schema when they preserve source paper, confidence, review state, candidate id, and provenance. They are retrievable as candidate records, not finished synthesis.

## Body Sections

Method pages:

- `What It Is`
- `Mechanism`
- `Used By Papers`
- `Implementation Hooks`
- `Failure Modes`
- `Evidence`
- `Open Questions`

Topic pages:

- `Scope`
- `Key Papers`
- `Method Families`
- `Claims`
- `Contradictions`
- `Retrieval Hooks`

Claim pages:

- `Claim`
- `Supporting Evidence`
- `Contradicting Evidence`
- `Scope`
- `Confidence`
- `Provenance`

Evidence pages:

- `Evidence Item`
- `Source`
- `Metric or Observation`
- `Supports`
- `Limits`
- `Reliability`

Synthesis pages:

- `Source Facts`
- `Wiki Synthesis`
- `User Ideas / Decisions`
- `Evidence Map`
- `Open Questions`

## Write Boundary

Low-risk repairs may add backlinks, create missing method/topic pages, add missing machine-readable fields, or reshape compact candidate text into canonical sections without changing source meaning. High-risk changes stay proposal-only: merges, contradiction declarations, claim confidence changes, synthesis rewrites, and user-insight promotion into source-grounded claims.
