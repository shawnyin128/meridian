# User Insight Personalization MVP

## Context/Test Plan

Feature: F19 User insight personalization MVP.

Goal: let users attach natural-language or structured paper-reading insights to canonical paper pages while preserving the boundary between paper source facts, wiki synthesis, and user insight.

Acceptance checks:

- `meridian wiki add-insight` can match canonical papers by path, title, alias, source id, or retrieval query.
- Ambiguous/no-match cases write disambiguation artifacts and block publish.
- Matched insights write `insight.md`, `insight.json`, `target_context.json`, and `publish_plan.md`.
- `insight-lint` enforces target existence, raw user input preservation, user-insight provenance, source-fact boundary, retrieval impact, and unique match.
- `publish-insight` appends to `## User Insights`, updates frontmatter, rebuilds index/catalog, and logs the event.
- Retrieval can match `User Insights` and marks it as user-supplied, not paper evidence.

Planned validation:

- Targeted unit tests for paper matching, add/lint/publish, retrieval marker, and contamination negative case.
- Full unit suite and compile checks.
- Main wiki lint/source-audit/catalog.
- Real canonical paper add/lint/publish smoke.
- Arbor process-state and AGENTS project-map drift checks.

## Developer Round

Implemented:

- Added `src/meridian/wiki/insights.py` with user insight schema, paper matching, draft generation, lint, publish, and canonical page update logic.
- Added CLI commands: `add-insight`, `insight-lint`, and `publish-insight`.
- Added `.drafts/insights` to vault scaffolding.
- Added `User Insights` to retrieval section scoring and context-packet boundary warnings.
- Added `matched_source_types` to retrieval JSON results.
- Added docs, skill, eval cases, and rubric for personalization.
- Added regression tests for exact path, title/alias, natural-language matching, ambiguity/no-match blocking, publish, retrieval, and source-fact contamination.

Developer smoke evidence:

- Targeted personalization tests passed.

## Evaluator Round

Validation replay:

- JSONL case file validated line-by-line: `eval/cases/user_insight_personalization_mvp.jsonl`.
- Targeted personalization tests passed:
  - exact canonical path insight draft creation
  - title/alias and natural-language paper matching
  - ambiguous/no-match blocking
  - insight lint + publish + retrieval user-supplied marker
  - source-fact contamination negative case
- Full unit suite passed: `PYTHONPATH=src python3 -m unittest discover -s tests`.
- Compile check passed: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`.
- Diff whitespace check passed: `git diff --check`.

Main wiki smoke:

- Added implementation-note insight to `wiki/papers/STS-Efficient-Sparse-Attention-with-Speculative-Token-Sparsity.md`.
- Draft artifacts written under `wiki/.drafts/insights/smoke-sts-routing-probe/`.
- `insight-lint` passed with 0 findings.
- `publish-insight` appended `## User Insights`, updated frontmatter, rebuilt `wiki/.index/papers.jsonl`, and appended `wiki/log.md`.
- Retrieval query `speculative token sparsity probes accepted sparse tokens verifier overhead` ranked STS first.
- Retrieval context included `Source types matched: user_insight` and the boundary warning that matched User Insights are user-supplied context, not paper source fact or scientific evidence.

Wiki gates:

- `meridian wiki lint --wiki-root wiki` passed with one info-only existing leaf-page wikilink finding.
- `meridian wiki source-audit --wiki-root wiki` passed: 238 sources, 0 missing managed files, 0 SHA mismatches, 0 duplicate SHA groups.
- `meridian wiki catalog --wiki-root wiki` succeeded: 236 catalog entries.
- Arbor process-state check passed.
- AGENTS project-map drift hook passed.

## Convergence Round

Converged.

The implementation covers the requested product boundary: insights are draft-first, linted before publish, canonicalized only into `User Insights`, and retrievable with explicit `user_insight` source typing. Negative cases block ambiguous/no-match publication and reject normalized insight text that tries to masquerade as paper source fact. Zotero remains a documented adapter boundary that will emit the same insight schema later.

## Release Round

Release-ready after final git commit.
