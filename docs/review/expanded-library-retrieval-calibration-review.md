---
type: review
title: "Expanded Library Retrieval Calibration Review"
status: done
created: 2026-05-20
updated: 2026-05-20
tags:
  - arbor
  - paper-wiki
  - retrieval
  - evaluation
---

# Expanded Library Retrieval Calibration Review

Feature: F12

## Context/Test Plan

The goal was to expand from representative Paper Wiki retrieval checks to a full real-library calibration over the user's Zotero-derived PDF folder, automatically fix generalized failures, and stop only when retrieval quality converged.

Acceptance criteria:

- Full-library ingest/eval completes without blocking errors.
- Managed source state is complete and audit-clean.
- Canonical wiki lint and catalog generation succeed.
- Retrieval audit runs over every canonical paper page with per-query context packets.
- Failures are diagnosed into reusable ingest/retrieval fixes rather than one-off page edits.
- Final quality brief documents metrics, residual risks, and readiness.

## Developer Round 1

Implemented generalized fixes:

- Added `--no-page-images` to large batch ingest/flow/eval and propagated extraction options into run manifests and structural checks.
- Made canonical publish initialize the wiki vault scaffold before writing pages.
- Added exact identity boosting in retrieval scoring for discriminative method aliases and title-derived method names.
- Filtered generic aliases from title-derived identity anchors.
- Updated retrieval audit queries to include paper identity and method discriminators across method, implementation, and evidence/scope intents.
- Reordered primary paper detection so actual target methods beat related-work baseline mentions.
- Added primary-specific quantization positioning and evidence routing.
- Added a non-LLM clustering boundary so clustering papers do not inherit LLM quantization/LUT metadata.

Regression tests added or updated:

- Batch ingest can skip page images while preserving structural consistency.
- Retrieval audit evidence queries include method discriminators.
- Retrieval audit implementation queries include paper identity.
- Exact identity beats crowded shared quantization metadata.
- Primary paper key prefers target method over baseline mentions.
- PINN/PDE detection does not treat `support` as `ppo`.
- Non-LLM clustering does not inherit quantization routing.

## Evaluator Round 1

Full-library run:

- Case set: `eval/runs/2026-05-20-expanded-library/cases.jsonl`
- Final run: `eval/runs/2026-05-20-expanded-library-r6/`
- Input cases: 244
- Generated outputs: 244
- Error count: 0
- Unique managed sources/canonical paper pages: 237

Structural evidence:

- `meridian wiki source-audit --wiki-root eval/runs/2026-05-20-expanded-library-r6/wiki`
  - Sources: 237
  - Missing managed files: 0
  - SHA mismatches: 0
  - Duplicate SHA groups: 0
- `meridian wiki lint --wiki-root eval/runs/2026-05-20-expanded-library-r6/wiki`
  - Status: pass
  - Findings: 237 info-level findings
- `meridian wiki catalog --wiki-root eval/runs/2026-05-20-expanded-library-r6/wiki`
  - Catalog entries: 237

Retrieval evidence:

- Final audit: `eval/runs/2026-05-20-expanded-library-r6/retrieval-audit-final/`
- Papers audited: 237
- Queries run: 711
- Query recall@5: 1.000
- Query recall@1: 0.928
- Paper full-recall rate: 1.000
- Average target rank: 1.096
- Metadata-sparse papers: 0
- Paper decisions: 233 pass, 4 needs_review, 0 fail

Observed warnings:

- 3 `target_rank_below_top_3` warnings where the target was still found.
- 1 `top_neighbors_have_no_routing_overlap` warning on a source-quality page.

Drift checks:

Checked concrete calibration regressions:

- DuQuant no longer aliases itself as SmoothQuant and now routes by dual transformation/outlier distribution.
- FlatQuant positioning no longer describes KV-cache or long-context retrieval.
- Concrete k-means/deep clustering no longer picks up non-uniform quantization, hardware-aware quantization, or LUT/kernel settings.

## Convergence Round 1

Decision: converged.

Reasoning:

- The final full-library audit has no hard retrieval failures and full target recall at top 5.
- Source management and canonical wiki structure are audit-clean.
- Remaining warnings do not block retrieval readiness because all warning pages are still recovered and the source-quality warning is expected.
- The fixes are generalized in code and tests rather than manual page edits.

Residual risks:

- The full run used text-only extraction with `--no-page-images`.
- Full LLM-as-Judge quality judging was not run for all 244 cases.
- Cross-paper wikilinks/concept pages are still not part of this feature.

Next owner:

- Future Paper Wiki retrieval work should move from exact paper recovery to scenario-level idea retrieval and semantic/reranked context selection.

## Release Round 1

Ready for checkpoint commit after final Arbor process-state replay, git diff check, and git status verification.
