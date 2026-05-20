---
type: "arbor_review"
feature_id: "F15"
title: "Main Obsidian Paper Wiki Vault Productization Review"
status: "draft"
created: "2026-05-20"
updated: "2026-05-20"
---

# Main Obsidian Paper Wiki Vault Productization Review

## Context/Test Plan

F14 improved domain-general ingest quality, but the real working vault was still missing: `wiki/` was an empty shell while source-managed canonical pages lived under `eval/runs/.../wiki`.

This feature productizes the main vault:

- initialize `wiki/` as the actual Obsidian-readable vault
- rerun the real Zotero-derived library with the latest ingest pipeline into the main vault
- keep raw PDFs managed under `wiki/raw/sources/`
- add useful graph links without turning paper pages into noisy link dumps
- validate source audit, lint, catalog, retrieval audit, domain-general retrieval, and source-quality routing on `wiki/`
- document remaining limitations and the review-state strategy

Acceptance checks:

- `wiki/` has source registry, managed sources, canonical pages, index, log, catalog, and draft directories
- canonical paper pages contain stable wikilinks to topic/method/record pages
- source audit reports zero missing files and zero SHA mismatches
- lint passes without orphan-style wikilink warnings for paper pages
- retrieval audit and idea-level retrieval pass on the main wiki
- quality metrics show latest F14 improvements are reflected in main wiki outputs

## Developer Round 1

Implemented the main vault productization path:

- initialized and populated `wiki/` from `/Users/shawn/Desktop/我的文库` through the latest `meridian wiki flow` pipeline;
- added source-managed publish/promotion fixes so candidate records use paper-scoped filenames instead of cross-paper `method-001.md` overwrites;
- added paper-to-topic/method/claim/evidence `## Wiki Graph Links`;
- capped promoted evidence records to avoid long books flooding the graph;
- added deterministic review-state propagation from flow results into canonical frontmatter;
- fixed duplicate frontmatter field insertion;
- optimized retrieval audit by caching section contents/tokens and removing per-candidate snippet ranking;
- fixed GQA domain routing so grouped-query attention is not misclassified as FlashAttention-style kernel optimization;
- updated domain-general retrieval cases to use path-flexible required page patterns;
- added a main-wiki source-quality retrieval case.

Generated main-vault state:

- 237 managed sources
- 235 canonical paper pages after duplicate canonical cleanup
- 91 topic pages
- 302 method/candidate pages
- 1135 claim pages
- 2737 evidence pages
- 235/235 paper pages with wikilinks
- review states: 234 `auto_converged`, 1 `source_quality_hold`

## Evaluator Round 1

Replay checks on the main wiki:

- `meridian wiki source-audit --wiki-root wiki`: pass, 237 sources, 0 missing, 0 SHA mismatch, 0 duplicate SHA groups.
- `meridian wiki lint --wiki-root wiki`: pass, 0 findings.
- `meridian wiki catalog --wiki-root wiki`: 235 entries, matching canonical paper pages.
- `meridian wiki retrieval-audit --wiki-root wiki --top-k 5 --queries-per-paper 3`: 235 papers, 705 queries, recall@5 1.000, recall@1 0.926.
- `meridian wiki retrieval-eval eval/cases/domain_general_idea_retrieval.jsonl --wiki-root wiki`: 6/6 deterministic pass.
- `meridian wiki retrieval-eval eval/cases/main_wiki_source_quality_retrieval.jsonl --wiki-root wiki`: 1/1 deterministic pass.
- `meridian wiki propose-writeback ...`: produced draft proposal `wiki/.drafts/proposals/Agent-Speculative-Execution-Reading-Plan/proposal.md`.

Adversarial findings addressed:

- Full retrieval audit initially stalled due repeated catalog/body scoring; fixed with cached section scoring.
- GQA self-recall failed because the ingest routed grouped-query attention as attention-kernel optimization; fixed the domain rule and reran that paper through the pipeline.
- Two duplicate canonical paper identities caused retrieval ambiguity; removed generated duplicate canonical/candidate artifacts and preserved duplicate cleanup evidence in `.index/duplicate-cleanup.json`.

## Convergence Round

Converged for MVP productization. The main `wiki/` is usable as the daily Obsidian Paper Wiki vault and passes source/canonical/retrieval gates. Remaining limitations are documented in `docs/main-wiki-productization-quality-brief.md`:

- full-library page images were skipped, so `quality_gate: warn` remains advisory across canonical pages;
- Obsidian CLI live navigation was not verified because Obsidian was not running;
- duplicate source-identity prevention should become automatic before future publishes.

## Release Round

Feature F15 was finalized in commit `29c6911` (`docs: verify main wiki obsidian vault registration`). The remaining retrieval-specific follow-up moved to F16.
