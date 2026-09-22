# Final LLM Wiki Product Quality Rubric

Use this rubric to judge whether Meridian behaves like a durable LLM Wiki rather than a paper-summary pile.

## Dimensions

1. Compiled knowledge behavior, weight 1.4
   - 5: retrieval and navigation surface synthesis/topic/method/claim/evidence context before isolated paper summaries when the query asks for overview, mechanism, evidence, or planning.
   - 3: relevant pages are retrievable, but the agent must manually stitch too much from papers.
   - 1: output is essentially paper RAG.

2. Boundary preservation, weight 1.4
   - 5: source facts, wiki synthesis, user insight, decision, uncertainty, and source-quality holds are visibly separated in pages, proposals, and context packets.
   - 3: boundaries exist in docs but are not consistently visible.
   - 1: user ideas or source-quality holds are mixed into scientific evidence.

3. Synthesis growth, weight 1.1
   - 5: durable synthesis pages exist, link to source papers/evidence, and are retrievable for realistic research intents.
   - 3: synthesis pages exist but are mostly scaffolds.
   - 1: syntheses are absent or not in the retrieval corpus.

4. Method/topic consolidation, weight 1.0
   - 5: compiled method/topic pages are useful and paper-specific candidate records are suppressed or linked to families.
   - 3: compiled pages exist but candidates still clutter retrieval.
   - 1: method/topic layer is mostly low-information paper-specific fragments.

5. Traceability, weight 1.2
   - 5: claims trace to evidence, evidence traces to source paper/section/page, and synthesis judgments trace to source pages.
   - 3: paper links exist but claim/evidence provenance is incomplete.
   - 1: conclusions cannot be traced.

6. Evolution and uncertainty, weight 1.0
   - 5: stale/superseded/needs-source-recheck states appear in frontmatter, proposals, and retrieval warnings.
   - 3: revision mechanics exist but warnings are incomplete.
   - 1: canonical pages silently drift.

7. Obsidian product shape, weight 0.8
   - 5: vault opens with a clear Map of Content and link-valid indexes; `.drafts` remains internal.
   - 3: canonical pages exist but navigation is rough.
   - 1: users must browse debug outputs.

## Hard Failures

- Source-quality hold is used as scientific evidence.
- User insight is presented as a paper fact.
- Retrieval returns `.drafts` or `.versions` as normal context.
- A contradiction is canonically asserted without proposal/review evidence.
- The wiki has no synthesis layer.

## Expected Evidence

- `docs/final-llm-wiki-product-spec.md`
- `docs/final-llm-wiki-product-quality-brief.md`
- `wiki/.index/final-product-check.json`
- `wiki/.drafts/proposals/final-synthesis-growth-r1/batch.json`
- `wiki/.drafts/knowledge-repair/final-method-consolidation-r1/method-consolidation.json`
- `wiki/.drafts/knowledge-repair/final-contradiction-review-r1/contradiction-review.json`
