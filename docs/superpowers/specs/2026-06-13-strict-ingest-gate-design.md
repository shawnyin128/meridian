---
type: design
title: "Strict Paper Ingest Gate and Wiki Health Design"
status: draft
created: 2026-06-13
updated: 2026-06-13
tags:
  - paper-wiki
  - ingest
  - source-fidelity
  - health-check
confidence: high
---

# Strict Paper Ingest Gate and Wiki Health Design

## Problem

Meridian's canonical Paper Wiki must not become a holding area for uncertain or incorrect paper analysis. The current ingest flow has validation artifacts, but the important semantic checks can happen after canonical draft publication. That allows a generated page with wrong paper content to enter `wiki/papers/` before the workflow has established source fidelity.

The desired behavior is stricter: content may be slow, conservative, or even mostly source restatement, but it must not publish incorrect source facts or unsupported synthesis into the canonical wiki.

## Goals

- Make canonical paper publication quarantine-first by default.
- Publish to `wiki/papers/` only after source-fidelity validation passes.
- Keep failed, uncertain, or incomplete ingest outputs in `.drafts/ingests/`.
- Preserve managed raw source registration even when publication is blocked.
- Make blocked decisions auditable through `run.json`, `flow.json`, reports, and logs.
- Extend wiki health checks so historical canonical contamination is discoverable.
- Preserve the Markdown-first product shape without adding a database or service.

## Non-Goals

- Do not require human review for every successful ingest forever.
- Do not remove agent-executed or future API/vLLM review paths.
- Do not make draft ingest artifacts retrieval-visible.
- Do not use retrieval exclusion as a substitute for keeping unverified content out of canonical pages.
- Do not solve every paper-model quality issue in this design; this design defines the gate that prevents those issues from becoming durable wiki state.

## Product Principle

Canonical wiki pages are trusted research memory. Draft ingest artifacts are the workspace for uncertainty.

If the system can only safely restate source text, it should restate source text. If it cannot verify the restatement, it should block publication. The page should be less clever before it is less correct.

## Current Behavior Summary

The existing flow already has useful validation pieces:

- deterministic extraction and source management;
- `quality_gate` from ingest;
- `quality-self-check.json`;
- `structural-self-check.json`;
- reader and judge packet generation;
- `meridian wiki health --profile strict`.

The weak point is publication ordering. `flow` can call ingest with `publish_mode=auto`, which publishes when the basic quality gate does not fail. The richer quality and structural self-checks then run after canonical mutation. The design changes this ordering so source-fidelity review is a precondition for publication.

## Proposed Flow

Default `meridian wiki flow` becomes:

```text
PDF or managed source
  -> register immutable source
  -> extract text/page artifacts
  -> build draft paper candidate and records
  -> run deterministic ingest quality gate
  -> run structural self-check
  -> run deterministic quality self-check
  -> run source-fidelity gate
  -> publish only if all required gates pass
```

The draft run remains under:

```text
wiki/.drafts/ingests/<paper-slug>/
```

The canonical page is created only when the publish decision is `pass`.

## Gate Layers

### Extraction Gate

Purpose: decide whether the raw source is sufficient for paper understanding.

Hard blocks:

- no pages extracted;
- no meaningful text extracted;
- first useful pages are notices, covers, or source wrappers only;
- extracted text is too sparse for paper claims.

Blocked output should be a source-quality hold, not a scientific paper page.

### Structural Gate

Purpose: ensure the draft is replayable and structurally inspectable.

Required checks:

- run manifest has stable artifact paths and source-management fields;
- paper candidate frontmatter has required fields;
- required sections exist in the canonical order;
- candidate JSONL records are parseable and have required fields;
- provenance fields point to extracted pages;
- artifact role boundaries classify product, internal, debug, and validation files.

Structural pass is necessary but never sufficient for publication.

### Quality Gate

Purpose: ensure the generated page is useful enough to be a research memory candidate.

Required checks:

- `What To Remember` is concrete and mechanism-centered;
- `Mechanism` contains component contracts, not names only;
- `Evidence Map` is selective and tied to experiments, claims, tables, figures, equations, or sections;
- `Implementation Hooks` are actionable;
- retrieval intent is specific and not frontmatter duplication;
- limitations and uncertainty are concrete.

Quality pass is necessary but never sufficient for publication.

### Source-Fidelity Gate

Purpose: decide whether the generated draft is faithful to the paper.

The gate evaluates source-checkable units from the draft:

- every source fact in `What To Remember`;
- every mechanism/component statement;
- every evidence takeaway;
- every limitation stated as source-grounded;
- every wiki synthesis statement that depends on source facts.

For each unit, the gate must record:

- statement text;
- statement role: `source_fact`, `wiki_synthesis`, `uncertainty`, or `user_insight`;
- source support: page, section, excerpt, table, figure, algorithm, or equation reference;
- verdict: `supported`, `unsupported`, `contradicted`, or `insufficient_context`;
- repair bucket.

Publication is blocked if any core statement is `unsupported`, `contradicted`, or `insufficient_context`.

## Conservative Fallback

When synthesis is unsafe but source text is adequate, the ingest may generate a conservative draft candidate that mostly restates source excerpts with page provenance. This fallback is still subject to source-fidelity validation.

The fallback does not automatically publish merely because it is extractive. It publishes only if the source-fidelity gate verifies that the restatements are faithful and the resulting page still meets the minimum canonical page contract.

## State Model

Published canonical paper pages should use existing final-product status semantics where possible:

```yaml
review_state: "auto_converged"
validation_state: "source_fidelity_pass"
trust_state: "source_verified"
quality_gate: "pass"
```

Blocked draft runs should record the publication decision in `run.json` and `flow.json`:

```json
{
  "publish_decision": "blocked",
  "block_reason": "source_fidelity_needs_review",
  "canonical_wiki_mutated": false
}
```

Manual override is allowed only as an explicit exceptional path:

```yaml
review_state: "human_overrode_gate"
validation_state: "source_fidelity_not_passed"
trust_state: "manual_override"
```

Manual overrides must be visible in health reports, index/catalog state, and logs.

## CLI Behavior

### `meridian wiki flow`

Default behavior:

- registers the source;
- writes draft artifacts;
- runs required gates;
- publishes only on full pass;
- returns non-zero when the flow fails unexpectedly;
- returns zero with `publish_decision: blocked` when the system correctly quarantines an uncertain ingest.

Default output should show:

- managed source PDF;
- artifact root;
- publish decision;
- block reason when blocked;
- canonical page path only when published;
- strict health or repair command suggestion when blocked.

### Publish Modes

The current `auto` behavior should become strict auto-publication:

- `auto`: publish only after all required gates pass.
- `never`: never publish, useful for calibration and debugging.
- `always`: explicit manual override; records override state and remains health-visible.

If `always` remains available, the CLI help must make clear that it bypasses source-fidelity publication safety.

## Health Check Design

Extend `meridian wiki health --profile strict` to audit canonical trust state.

Strict health should fail or block on:

- canonical paper missing `validation_state: source_fidelity_pass`;
- canonical paper missing `trust_state: source_verified`;
- canonical paper with `review_state: needs_review`;
- manual override pages present without explicit accepted exception metadata;
- source-quality hold pages treated as scientific evidence;
- mechanism, evidence, or claim sections lacking page-level provenance;
- catalog or index entries pointing at quarantined or untrusted pages as normal papers;
- historical pages with `canonical_wiki_mutated: true` but no source-fidelity manifest.

Health output should include:

- JSON report for tooling;
- Markdown report for review;
- HTML dashboard for local inspection;
- repair plan under `.drafts/health/<run>/repair-plan.md` when requested.

The repair plan should prefer proposal-first fixes: quarantine, re-run source-fidelity checks, regenerate from source, or mark explicit manual exceptions.

## Retrieval Policy

Retrieval must treat source-fidelity state as a hard filter for scientific evidence.

Normal research retrieval should not return:

- `trust_state: manual_override`;
- `validation_state` other than `source_fidelity_pass`;
- `review_state: needs_review`;
- source-quality holds, except for cleanup/provenance queries.

Cleanup queries may retrieve source-quality holds and blocked pages, but the context packet must label them as cleanup/provenance artifacts, not evidence.

## Error Handling

Blocked publication is not a runtime error. It is a successful safety outcome.

Use distinct outcomes:

- `published`: canonical page created or updated after all gates pass.
- `blocked`: source was registered and drafts were written, but canonical publication was withheld.
- `failed`: command failed due to invalid input, missing files, invalid rubric, broken artifacts, or internal exceptions.

Every blocked outcome must name a repair bucket and the smallest next action.

## Testing Strategy

Unit tests should cover:

- source-fidelity result schema validation;
- publish decision aggregation;
- manual override frontmatter;
- strict health trust-state findings;
- retrieval filtering by trust and validation state.

CLI tests should cover:

- low-text PDF creates source-quality hold and does not publish;
- structural pass plus source-fidelity fail does not publish;
- quality pass plus source-fidelity `needs_review` does not publish;
- all gates pass publishes canonical page;
- `--publish-mode never` keeps draft-only behavior;
- `--publish-mode always` publishes with manual override state;
- strict health finds historical unverified canonical pages.

Regression tests should include at least one paper where a plausible but wrong generated statement would previously have entered canonical wiki.

## Rollout

1. Add the source-fidelity result contract and publish-decision aggregation.
2. Change `flow` ordering so canonical publication happens after all required gates.
3. Update CLI output and publish-mode help text.
4. Extend strict health trust-state checks.
5. Add regression tests for blocked publication and strict health findings.
6. Update product docs and skills to describe quarantine-first ingest.

## Open Design Choices

- Whether the first source-fidelity backend should be fully agent-executed or a hybrid deterministic prefilter plus agent-executed semantic review.
- Whether `always` should remain in the normal CLI help or be hidden behind a more explicit unsafe flag.
- Whether existing canonical pages without source-fidelity manifests should be treated as blocked immediately or as migration warnings until rechecked.

## Acceptance Criteria

- A generated paper page cannot enter `wiki/papers/` unless required gates pass.
- A blocked ingest leaves auditable draft artifacts and a clear repair path.
- Strict health finds unverified canonical paper pages.
- Retrieval does not treat unverified, overridden, or source-quality pages as scientific evidence.
- The design preserves immutable raw sources and Markdown-first canonical wiki state.
