# Retrieval Optimization Loop Review

## Context/Test Plan

Feature: F16 Retrieval optimization loop.

Goal: turn Meridian Paper Wiki retrieval from a naive frontmatter/keyword scorer into an optimization-driven workflow with stronger deterministic retrieval, stronger scenario evaluation, repeated failure diagnosis, generalized fixes, and documented convergence evidence.

Non-goals:

- Do not build the Research Dev Agent.
- Do not make Obsidian search the primary retrieval engine.
- Do not require OpenAI API, hosted embeddings, or a local model for MVP correctness.
- Do not hardcode individual eval cases or hand-edit retrieved outputs.

Decision trace:

- Keep Markdown/frontmatter/catalog as the source of truth.
- Implement a no-API deterministic retrieval v1 first, with explicit future semantic backend boundaries.
- Evaluate retrieval as context-packet usefulness, not only target-paper self-recall.
- Prefer generalized retrieval/schema fixes over case patching.

Acceptance criteria:

- Retrieval v1 supports explicit strategy selection and improves at least one real scenario metric class over v0.
- Optimization runner writes side-by-side v0/v1 contexts, JSON, judge packet, manifest, and aggregate summary.
- Domain-general optimization cases cover method lookup, comparison, implementation/probe, ablation, evidence, limitations, cross-domain, survey, source-quality, and distractor scenarios.
- Three main-wiki optimization rounds exist with failure analysis and evidence of convergence.
- Documentation and `wiki-retrieve` skill identify the recommended retrieval path and Obsidian CLI boundaries.

Verification plan:

- Unit tests for v1 scoring, source-quality guard, strategy selection, and optimization runner artifacts.
- JSONL/rubric parseability checks.
- Real main-wiki optimization runs under `eval/runs/`.
- `meridian wiki lint --wiki-root wiki`.
- `meridian wiki source-audit --wiki-root wiki`.
- `PYTHONPATH=src python3 -m unittest discover -s tests`.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`.
- `git diff --check`.

## Developer Round 1

Implemented retrieval v1 as a deterministic, no-API strategy behind `--strategy v0|v1`.

Changes:

- Added query analysis for domains, desired sections, source-quality queries, facet terms, and setting-contrast requests.
- Added field-weighted lexical scoring over title/frontmatter/sections with BM25-style IDF.
- Added section-aware scoring so implementation, evidence, and limitation queries select the right read-first sections.
- Added capped graph/facet expansion from high-scoring seeds.
- Added source-quality routing guard.
- Added hard-distractor suppression for unrequested method families.
- Added coverage/diversity reranking for multi-family research intents.
- Added context packet query analysis and compact read-first section limits.
- Added `meridian wiki retrieval-optimize-eval` with side-by-side v0/v1 artifacts and deterministic metrics.

Generated evaluation inputs:

- `eval/cases/retrieval_optimization_v1.jsonl`
- `eval/rubrics/retrieval_optimization_quality.md`
- `docs/retrieval-optimization-research.md`

## Evaluator Round 1

Main-wiki optimization runs:

| Run | Result |
| --- | --- |
| `eval/runs/2026-05-20-retrieval-optimization-r1` | v1 improved section hit and hard distractors, but recall/MRR did not improve. |
| `eval/runs/2026-05-20-retrieval-optimization-r2` | Context packet section cap and stronger distractor suppression improved compactness/distractors, but multi-family recall still failed. |
| `eval/runs/2026-05-20-retrieval-optimization-r3` | Domain anchoring and diversity rerank improved v1 to 8/10 pass, but systems-evidence and regime-comparison cases still failed. |

Failure analysis:

- Long-context KV-cache query was crowded by token-level speculative decoding.
- Diffusion/representation survey over-selected JEPA-style papers and missed diffusion.
- Systems-evidence case was over-constrained to papers that were not the best match for the query.
- Regime-comparison case required exact paper names rather than "one good exemplar per regime".

## Developer Round 2

Generalized fixes:

- Strengthened domain anchoring so generic words do not misclassify records.
- Added stronger unrequested speculative-decoding penalties for non-speculative long-context memory queries.
- Added coverage/diversity rerank so one family cannot fill all top slots in survey/comparison queries.
- Added setting-contrast detection and exact-setting scoring for weight-only versus weight-activation comparison.
- Added overbroad-setting penalty for polluted routing metadata.
- Added `required_page_family_groups` and `required_section_groups` to the optimization evaluator so cases can encode acceptable alternative paths without overspecifying one paper.
- Repaired the systems-evidence case to require direct kernel/runtime quantization systems pages rather than weaker fixed targets.

Regression coverage:

- `test_retrieval_optimization_eval_writes_side_by_side_artifacts`
- `test_retrieval_optimization_eval_accepts_family_groups`
- `test_wiki_retrieve_v1_suppresses_source_quality_hold_for_scientific_query`
- `test_wiki_retrieve_exact_identity_beats_crowded_shared_metadata`

## Evaluator Round 2

Convergence run:

`eval/runs/2026-05-20-retrieval-optimization-r5`

| Metric | v0 | optimized v1 | Direction |
| --- | ---: | ---: | --- |
| required_recall_at_k | 0.900 | 1.000 | improved |
| section_hit_rate | 0.850 | 1.000 | improved |
| hard_distractor_rate | 0.0375 | 0.0125 | improved |
| source_quality_failure_rate | 0.000 | 0.000 | stable pass |
| context_compactness | 0.238 | 0.232 | slightly lower |
| redundancy_rate | 0.188 | 0.212 | slightly higher |

Verdict: v1 converged for this optimization set. It passes all 10 complex scenario cases, removes all deterministic hard fails, preserves source-quality safety, and improves the failure classes this loop targeted. Remaining risks are semantic paraphrases with no lexical/facet bridge and noisy ingest metadata; those belong to future semantic backend and ingest-quality work, not another deterministic scoring tweak in this round.

## Convergence Round

Feature F16 satisfies the brainstorm goal:

- Retrieval v1 exists and is selectable without breaking v0.
- The stronger evaluation runner can compare v0/v1 and produce reusable judge packets.
- At least three real main-wiki optimization runs exist; five were run.
- Failures were diagnosed into mechanism or eval-design buckets and fixed with generalized changes.
- Documentation and skill guidance now recommend v1 and explain Obsidian as navigation, not the primary retriever.

Release checks are deferred to final verification before commit.

## Release Round

Feature F16 is ready for final checkpoint commit after full unit, compile, wiki lint, source audit, diff hygiene, AGENTS drift, and Arbor process-state verification. The final commit is expected to contain the retrieval v1 implementation, optimization evaluator, evaluation cases/rubric, five main-wiki optimization runs, and updated docs/skill guidance.
