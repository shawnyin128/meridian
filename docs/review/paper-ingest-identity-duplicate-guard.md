# Paper Ingest Identity And Duplicate Guard

## Context/Test Plan

### Context

The same user-reported ingest trace also exposed a second, separable quality
problem:

- An initial ingest produced a canonical page with an incorrect filename-derived
  identity.
- A title override rerun produced the right canonical page.
- The first wrong page and index/catalog entries remained until the agent moved
  the duplicate aside and rebuilt indexes.
- The flow could still report `Quality gate: pass` and `auto_converged` even
  while title/topic identity was visibly wrong.

This is not the same as the MCP handoff bug. Even with a perfect command packet,
the ingest layer still needs identity and duplicate safety.

### Problem

Current quality state can make a structurally complete page look completed when
the paper identity is uncertain. The flow also lacks an obvious same-source
duplicate guard when the same PDF/source hash is ingested again with a better
title.

### Recommendation

Add an identity-focused guard after the handoff repair:

- Record title/source identity confidence separately from structural quality.
- Detect same source hash/source id already mapped to a canonical paper page.
- On title override or rerun, update/replace/flag the existing canonical target
  instead of leaving duplicate pages by default.
- Make topic/routing uncertainty visible in review state or findings instead of
  hiding behind `auto_converged`.

### Acceptance Criteria

- Ingest records identity confidence or identity warnings in the run/flow
  artifact and canonical frontmatter/log where appropriate.
- Re-ingesting the same managed source cannot silently create two ordinary
  canonical paper pages without a duplicate warning or explicit replacement
  path.
- A title override replay has deterministic behavior: update the intended page,
  supersede the old slug, or stop with a clear duplicate decision.
- Structural quality pass is distinguishable from title/topic confidence.
- Index/catalog rebuild does not preserve stale duplicate entries after the
  chosen duplicate handling path.

### Test Plan

- Fixture for weak metadata/title extraction that currently falls back to a
  filename-like title.
- Fixture for same PDF/source hash ingested twice with a better title override.
- Catalog/index assertions that only the intended canonical page is normal after
  duplicate handling.
- Quality/review-state assertions that title/topic identity risk is visible.
- Retrieval smoke ensuring the correct title page is discoverable and the old
  slug is absent or marked superseded.
- Full unit suite.
- `compileall src tests`.
- `git diff --check`.
- `framework-check`.

### Decision Trace Handoff

Key decisions:

- Defer this until the handoff closure is done; otherwise agents will still hit
  command-chain friction before they can reliably exercise identity guards.
- Treat source hash/source id as the duplicate anchor, not only title slug.
- Do not claim human-level semantic review from deterministic title/topic
  heuristics.

Allowed implementation discretion:

- The implementation can choose warning-only, supersede, or replacement behavior
  after inspecting existing source registry and publish helpers.
- The first implementation can be conservative and stop/report duplicates rather
  than automatically deleting pages.

Decision invariants:

- Raw source files remain immutable.
- No silent deletion of user wiki pages.
- Duplicate handling must be auditable in log/catalog/frontmatter or a repair
  artifact.
- Identity confidence must not be conflated with source-fact correctness.
