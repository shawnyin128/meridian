# Meridian

Meridian is a Paper Wiki prototype. The first implemented path is one-paper
ingest:

```bash
meridian wiki init --wiki-root wiki
```

This creates an Obsidian-compatible Markdown vault scaffold: `papers/`,
`claims/`, `methods/`, `evidence/`, `topics/`, `syntheses/`, immutable
`raw/sources/`, generated `.index/`, draft areas, and reusable templates.

The project main vault is `wiki/`. It is intended to be opened directly in
Obsidian and is the default root for source audit, catalog, retrieval, and
write-back proposal commands. The current main-vault productization status is
tracked in `docs/main-wiki-productization-quality-brief.md`.

```bash
meridian wiki ingest /path/to/paper.pdf --out wiki/.drafts/ingests/<paper-slug>/
```

The default command creates draft-only artifacts and does not publish canonical
wiki pages, update indexes, or run the later Research Dev Agent.

When the output path is inside `wiki/.drafts/...`, Meridian treats `wiki/` as
the vault root and registers the PDF under `wiki/raw/sources/papers/` with a
hash-based source ID. The original input path is preserved in
`wiki/raw/sources/sources.jsonl`, but future wiki pages point at the managed raw
source instead of indexing arbitrary desktop/download paths.

To exercise the confidence-gated wiki path, provide a wiki root and publish
mode:

```bash
meridian wiki ingest /path/to/paper.pdf \
  --out wiki/.drafts/ingests/<paper-slug>/ \
  --wiki-root wiki \
  --publish-mode auto
```

This publishes a canonical draft paper page when the quality gate does not fail,
updates `wiki/index.md` and `wiki/log.md`, and records whether the page still
needs review.

The generated `paper.md` is intended to be a mechanism-level reading object, not
an abstract summary. It should answer: what problem the paper actually attacks,
what method objects exist, what each component consumes and produces, what
assumptions matter for implementation, what evidence backs the claims, and what
caveats should block premature promotion.

The preferred prototype path is the full flow:

```bash
meridian wiki flow /path/to/paper.pdf \
  --out wiki/.drafts/ingests/<paper-slug>/ \
  --wiki-root wiki \
  --rubric eval/rubrics/paper_wiki_quality_v0.md
```

This runs ingest, publishes a canonical draft when allowed, builds a bounded
LLM-as-Judge packet, builds a reader self-check packet, and writes `flow.json`.
The reader self-check is the mechanism-level guardrail: one reader explains the
paper from `paper.md` only, another explains it from source excerpts, and the
reconciliation must attribute mismatches to generation-mechanism buckets. The
packet also forces checklist results, comparison-dimension gaps,
frontmatter/retrieval audit, candidate-record audit, detailed weighted rubric
scores, false-confidence flags, hard-failure checks, and regression tests to add.

After a judge produces JSON, record and converge it:

```bash
meridian wiki judge-record wiki/.drafts/ingests/<paper-slug>/run.json judge-result.json
meridian wiki converge wiki/.drafts/ingests/<paper-slug>/run.json
```

To prepare an LLM-as-Judge input packet:

```bash
meridian wiki judge-pack wiki/.drafts/ingests/<paper-slug>/run.json \
  --rubric eval/rubrics/paper_wiki_quality_v0.md \
  --out wiki/.drafts/ingests/<paper-slug>/judge-packet.md
```

To prepare only the two-reader self-check packet:

```bash
meridian wiki reader-check wiki/.drafts/ingests/<paper-slug>/run.json \
  --out wiki/.drafts/ingests/<paper-slug>/reader-check.md
```

To run a JSONL evaluation set through the full flow and prepare one judge packet
per case:

```bash
meridian wiki eval eval/cases/paper_ingest_quality.example.jsonl \
  --out-dir eval/runs/<run-id>/ \
  --mode flow \
  --rubric eval/rubrics/paper_wiki_quality_v0.md
```

`--mode flow` writes per-case `flow.json`, `run.json`, `judge-packet.md`, a
case snapshot, and a shared draft wiki under `<out-dir>/wiki` unless `--wiki-root`
is provided.

After an LLM judge writes per-case results, e.g.
`eval/runs/<run-id>/<case-id>/judge-result.json`, converge the run and summarize
it:

```bash
meridian wiki eval-converge eval/runs/<run-id>/eval_manifest.json
meridian wiki eval-summary eval/runs/<run-id>/eval_manifest.json
```

Human calibration records judge quality without re-reviewing every artifact:

```bash
meridian wiki eval-calibrate eval/runs/<run-id>/eval_manifest.json \
  --case-id <case-id> \
  --human-decision agree \
  --bucket paper_model \
  --notes "Judge found the main issue."
```

## Canonical Wiki Management

Publish an existing draft run and promote candidate records into the wiki graph:

```bash
meridian wiki publish-run wiki/.drafts/ingests/<paper-slug>/run.json \
  --wiki-root wiki
```

This creates or updates:

- `wiki/papers/<paper>.md`
- `wiki/methods/*.md`
- `wiki/claims/*.md`
- `wiki/evidence/*.md`
- `wiki/topics/*.md`
- `wiki/index.md`
- `wiki/log.md`
- `wiki/.index/papers.jsonl`

Audit raw source management:

```bash
meridian wiki source-audit --wiki-root wiki
```

This checks managed PDFs in `wiki/raw/sources/papers/` against
`wiki/raw/sources/sources.jsonl` and writes both
`wiki/.index/source-audit.json` and an Obsidian-readable
`wiki/raw/sources/index.md`.

Rebuild or health-check the canonical wiki:

```bash
meridian wiki rebuild-index --wiki-root wiki
meridian wiki lint --wiki-root wiki
```

Use Obsidian CLI as a live vault navigation layer when Obsidian is open:

```bash
obsidian search query="activation outliers" limit=10
obsidian read path="papers/<paper-page>.md"
obsidian backlinks path="papers/<paper-page>.md"
```

## Retrieval v0

Canonical draft paper pages can be wrapped into a machine-readable corpus catalog:

```bash
meridian wiki catalog --wiki-root wiki
```

This scans `wiki/papers/*.md` and writes `wiki/.index/papers.jsonl`. The catalog
keeps frontmatter as the routing source of truth, plus section previews for
context-packet construction.

Retrieve research context with:

```bash
meridian wiki retrieve "I need MoE PTQ papers for activation outlier ablations" \
  --wiki-root wiki \
  --top-k 5 \
  --out wiki/.drafts/retrieval/context.md \
  --json-out wiki/.drafts/retrieval/context.json
```

The output is a ranked context packet, not a final answer. Each hit explains the
matched frontmatter fields, selected sections, and read-first snippets so an
agent can inspect the smallest useful set of wiki pages before synthesis.

Run scenario-based retrieval evaluation:

```bash
meridian wiki retrieval-eval eval/cases/wiki_retrieval_quality.example.jsonl \
  --wiki-root wiki \
  --out-dir eval/runs/<run-id>/ \
  --rubric eval/rubrics/wiki_retrieval_quality_v0.md

meridian wiki retrieval-eval-summary eval/runs/<run-id>/retrieval_manifest.json
```

Audit whether each canonical paper can be found from generated research-intent
queries:

```bash
meridian wiki retrieval-audit \
  --wiki-root wiki \
  --out-dir eval/runs/<run-id>/ \
  --top-k 5 \
  --queries-per-paper 3
```

This writes per-paper retrieval contexts plus aggregate self-recall, target-rank,
metadata-sparsity, and neighbor-reasonableness metrics.

File durable query outputs back as draft proposals:

```bash
meridian wiki propose-writeback \
  --wiki-root wiki \
  --query "I need MoE PTQ papers for activation outlier ablations" \
  --context wiki/.drafts/retrieval/context.json \
  --title "MoE PTQ Outlier Ablation Reading Plan" \
  --proposal-type synthesis
```

This writes to `wiki/.drafts/proposals/` and records the event in `wiki/log.md`;
it does not publish canonical synthesis pages.

## Testing Strategy

The wiki layer test plan lives in `docs/wiki-layer-test-strategy.md`. It covers
source management tests, canonical wiki management tests, retrieval scenario
evaluation, LLM-as-Judge rubric expectations, human calibration, and release
gates.

Retrieval quality examples and rubric:

```bash
eval/cases/wiki_retrieval_quality.example.jsonl
eval/cases/wiki_retrieval_quantization_smoke.jsonl
eval/cases/wiki_retrieval_generalization.example.jsonl
eval/rubrics/wiki_retrieval_quality_v0.md
```
