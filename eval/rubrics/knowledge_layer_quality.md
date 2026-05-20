# Knowledge Layer Quality Rubric

Use this rubric to judge retrieval and repair artifacts for the compiled knowledge layer.

## Scoring

Score each dimension from 1 to 5.

- 5: Strong, source-bound, retrieval-ready, and useful for downstream research reasoning.
- 4: Usable with minor gaps.
- 3: Partially useful but missing structure, provenance, or routing precision.
- 2: Mostly navigational or too noisy for research use.
- 1: Misleading, unsafe, or source-fact/user-synthesis boundaries are violated.

## Dimensions

- Method/topic usefulness: pages explain scope, mechanism, implementation hooks, failure modes, key papers, and retrieval hooks.
- Provenance completeness: claims and evidence trace back to paper, section/page, candidate id, or canonical source context.
- Graph connectivity: papers link to knowledge pages and knowledge pages link back to source papers without orphaning important concepts.
- Retrieval usefulness: method/design queries surface methods/topics; evidence queries surface claim/evidence/source pages; survey queries surface topic/synthesis pages.
- Source fact boundary: user insights, synthesis, source-quality holds, and source facts remain distinct.
- Contradiction/stale visibility: stale/superseded/source-recheck markers are surfaced as warnings instead of hidden.
- Stub suppression: low-information candidate pages do not dominate retrieval unless the query explicitly targets that candidate/paper.

## Hard Failures

- A source-quality hold is treated as scientific evidence.
- A contradiction is declared automatically without proposal/lint/review.
- A user insight is promoted into a source-grounded claim without source re-check.
- Retrieval returns draft/debug `.drafts` or `.versions` pages in normal mode.
