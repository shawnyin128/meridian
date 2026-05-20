# Wiki Evolution and Revision MVP

## Context/Test Plan

Feature: F20 Wiki evolution and revision MVP.

Goal: let canonical paper and synthesis pages evolve through a proposal-first, linted, versioned publish path while preserving source fact, wiki synthesis, user insight, decision, and uncertainty boundaries.

Acceptance checks:

- `meridian wiki propose-refine` can target canonical paper/synthesis pages by path, title, alias, or retrieval query.
- Internal/debug paths under `.drafts` and old snapshots under `.versions` are not accepted as normal refinement targets.
- Draft refinement artifacts include `refinement.md`, `refinement.json`, `diff.md`, `source_context.json`, and `publish_plan.md`.
- `refinement-lint` blocks source fact corrections without source re-check, stale target revisions, missing artifacts, weak provenance, and source-quality misuse.
- `publish-refinement` creates a `.versions/` snapshot before mutating canonical pages.
- Canonical pages update revision frontmatter and append `## Evolution Notes`.
- Retrieval uses latest canonical pages, ignores `.versions/`, and shows revision/evolution warnings.

Planned validation:

- Targeted unit tests for proposal creation, lint/publish, stale target, source fact negative case, synthesis refinement, internal target block, and retrieval warning/snapshot exclusion.
- Full unit suite and compile checks.
- Main wiki lint/source-audit/catalog.
- Real canonical paper refinement smoke.
- Real synthesis refinement smoke when at least one synthesis exists.
- Arbor process-state and AGENTS project-map drift checks.

## Developer Round

Implemented:

- Added `src/meridian/wiki/evolution.py` with refinement schema, target matching, draft generation, lint, publish, snapshot creation, and canonical page update logic.
- Added CLI commands: `propose-refine`, `refinement-lint`, and `publish-refinement`.
- Added `.drafts/refinements` and `.versions` to vault scaffolding.
- Added revision/evolution fields to retrieval catalog and context packets.
- Added docs, skill, eval cases, and rubric for evolution.
- Added regression tests for paper/synthesis refinement, snapshot publish, stale target blocking, source fact correction re-check, internal target blocking, latest retrieval, and `.versions` exclusion.

Developer smoke evidence:

- Targeted evolution tests passed.

## Evaluator Round

Validation replay:

- JSONL case file validated line-by-line: `eval/cases/wiki_evolution_mvp.jsonl`.
- Targeted evolution tests passed:
  - paper refinement draft creation
  - cwd-relative artifact path linting
  - lint + publish + snapshot + latest retrieval metadata
  - source fact correction re-check negative case
  - stale target revision blocking
  - synthesis refinement publish
  - internal `.drafts` target blocking
- Full unit suite passed: `PYTHONPATH=src python3 -m unittest discover -s tests` with 80 tests.
- Compile check passed: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`.
- Diff whitespace check passed: `git diff --check`.

Main wiki smoke:

- Proposed, linted, and published a real refinement against `wiki/papers/STS-Efficient-Sparse-Attention-with-Speculative-Token-Sparsity.md`.
- Draft artifacts written under `wiki/.drafts/refinements/smoke-sts-retrieval-evolution/`.
- `refinement-lint` passed with 0 findings.
- `publish-refinement` created snapshot `wiki/.versions/papers/STS-Efficient-Sparse-Attention-with-Speculative-Token-Sparsity/base-5f473a12ca.md`.
- Canonical page now has revision frontmatter and `## Evolution Notes`.
- Retrieval query `STS speculative token sparsity accepted sparse tokens verifier overhead` ranked STS first, showed revision/evolution metadata, and did not return `.versions`.
- Main wiki currently has no canonical synthesis pages, so real synthesis smoke was skipped; unit tests cover synthesis refinement and snapshot creation.

Wiki gates:

- `meridian wiki lint --wiki-root wiki` passed with one info-only pre-existing leaf-page wikilink finding.
- `meridian wiki source-audit --wiki-root wiki` passed: 238 sources, 0 missing managed files, 0 SHA mismatches, 0 duplicate SHA groups.
- `meridian wiki catalog --wiki-root wiki` succeeded: 236 catalog entries.
- Arbor process-state check passed.
- AGENTS project-map drift hook passed.

## Convergence Round

Converged.

The implementation covers the requested MVP: refinement is proposal-first, canonical publish is lint-gated, old versions are snapshotted, stale proposals are blocked, source fact corrections require re-check, and retrieval reads latest canonical pages with revision/evolution metadata while excluding `.versions`.

## Release Round

Release-ready after final git commit.
