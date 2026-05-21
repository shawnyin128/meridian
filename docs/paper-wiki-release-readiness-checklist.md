# Paper Wiki Release Readiness Checklist

Run this checklist before treating the main wiki as release-ready.

## Source Management Gate

Command:

```bash
meridian wiki source-audit --wiki-root wiki
```

Expected result: 0 missing files, 0 SHA mismatches, 0 duplicate SHA groups unless documented.

Failure meaning: raw source registry or managed files are out of sync.

Repair path: rerun source registration or inspect `wiki/raw/sources/sources.jsonl`.

## Wiki Lint / Catalog Gate

Command:

```bash
meridian wiki lint --wiki-root wiki
meridian wiki catalog --wiki-root wiki
```

Expected result: lint pass and catalogs written under `wiki/.index/`.

Failure meaning: canonical wiki files, frontmatter, or generated catalogs are inconsistent.

Repair path: run targeted repair, rebuild index, and avoid editing `.drafts` as canonical state.

## Retrieval Gate

Command:

```bash
meridian wiki retrieve "KV-cache compression debugging prerequisites" --wiki-root wiki --strategy v1
```

Expected result: compiled context includes concepts/methods/syntheses/papers as appropriate.

Failure meaning: retrieval corpus, catalog, or ranking policy is stale.

Repair path: rebuild catalog and inspect `wiki/.index/*`.

## Synthesis Layer Gate

Command:

```bash
find wiki/syntheses -maxdepth 1 -type f -name '*.md' | wc -l
```

Expected result: at least 15 synthesis pages for product maturity.

Failure meaning: the wiki is still closer to a paper library than a compiled LLM Wiki.

Repair path: run proposal-first synthesis growth and publish only lint-passing pages.

## Concept Layer Gate

Command:

```bash
meridian wiki concept-audit --wiki-root wiki
```

Expected result: no source-quality contamination, no low-information concept stubs, and concept count at least 20 for product maturity.

Failure meaning: coding/debug prerequisite knowledge is missing or unsafe.

Repair path: run `propose-concept-layer`, lint, and publish low-risk concept pages/backlinks.

## Personalization Gate

Command:

```bash
meridian wiki add-insight --wiki-root wiki --paper "<paper>" --note "<note>"
meridian wiki insight-lint wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
```

Expected result: insight draft preserves raw user input and keeps it separate from source facts.

Failure meaning: user knowledge cannot safely enter the wiki.

Repair path: inspect paper matching and source-fact boundary findings.

## Evolution / Revision Gate

Command:

```bash
meridian wiki propose-refine --wiki-root wiki --target <canonical-page> --reason "<reason>" --note "<note>"
meridian wiki refinement-lint wiki/.drafts/refinements/<slug>/refinement.json --wiki-root wiki
```

Expected result: canonical targets can produce lintable refinement proposals.

Failure meaning: the wiki cannot safely evolve after feedback.

Repair path: repair target matching, revision metadata, or source-recheck requirements.

## MCP Server Gate

Command:

```bash
PYTHONPATH=src python3 -m meridian.mcp harness --wiki-root wiki --out wiki/.index/mcp-stdio-harness.json
```

Expected result: `status: pass`.

Failure meaning: MCP client registration or tool sequence is not ready.

Repair path: inspect `wiki/.index/mcp-stdio-harness.json`.

## Prompt/Skill Entry Gate

Command:

```bash
sed -n '1,220p' .codex/skills/meridian-paper-wiki/SKILL.md
```

Expected result: exactly two product workflows, `Update Wiki` and `Use Wiki`, with concise canonical examples.

Failure meaning: product entry has drifted back into command sprawl.

Repair path: consolidate guidance into the product-facing skill and keep specialist skills internal.

## Obsidian Vault Gate

Command:

```bash
test -f "wiki/Map of Content.md" && test -f "wiki/Synthesis Index.md" && test -f "wiki/Concept Index.md"
```

Expected result: navigation pages exist and link to canonical directories.

Failure meaning: the vault is hard to use directly.

Repair path: run `meridian wiki build-navigation --wiki-root wiki`.

## Artifact Boundary Gate

Command:

```bash
meridian wiki retrieve "hidden draft artifact boundary check" --wiki-root wiki --strategy v1
```

Expected result: no `.drafts` or `.versions` path appears as a retrieval result.

Failure meaning: internal artifacts leaked into the product corpus.

Repair path: inspect catalog builders and canonical directory allowlists.
