# Concept Layer Retrieval Quality Rubric

Use this rubric to judge whether Meridian retrieves preliminary knowledge that is useful before research coding, ablation design, probe design, or debugging.

## Required Outcome Properties

- The result set should include relevant `concept` pages when the query asks for background, prerequisites, implementation checks, failure modes, probes, or sanity checks.
- Concept pages must carry source provenance and should not be generic textbook dumps.
- Method/topic/synthesis results should be connected to prerequisite concepts rather than replacing them.
- Source facts, compiled concept synthesis, and user insights must remain distinguishable.
- Source-quality hold material must not be used as scientific evidence.

## Scoring

Score each case from 1 to 5.

- 5: Retrieves the right concepts, methods, and source/evidence pages; concept sections contain actionable implementation implications and minimal checks; provenance and boundaries are clear; distractors are absent or harmless.
- 4: Retrieves the main concept and at least one useful method/source page; one minor supporting concept or section may be missing, but the context is usable for research work.
- 3: Finds related papers or methods but concept coverage is partial, too generic, or requires substantial extra search before coding.
- 2: Mostly returns paper summaries or method pages and misses the prerequisite knowledge needed for the task.
- 1: Cross-domain contamination, source-quality misuse, or generic stubs dominate the context.

## Hard Fails

- A concept page has no source paper provenance.
- A user insight or source-quality hold is presented as paper evidence.
- Retrieval misses the required concept family for a concept-focused query.
- The context is so broad that it cannot guide implementation/debug/probe decisions.

## Repair Buckets

- `concept_candidate_extraction`: recurring concept was not promoted or was promoted from retrieval/navigation text.
- `concept_schema`: concept page lacks implementation implications, minimal checks, or provenance.
- `method_concept_links`: method/topic pages do not expose prerequisite concepts.
- `retrieval_ranking`: concept exists but is outranked by paper summaries or distractors.
- `source_boundary`: source fact, synthesis, user insight, or source-quality states are mixed.
