# Final LLM Wiki Product Convergence

## Context/Test Plan

Goal: converge Meridian from a retrieval-ready paper library into the final LLM Wiki product shape. The accepted product loop is:

`source ingest -> canonical paper -> knowledge extraction/promote -> method/topic/claim/evidence consolidation -> retrieval -> synthesis/write-back -> user insight -> refinement/evolution -> updated retrieval corpus`.

Test plan:

- Add CLI support for final status migration, synthesis growth batch, method consolidation proposal, contradiction review proposal, Obsidian navigation, and final product readiness check.
- Add regression tests for quality-state visibility, synthesis publish/retrieval, method consolidation proposal-first behavior, contradiction candidate proposal-first behavior, and final navigation/product checks.
- Run the commands against the main `wiki/`.
- Verify lint/source-audit/catalog/knowledge-audit behavior and document residuals.

## Developer Round

Implemented:

- `src/meridian/wiki/final_product.py`
  - `final-status-migrate`
  - `propose-synthesis-batch`
  - `publish-synthesis-batch`
  - `propose-method-consolidation`
  - `propose-contradiction-review`
  - `build-navigation`
  - `final-product-check`
- Retrieval catalog/context now carries `corpus_type`, `quality_state`, `validation_state`, and `trust_state`.
- Synthesis pages are boosted for overview-style retrieval and method-family synthesis pages remain typed.
- Retrieval eval now defaults to the full canonical corpus when no explicit catalog is provided, so optimization cases can evaluate papers, syntheses, methods, topics, claims, and evidence together.
- Retrieval optimization matching supports structural selectors such as `type:method`, `corpus:syntheses`, `role:compiled_knowledge`, `quality:source_quality_hold`, and `section:User Insights`.
- v1 retrieval diversification now separately preselects synthesis/topic, claim/evidence, and supporting paper context rather than treating each pair as interchangeable.
- Evidence derived from source-quality-hold papers is marked and suppressed for ordinary scientific-evidence retrieval.
- Query write-back path resolution handles repo-relative wiki paths.
- Knowledge audit no longer misclassifies explicit source-quality guard text as evidence contamination.

Main wiki actions:

- Migrated 236 paper pages to final quality-state fields.
- Published 6 canonical synthesis pages.
- Generated method consolidation proposal for 239 paper-specific method records.
- Generated contradiction/stale/source-quality review proposal with 12 candidates.
- Built 6 Obsidian navigation pages.

## Evaluator Round

Regression tests added in `tests/test_cli.py`:

- `test_final_status_migration_adds_retrieval_visible_quality_states`
- `test_synthesis_growth_batch_publishes_retrievable_compiled_context`
- `test_method_consolidation_and_contradiction_review_are_proposal_first`
- `test_navigation_and_final_product_check`
- `test_final_retrieval_eval_uses_full_corpus_and_suppresses_source_quality_evidence`

Observed main wiki evidence:

- `wiki/.index/final-status-migration.json`
- `wiki/.drafts/proposals/final-synthesis-growth-r1/batch.json`
- `wiki/.drafts/knowledge-repair/final-method-consolidation-r1/method-consolidation.json`
- `wiki/.drafts/knowledge-repair/final-contradiction-review-r1/contradiction-review.json`
- `wiki/.index/obsidian-navigation.json`
- `wiki/.index/final-product-check.json`
- `eval/runs/final-llm-wiki-product-r1/summary.json`

Final product check status is `warn`, not `fail`; residual warnings are documented in `docs/final-llm-wiki-product-quality-brief.md`.

Final product retrieval eval:

- v0 pass: 1 / 5
- v1 pass: 5 / 5
- required_recall_at_k: 0.467 -> 1.000
- MRR: 0.265 -> 0.521
- source_quality_failure_rate: 0.000

## Convergence Round

Converged for MVP:

- The wiki now has paper + method + topic + claim + evidence + synthesis + user insight + evolution infrastructure.
- Retrieval context can surface synthesis-layer pages and exposes final quality-state fields.
- Retrieval v1 now returns compiled context across method/topic/synthesis/claim/evidence/paper result types for final-product scenarios.
- High-risk operations remain proposal-first.
- Obsidian navigation exists and points to canonical pages rather than debug artifacts.

Residuals:

- 239 paper-specific method candidate pages remain low-information records, but they are now consolidated in a proposal and suppressed in retrieval unless exact identity is requested.
- Duplicate method/topic aliases remain proposal-level work.
- Synthesis pages are low-confidence scaffolds; they are useful as durable starting points, not final human-reviewed theses.

## Release Round

Release gates to run before commit:

- `PYTHONPATH=src python3 -m unittest discover -s tests`
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`
- `git diff --check`
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki`
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki`
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki`
- `PYTHONPATH=src python3 -m meridian wiki knowledge-audit --wiki-root wiki`
- Arbor process-state check
- AGENTS project-map drift hook
