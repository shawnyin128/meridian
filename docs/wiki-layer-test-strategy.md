---
type: test_strategy
title: "Paper Wiki Layer Test Strategy"
status: draft
created: 2026-05-20
updated: 2026-05-20
tags:
  - paper-wiki
  - llm-wiki
  - retrieval
  - evaluation
confidence: medium
---

# Paper Wiki Layer Test Strategy

## Purpose

This strategy tests whether Meridian can maintain a useful Paper Wiki, not only whether it can summarize a PDF. The target behavior is:

1. raw paper sources are managed as immutable, replayable source state;
2. canonical Markdown pages are valid, linked, indexed, and auditable;
3. retrieval returns the right papers and sections for realistic research tasks;
4. judge and human calibration loops catch quality failures before they become durable wiki drift.

The testing scheme therefore has three layers: deterministic contract tests, end-to-end wiki-flow tests, and scenario-based retrieval quality evaluation.

## Testing Principles

- Test the compiled wiki state, not just one generated file.
- Treat frontmatter as the machine-routing source of truth and body prose as the human reading target.
- Prefer outcome properties over single exact paths in evaluation cases.
- Keep source facts, wiki synthesis, and user ideas separately inspectable.
- Make every failure bucket actionable: source management, schema, paper model, promotion, retrieval, judge, or human calibration.
- Promote only tests that protect repeated workflow behavior; avoid one-paper patches that do not generalize.

## Test Layers

| Layer | Scope | Owner | Frequency | Failure meaning |
| --- | --- | --- | --- | --- |
| Unit contracts | frontmatter, source registry, catalog records, scorer helpers, lint findings | deterministic tests | every commit | code/schema regression |
| CLI integration | `init -> ingest -> publish-run -> source-audit -> rebuild-index -> catalog -> retrieve -> lint` | deterministic tests | every commit | workflow contract broken |
| Golden artifacts | Markdown sections, JSONL schemas, context-packet schema, no redundant source blocks | deterministic tests | every schema change | artifact drift |
| Retrieval scenarios | realistic research requests over canonical wiki pages | deterministic metrics plus LLM judge | before retrieval releases | wiki is not useful for research tasks |
| Judge calibration | judge packet usefulness and rubric agreement | LLM judge plus sampled human review | after rubric or ingest changes | judge is too lenient, harsh, or misaligned |
| Library regression | full Zotero-style library or broad calibration set | batch evaluation | after major ingest/retrieval changes | poor generalization |

## Source Management Tests

These tests protect the raw-source layer.

- `wiki init` creates `raw/sources/`, `raw/sources/papers/`, `raw/sources/sources.jsonl`, and Obsidian-compatible wiki directories.
- `wiki ingest` inside `wiki/.drafts/` registers the PDF under managed `raw/sources/papers/` without mutating the original PDF.
- Duplicate PDFs resolve to the same content-derived `source_id` and do not create conflicting registry rows.
- `source-audit` reports missing managed files, hash mismatches, orphan managed PDFs, and registry parse errors.
- Low-quality extraction produces a source-quality hold rather than scientific claims.
- Draft-only ingest must not update `wiki/index.md`, canonical pages, or `.index/papers.jsonl`.

Minimum deterministic cases:

- fresh vault init;
- first managed PDF;
- duplicate managed PDF;
- unmanaged legacy run published into a wiki;
- missing managed PDF;
- intentionally corrupted managed PDF;
- scanned/low-text PDF hold.

## Canonical Wiki Management Tests

These tests protect the compiled Markdown layer.

- `publish-run` creates or updates canonical draft `papers/` pages with valid YAML frontmatter.
- Candidate method, claim, evidence, and topic records are promoted into separate draft pages without becoming overconfident wiki truth.
- Promoted pages link back to the paper page and preserve provenance or artifact pointers.
- `rebuild-index` deterministically regenerates `wiki/index.md` and `.index/papers.jsonl`.
- `lint` flags missing frontmatter, missing source references, invalid links, orphan pages, stale generated indexes, and claim pages without provenance.
- Publish is idempotent: running the same `publish-run` twice does not duplicate log entries, registry rows, or candidate pages beyond intentional update timestamps.

Golden artifact checks should assert that canonical `paper.md` pages include:

- frontmatter with `source_id`, `source_pdf`, `source_registry`, `topics`, `methods`, `settings`, `aliases`, `claims`, `confidence`, and `review_state`;
- `What To Remember`;
- `When To Retrieve This Paper`;
- `Mechanism`;
- `Mechanism Details To Verify`;
- `Evidence Map`;
- `Implementation Hooks`;
- `Limitations / Uncertainty`;
- `Candidate Records`.

Golden checks should also reject body sections that duplicate frontmatter as a second metadata source, especially old `Source`, `Retrieval Anchors`, or boilerplate `Retrieval Notes` blocks.

## Retrieval Scenario Evaluation

Retrieval must be tested with plausible standalone research requests. A good retrieval test is not "can I find CodeQuant by asking for CodeQuant?" It should ask whether the wiki can support a researcher's next action.

Required scenario families:

- Idea/design comparison: find papers relevant to a possible method direction.
- Implementation/probe: find pages with code-level hooks, ablations, or sanity checks.
- Evidence check: find papers whose claims are backed by the right metrics, baselines, datasets, or system evidence.
- Scope/limitation check: find papers whose assumptions break under a target setting.
- Cross-paper synthesis: retrieve complementary and conflicting mechanisms across a subfield.
- Source-quality cleanup: find papers that should not be trusted until OCR, metadata, or provenance is fixed.
- Research-dev bridge: retrieve papers before implementing a baseline, reproduction, or experimental probe.

Each retrieval case should define:

- a realistic standalone query;
- intent type;
- required pages or page families;
- acceptable adjacent pages;
- distractor pages that should not dominate the top results;
- required sections to surface first;
- expected context-packet properties;
- forbidden behavior;
- judge rubric dimensions.

The retrieval evaluator should score the context packet before any final synthesis answer. A final answer can look good even when retrieval selected the wrong evidence.

## Retrieval Metrics

Use deterministic metrics where the expected set is known:

- `required_recall_at_k`: required pages or page families appearing in top-k.
- `distractor_precision_at_k`: top-k not dominated by declared distractors.
- `section_hit_rate`: required sections appear in `Read first`.
- `source_quality_routing`: source-quality holds are routed as cleanup work, not evidence.
- `frontmatter_match_explainability`: matched fields are meaningful and not only title overlap.
- `context_compactness`: packet stays small enough for an agent to inspect before synthesis.

Use LLM-as-Judge for qualitative dimensions:

- intent interpretation;
- page selection rationale;
- section selection usefulness;
- evidence/synthesis/user-idea separation;
- uncertainty and gap reporting;
- whether the packet helps decide the next research action.

## LLM-as-Judge Rubric

Retrieval judge packets should include:

- case JSON snapshot;
- query and intent;
- context packet Markdown and JSON;
- top-k paper pages or selected sections;
- source-audit and lint summary when relevant;
- expected outcome properties and declared distractors.

The judge must not score the final answer only. It scores whether the retrieval packet gives a future agent the right reading plan.

Judge decisions:

- `pass`: packet is useful and no blocking issue exists;
- `needs_refine`: packet is useful but misses an important page, section, or boundary;
- `fail`: packet would mislead the research workflow or hide a source/provenance problem.

Blocking issues:

- a source-quality hold is treated as scientific evidence;
- a title/alias-only hit outranks more relevant mechanism pages without explanation;
- required paper family is absent from top-k when the query clearly asks for it;
- context packet collapses source facts and wiki synthesis;
- packet omits provenance or review state for evidence-heavy tasks;
- invalid JSON or Markdown prevents downstream use.

## Human Calibration

Human review should calibrate the judge, not re-review every paper from scratch.

Initial calibration:

- 20-30 retrieval scenarios across the user's real library;
- human marks judge agreement, missed papers, over-retrieval, under-retrieval, and bad rationale;
- every disagreement becomes either a rubric update, retrieval scoring update, ingest metadata update, or a new regression case.

Steady-state calibration:

- review all `fail` cases;
- sample 1 in 5 `pass` cases while the wiki is young;
- sample lower once judge-human agreement is stable;
- always review high-impact synthesis, user-annotation conflicts, and source-quality edge cases.

## Evaluation Artifacts

Recommended files:

- `eval/cases/wiki_retrieval_quality.example.jsonl`: scenario case examples.
- `eval/rubrics/wiki_retrieval_quality_v0.md`: retrieval judge rubric.
- `eval/runs/<run-id>/retrieval_manifest.json`: run manifest.
- `eval/runs/<run-id>/<case-id>/context.md`: retrieved context packet.
- `eval/runs/<run-id>/<case-id>/context.json`: machine-readable retrieval result.
- `eval/runs/<run-id>/<case-id>/judge-packet.md`: bounded judge input.
- `eval/runs/<run-id>/<case-id>/judge-result.json`: judge output.
- `eval/runs/<run-id>/human_calibration.jsonl`: sampled human calibration.

## Release Gates

Before retrieval is considered usable:

- at least 50 curated retrieval cases;
- `required_recall_at_5 >= 0.90` on cases with declared required pages;
- `section_hit_rate >= 0.85`;
- average judge score >= 4.5;
- minimum judge score >= 4.0 except explicitly allowed source-quality holds;
- zero blocking source/provenance failures;
- no source-quality hold mistaken for scientific evidence.

Before the wiki layer is considered stable:

- unit and CLI integration tests pass;
- `source-audit` has zero missing or hash-mismatch errors on the target wiki;
- `lint` has zero errors and only accepted warnings;
- catalog rebuild is deterministic;
- publish-run is idempotent on replay cases;
- retrieval examples use plausible standalone queries, not target-paper-aware prompts.

## Immediate Implementation Plan

Implemented v0:

- `meridian wiki retrieval-eval` executes `catalog` and `retrieve` per retrieval case, writes context packets, writes judge packets, and computes deterministic metrics.
- `meridian wiki retrieval-eval-summary` aggregates deterministic metrics plus optional per-case `judge-result.json` files.
- `meridian wiki retrieval-audit` audits every canonical paper with generated research-intent queries and writes per-query context packets plus aggregate self-recall/neighbor metrics.
- `eval/cases/wiki_retrieval_quantization_smoke.jsonl` runs a representative quantization retrieval smoke set over the current canonical calibration wiki.
- `eval/cases/wiki_retrieval_generalization.example.jsonl` defines broader alignment/RLHF, agent tool-use, audio-language, survey/synthesis, and source-quality cleanup scenarios.
- Unit coverage now includes generalized cross-domain retrieval fixtures and source-quality cleanup routing, so retrieval eval is not only validated on quantization examples.
- `docs/retrieval-smoke-quality-brief.md` records the first smoke result and remaining gaps.
- `docs/real-library-retrieval-audit-brief.md` records the first per-paper audit over the current real canonical wiki.

Next implementation steps:

1. Add deterministic tests for duplicate source registration, source-audit failure modes, publish idempotency, and stale catalog detection.
2. Improve generated `evidence_scope` audit queries by including mechanism discriminators when datasets/metrics are too common.
3. Turn the generalized example cases into a real broad canonical fixture built from the user's library, then run them as a tracked smoke suite.
4. Record LLM-as-Judge outputs for retrieval eval packets and calibrate against sampled human review.
5. Convert every retrieval miss into a controlled vocabulary, scoring, or ingest metadata regression.

## Non-Goals

- Do not introduce a vector database before lexical/frontmatter retrieval failure modes are measured.
- Do not require human approval for every ingest or retrieval.
- Do not optimize for a single paper title query.
- Do not judge retrieval solely by final answer fluency.
