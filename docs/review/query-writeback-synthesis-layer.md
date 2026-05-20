# Query Write-back and Synthesis Layer MVP Review

## Context/Test Plan

Feature: F17 Query write-back and synthesis layer MVP.

Goal: extend the Paper Wiki beyond retrieval-ready paper pages so useful research queries can become durable, reviewable synthesis artifacts without blurring source facts, wiki synthesis, user ideas, uncertainty, or publish decisions.

## Acceptance Criteria

- `meridian wiki propose-writeback` creates a structured proposal directory with `proposal.md`, `proposal.json`, `source_context.json`, and `publish_plan.md`.
- Proposal schema supports `synthesis`, `comparison`, `method-family`, `decision`, and `research-question`.
- `proposal-lint` validates artifact completeness, frontmatter/body sections, provenance, source page existence, publish collisions, and source-quality hold protection.
- `publish-proposal` publishes lint-passing proposals to `wiki/syntheses/*.md` without silent overwrite.
- `catalog` and retrieval include synthesis pages while preserving paper catalog behavior.
- Published syntheses remain retrievable and marked with result type.
- Tests cover proposal generation, lint, publish, future retrieval, and source-quality guardrails.
- Docs, skills, eval cases, and rubric explain the write-back workflow and boundaries.

## Developer Round

Status: completed.

Implemented in this round:

- Upgraded write-back proposal schema to v1.
- Added source context and publish plan artifacts.
- Added `proposal-lint` and `publish-proposal` command surfaces.
- Extended catalog/retrieval to include `wiki/syntheses/*.md`.
- Added targeted unit tests for proposal generation, lint/publish, retrieval, and source-quality hold protection.

Developer self-check evidence:

- Targeted write-back tests passed:
  `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_propose_writeback_creates_draft_without_canonical_publish tests.test_cli.CliTests.test_proposal_lint_and_publish_create_retrievable_synthesis tests.test_cli.CliTests.test_proposal_lint_blocks_source_quality_hold_as_scientific_evidence`
- Full suite passed: `PYTHONPATH=src python3 -m unittest discover -s tests` (`66` tests).
- Compile passed: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`.
- Main wiki gates passed:
  `meridian wiki lint --wiki-root wiki --out /private/tmp/meridian-wiki-lint.json`,
  `meridian wiki source-audit --wiki-root wiki --out /private/tmp/meridian-source-audit.json`,
  `meridian wiki catalog --wiki-root wiki`.

## Evaluation Plan

- Run targeted write-back tests.
- Run full unit suite.
- Run compile check.
- Run wiki lint and source audit on the main vault.
- Run a smoke write-back flow in an isolated fixture via unit tests.
- Verify `git diff --check`, Arbor process-state, and AGENTS project-map drift hook.

## Evaluator Round

Independent checks performed:

- Proposal creation now writes all four required artifacts and keeps canonical wiki untouched until publish.
- Proposal lint fails publish collisions and malformed source-quality hold evidence.
- Publish writes `wiki/syntheses/<slug>.md`, rebuilds `wiki/index.md`, appends `wiki/log.md`, writes `.index/syntheses.jsonl`, and refuses silent overwrite.
- Retrieval loads papers plus syntheses by default and includes `result_type` in CLI output/context payloads.
- Source-quality holds are allowed only as cleanup/provenance context and cannot be published as scientific evidence if the guard text is removed.
- `eval/cases/wiki_writeback_mvp.jsonl` parses as JSONL and covers synthesis, method-family, user-note separation, source-quality protection, publish collision, and future synthesis retrieval.
- `git diff --check` passed.
- AGENTS drift hook passed with no missing top-level or stale mapped paths.

## Convergence Round

Converged.

The implementation satisfies the F17 acceptance criteria without adding MCP server code or Research Dev Agent behavior. Remaining future work is mostly product polish: an optional dedicated write-back eval runner could automate the JSONL cases, and future semantic retrieval backends can improve how published syntheses are ranked against paper pages.

## Release Round

Release checkpoint evidence:

- Full tests: pass.
- Compile check: pass.
- Main wiki lint/source-audit/catalog: pass.
- Arbor process-state: pass before release finalization.
- Commit: pending at review-writing time.
