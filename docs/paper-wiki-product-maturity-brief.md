# Paper Wiki Product Maturity Brief

- Date: `2026-05-21`
- Repo: `/Users/shawn/Desktop/meridian`
- Wiki root: `wiki/`
- Status: `ready for personal daily use; client-ready for local MCP stdio; residuals are non-blocking`

## Current Counts

- papers: 236
- syntheses: 30
- methods: 302
- topics: 91
- concepts: 24
- claims: 1135
- evidence: 2737

## Daily Use Readiness

Meridian is now suitable for day-to-day personal Paper Wiki usage.

The stable user path is:

- Update Wiki through the Prompt/Skill entry or MCP update/propose/apply tools.
- Use Wiki through retrieval/context, read, and trace.
- Read canonical artifacts in Obsidian under `wiki/`, especially `papers/`, `syntheses/`, `concepts/`, `methods/`, and navigation pages.

Debug/eval artifacts remain available under `.drafts/` but are no longer the product surface.

## Agent / Client Readiness

Meridian is ready to be wrapped by local agents and MCP clients that support stdio servers.

Evidence:

- Prompt/Skill entry exists: `plugins/codex/meridian/skills/wiki/SKILL.md`
- MCP server starts: `PYTHONPATH=src python3 -m meridian.mcp serve --wiki-root wiki`
- MCP client-style harness passes: `wiki/.index/mcp-stdio-harness.json`
- MCP tools expose Use Wiki and Update Wiki without requiring callers to know CLI internals.

## Synthesis Layer

The synthesis layer is now useful enough for retrieval-first workflows.

It grew from 6 pages to 30 pages and now includes:

- method-family syntheses
- topic overviews
- evidence maps
- failure-boundary summaries
- probe/implementation planning pages
- research-question pages

Residual:

- Many syntheses are scaffold-level. They are safe and useful for navigation, but the highest-used pages should be evolved into denser thesis pages as real questions recur.

## Concept Layer

The concept layer now supports coding/debug/probe workflows.

It grew from 9 pages to 24 pages and has:

- no source-quality contamination
- no low-information stubs
- source_papers on every concept
- implementation implications and minimal checks on every concept

Residual:

- Only 31 / 302 method pages have explicit prerequisite concepts. This is conservative and acceptable for MVP, but future usage should drive more links.

## Gates

Current release gates with evidence:

- source audit: expected to pass
- wiki lint/catalog: expected to pass
- concept audit: warn with documented residuals, no hard failures
- final product check: warn with no deterministic hard findings
- MCP harness: pass
- artifact boundary: MCP read blocks `.drafts`

## Remaining Non-Blockers

- Consolidate paper-specific method candidates further so retrieval has fewer low-value method records.
- Evolve high-use synthesis pages from scaffolds into denser cross-paper theses.
- Expand concept prerequisites based on actual coding/debug misses.
- Add optional semantic retrieval backend for harder cross-domain queries.
- Validate MCP config inside each target client UI after local stdio registration.
