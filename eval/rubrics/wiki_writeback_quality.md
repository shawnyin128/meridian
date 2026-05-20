# Wiki Write-back Quality Rubric

Use this rubric to judge whether a retrieval result was written back into the wiki as a useful, safe, retrieval-ready artifact.

Score each dimension from 1 to 5. A score below 3 in any hard-gate dimension blocks publish.

## 1. Artifact Completeness

- 5: `proposal.md`, `proposal.json`, `source_context.json`, and `publish_plan.md` exist and agree on id, title, query, type, target, and source context.
- 3: Core files exist but metadata is incomplete or mildly inconsistent.
- 1: Missing proposal, manifest, source context, or publish plan.

Hard fail: missing proposal manifest or source context.

## 2. Schema and Section Contract

- 5: Required frontmatter fields and all required body sections are present and machine-readable.
- 3: Minor optional metadata gaps, but source/synthesis/user boundaries are visible.
- 1: Sections are missing or frontmatter cannot support retrieval/publish.

Hard fail: missing `Source Facts`, `Wiki Synthesis`, or `User Ideas / Decisions`.

## 3. Provenance and Source Grounding

- 5: Source papers, source sections, source context, and matched snippets are preserved clearly enough for review.
- 3: Source pages are present but section provenance is weak.
- 1: Proposal cannot be traced back to retrieved pages.

Hard fail: proposal has no retrieved source pages.

## 4. Separation of Source Facts, Synthesis, and User Ideas

- 5: Source facts are factual and cited, synthesis is explicitly interpretive, and user notes appear only in user sections/metadata.
- 3: Separation exists but a few lines are ambiguous.
- 1: User ideas or synthesis are presented as paper claims.

Hard fail: a user hypothesis is attributed to a source.

## 5. Source-quality Guard

- 5: Source-quality holds are identified and limited to cleanup/provenance use.
- 3: Hold state is visible but wording needs cleanup.
- 1: A source-quality hold is used as scientific evidence.

Hard fail: source-quality hold promoted as evidence.

## 6. Publish Safety

- 5: Lint blocks collisions, publish requires lint pass, and overwrite requires explicit operator intent.
- 3: Collision handling exists but error text is weak.
- 1: Publish silently overwrites canonical pages or updates index/log on failure.

Hard fail: silent canonical overwrite.

## 7. Retrieval Readiness

- 5: Published page has useful aliases/topics/methods/related fields and standalone retrieval hooks; future retrieval can find it.
- 3: Page is retrievable mostly by title/query, but metadata needs strengthening.
- 1: Published page is effectively invisible to retrieval.

Hard fail: retrieval cannot return the published page for its own stated query.

## 8. Research Usefulness

- 5: The artifact helps a researcher decide what to read, compare, implement, verify, or test next.
- 3: It preserves context but needs substantial human rewriting before it is useful.
- 1: It is a generic summary scaffold with no durable research value.

## Weighted Decision

Recommended weights:

- Artifact completeness: 1.0
- Schema and section contract: 1.2
- Provenance and source grounding: 1.4
- Separation of source/synthesis/user ideas: 1.6
- Source-quality guard: 1.5
- Publish safety: 1.2
- Retrieval readiness: 1.4
- Research usefulness: 1.2

Pass threshold: weighted score >= 4.2 with no hard fail.

Needs refine: weighted score 3.4 to 4.19 with no hard fail.

Fail: weighted score < 3.4 or any hard fail.
