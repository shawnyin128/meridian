---
type: "quality_brief"
title: "Main Obsidian Paper Wiki Productization Quality Brief"
created: "2026-05-20"
status: "active"
---

# Main Obsidian Paper Wiki Productization Quality Brief

## Product State

The main Paper Wiki vault is now `/Users/shawn/Desktop/meridian/wiki`. It is a Markdown-first Obsidian vault with managed raw sources, canonical paper pages, candidate claim/method/evidence records, topic/method graph pages, indexes, logs, drafts, and proposal space.

Current main-vault counts:

- Managed sources: 237
- Canonical paper pages: 235
- Topic pages: 91
- Method/candidate pages: 302
- Claim pages: 1135
- Evidence pages: 2737
- Paper pages with wikilinks: 235/235

The source count is higher than canonical paper count because duplicate canonical paper states were removed after source identity collision checks. The managed source files remain in `raw/sources/` so the registry remains auditable.

## Source Management Gate

`meridian wiki source-audit --wiki-root wiki` passes:

- Missing managed files: 0
- SHA mismatches: 0
- Duplicate SHA groups: 0

The registry is `wiki/raw/sources/sources.jsonl`; the Obsidian-readable source index is `wiki/raw/sources/index.md`.

## Canonical Wiki Gate

`meridian wiki lint --wiki-root wiki` passes with 0 findings.

`meridian wiki catalog --wiki-root wiki` writes 235 catalog entries, matching the 235 canonical paper pages.

Review/convergence state:

- `auto_converged`: 234
- `source_quality_hold`: 1

All canonical pages still show `quality_gate: warn` because the full-library rebuild intentionally used `--no-page-images`. This means text/structure convergence passed, while full multimodal page-image review remains a sampled or targeted follow-up gate. The state that matters for daily wiki use is `review_state`; source-quality holds are explicitly isolated from scientific evidence.

## Graph / Obsidian State

The vault can be opened directly in Obsidian at `/Users/shawn/Desktop/meridian/wiki`.

Graph foundation:

- paper pages link to topic pages, method-family pages, and promoted candidate records via `## Wiki Graph Links`;
- topic and method-family pages link back to related papers;
- evidence promotion is capped per paper to prevent books or long reports from flooding the graph;
- `wiki/log.md` is compact and chronological rather than a full batch warning dump.

The `obsidian` CLI is installed, but CLI commands require a running Obsidian app instance. In this run the CLI could not attach to Obsidian, so validation used Markdown/frontmatter/wikilink checks plus Meridian lint/catalog/source gates.

## Retrieval Gate

Main wiki per-paper retrieval audit:

- Run: `eval/runs/2026-05-20-main-wiki-retrieval-audit`
- Papers: 235
- Queries: 705
- recall@5: 1.000
- recall@1: 0.926
- paper full-recall rate: 1.000
- average target rank: 1.105
- hard failures: 0

Domain-general idea retrieval:

- Run: `eval/runs/2026-05-20-main-wiki-idea-retrieval`
- Cases: 6
- Deterministic pass: 6
- Deterministic fail: 0

Source-quality retrieval:

- Run: `eval/runs/2026-05-20-main-wiki-source-quality-retrieval`
- Cases: 1
- Deterministic pass: 1
- Deterministic fail: 0

## Quality Delta From Expanded Library r6

Compared with `eval/runs/2026-05-20-expanded-library-r6/wiki`, the main vault rebuild reflects the newer F14 ingest improvements:

- `What To Remember` average length: 758.7 -> 595.2 chars
- noisy purpose count: 205 -> 148
- false `precision` metric pages: 103 -> 59
- semantic visual/table/equation lines: 3487 -> 4423

Residual issues remain: some pages still have long summaries, and all quality gates are warning-state because page images were skipped for the full-library rebuild. The next quality pass should target sampled multimodal re-ingest and high-impact noisy summaries, not rebuild the entire vault blindly.

## Write-Back MVP

Retrieval-to-draft write-back is available through `meridian wiki propose-writeback`. A smoke proposal was generated at:

`wiki/.drafts/proposals/Agent-Speculative-Execution-Reading-Plan/proposal.md`

This preserves the current MVP boundary: retrieval synthesis can become durable draft wiki state, but canonical synthesis publication remains a reviewed step.

## Remaining Limitations

- Obsidian CLI live navigation was not verified because Obsidian was not running.
- Full-library page images were not extracted in this rebuild; image-grounded validation is a targeted follow-up.
- Two duplicate canonical identities were cleaned from generated wiki state; future source identity checks should make this automatic before publish.
- `quality_gate` should eventually distinguish advisory text-only warnings from hard ingest warnings more explicitly.
