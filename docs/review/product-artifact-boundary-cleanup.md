# Product Artifact Boundary Cleanup

## Context/Test Plan

Feature: F18 Product artifact boundary cleanup.

Goal: make the Paper Wiki product surface point to managed sources, canonical pages, retrieval context packets, and proposal/write-back artifacts, while keeping ingest candidates, review packets, judge packets, extraction files, and self-check outputs available only as internal/debug/validation artifacts.

Acceptance checks:

- `run.json` and `flow.json` expose `source_artifacts`, `product_artifacts`, `internal_artifacts`, `debug_artifacts`, `validation_artifacts` where applicable, and `retrieval_visibility`.
- Default `meridian wiki ingest` / `meridian wiki flow` output reports product paths and quality state without listing `review.md`, judge packets, or self-check JSON.
- `--verbose-artifacts` exposes internal/debug paths for audit.
- Retrieval returns canonical pages and syntheses only; `.drafts/ingests/**` is excluded.
- Docs and project skills identify canonical `wiki/papers/*.md` / `wiki/syntheses/*.md` as the product reading/retrieval surface.

Planned validation:

- Targeted CLI tests for product-oriented output and verbose artifact output.
- Manifest role regression checks.
- Retrieval draft-exclusion regression.
- Full unit suite and compile checks.
- Main wiki lint/source-audit/catalog.
- Arbor process-state and AGENTS project-map drift checks.

## Developer Round

Implemented changes:

- Added structured artifact role fields to ingest and flow manifests while preserving legacy fields.
- Kept draft `paper.md` for compatibility but labeled it as `paper_candidate` in manifest role fields.
- Added `--verbose-artifacts` to `meridian wiki ingest` and `meridian wiki flow`.
- Changed default ingest/flow CLI summaries to product-facing output: managed source PDF, canonical page, quality gate, review state, index/log updates, and internal artifact root.
- Added `canonical_path` to retrieval results and context packets.
- Added regression tests for default/verbose CLI output, manifest role fields, and retrieval draft exclusion.
- Removed `review.md` and internal `artifacts` references from generated canonical paper pages.
- Mechanically cleaned existing main-wiki canonical paper pages so Obsidian-visible paper pages no longer surface `review.md` as a normal page artifact.
- Added `docs/wiki-product-dataflow-and-artifact-boundaries.md`.
- Updated README, AGENTS project map, and the `llm-wiki`, `paper-ingest`, and `wiki-retrieve` skills.

Developer smoke evidence:

- Targeted regression tests for ingest output, flow output, manifest roles, and draft-exclusion retrieval passed.

## Evaluator Round

Evaluator checks completed:

- Targeted regression tests passed: ingest default output, flow default output, manifest role fields, and draft-exclusion retrieval.
- Full unit suite passed: `PYTHONPATH=src python3 -m unittest discover -s tests`.
- Compile check passed: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`.
- Diff whitespace check passed: `git diff --check`.
- Main wiki lint passed with one informational finding for the newly ingested STS page having no wikilinks.
- Main wiki source audit passed: 238 sources, 0 missing managed files, 0 SHA mismatches, 0 duplicate SHA groups.
- Main wiki catalog rebuilt successfully: canonical paper/synthesis catalogs only.
- Catalog/index search found no `.drafts/ingests`, `paper_candidate`, `review.md`, or `judge-packet` links.
- Canonical paper/synthesis search found no `artifacts:`, `Review packet: review.md`, `Full extraction and review details live`, or `inspect review.md` product-surface leakage.
- Arbor process-state check passed.
- AGENTS project-map drift hook passed.

## Convergence Round

Converged.

The implementation satisfies the product-boundary requirement without breaking legacy pipeline fields. Draft `paper.md` remains available for existing publish/self-check code, but it is now semantically classified as an internal `paper_candidate`; canonical `wiki/papers/*.md` and `wiki/syntheses/*.md` remain the retrieval corpus. Default CLI output is cleaner, canonical paper pages no longer surface review/debug files as daily reading artifacts, and `--verbose-artifacts` preserves audit access.

## Release Round

Ready for release commit after staging:

- Code/docs/tests/skills updated.
- Real main wiki index/log/catalog include the previously requested STS ingest output.
- `.arbor/workflow/features.json` tracks F18 as the active feature for release.
